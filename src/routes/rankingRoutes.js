// routes/rankingRoutes.js - FUNÇÃO CORRIGIDA
const express = require("express");
const User = require("../models/User");
const auth = require("../middleware/auth");
const path = require("path");
const fs = require("fs");

const gcsService = require("../services/gcsService");

const router = express.Router();

// ========== FUNÇÃO AUXILIAR CORRIGIDA PARA TRATAR FOTO DO PERFIL ==========
/**
 * Processa dados do usuário para incluir profilePhotoUrl correto
 * CORREÇÃO: Verifica se o arquivo realmente existe antes de retornar URL
 */
// routes/rankingRoutes.js

/**
 * Processa dados do usuário para incluir profilePhotoUrl correto usando GCS.
 * CORREÇÃO CRÍTICA: Usa gcsService para gerar URL e verificar existência no GCS.
 * * @param {object} user - Objeto do usuário (Model User)
 * @returns {Promise<string|null>} URL pública da foto ou null
 */
async function processUserProfilePhoto(user) {
  // A URL base local não é mais necessária para GCS, então removemos o parâmetro `baseUrl`.

  // 1. Verificar se o usuário tem a referência no banco de dados
  if (user.profilePhoto && user.profilePhoto.filename) {
    const filename = user.profilePhoto.filename;

    try {
      // 2. Usar o serviço GCS para verificar se o arquivo existe (Assíncrono!)
      const fileExistsInGCS = await gcsService.fileExists(filename);

      if (fileExistsInGCS) {
        // 3. Se o arquivo existe no GCS, gerar a URL pública
        const publicUrl = gcsService.getPublicUrl(filename);

        // Log para confirmar que a foto GCS foi usada
        // console.log(`✅ Foto GCS encontrada: ${publicUrl}`);
        return publicUrl;
      } else {
        // 4. Se não existe no GCS, logar aviso e limpar o campo no banco
        console.log(
          `⚠️ Arquivo não encontrado no GCS: ${filename} - removendo referência`
        );

        // Limpar referência inválida do banco de dados (Mantendo a lógica de limpeza)
        setImmediate(async () => {
          try {
            await User.findByIdAndUpdate(user._id, {
              $unset: { profilePhoto: 1 },
            });
            console.log(
              `🗑️ Referência de foto inválida removida do usuário ${user._id}`
            );
          } catch (error) {
            console.error(
              `❌ Erro ao limpar referência GCS inválida: ${error.message}`
            );
          }
        });

        return null;
      }
    } catch (error) {
      // Em caso de falha de conexão com o GCS ou outro erro, retorna null.
      // NÃO APAGA a referência do BD, pois o problema pode ser temporário.
      console.error(
        `❌ Erro ao verificar arquivo GCS ${filename}: ${error.message}`
      );
      return null;
    }
  }

  // Bloco de fallback para URLs externas (mantido por segurança)
  if (user.profilePhotoUrl && user.profilePhotoUrl.startsWith("http")) {
    return user.profilePhotoUrl;
  }

  // Se tem profilePhotoUrl já definido (virtual), validar se é uma URL externa válida
  if (user.profilePhotoUrl) {
    // Se for URL externa (http/https), retornar como está
    if (user.profilePhotoUrl.startsWith("http")) {
      return user.profilePhotoUrl;
    }

    // Se for caminho local, verificar se existe
    if (user.profilePhotoUrl.includes("/uploads/")) {
      const filename = path.basename(user.profilePhotoUrl);
      const uploadsDir = path.join(__dirname, "../uploads/profiles");
      const filePath = path.join(uploadsDir, filename);

      if (fs.existsSync(filePath)) {
        return user.profilePhotoUrl;
      } else {
        console.log(`⚠️ Arquivo virtual não encontrado: ${filename}`);
        return null;
      }
    }
  }

  // CORREÇÃO: Retorna null explicitamente para usuários sem foto
  // console.log(
  //   `📝 Usuário ${
  //     user.name || user._id
  //   } sem foto de perfil - usando avatar com iniciais`
  // );
  return null;
}

/**
 * NOVA FUNÇÃO: Validar e limpar referências de fotos inválidas em lote
 */
async function cleanInvalidPhotoReferences() {
  try {
    console.log("🧹 Iniciando limpeza de referências de fotos inválidas...");

    const usersWithPhotos = await User.find({
      "profilePhoto.filename": { $exists: true },
    }).select("_id profilePhoto name");

    const uploadsDir = path.join(__dirname, "../uploads/profiles");
    let cleanedCount = 0;

    for (const user of usersWithPhotos) {
      if (user.profilePhoto && user.profilePhoto.filename) {
        const filePath = path.join(uploadsDir, user.profilePhoto.filename);

        if (!fs.existsSync(filePath)) {
          await User.findByIdAndUpdate(user._id, {
            $unset: { profilePhoto: 1 },
          });
          cleanedCount++;
          console.log(
            `🗑️ Referência inválida removida: ${user.name} - ${user.profilePhoto.filename}`
          );
        }
      }
    }

    console.log(
      `✅ Limpeza concluída: ${cleanedCount} referências inválidas removidas`
    );
  } catch (error) {
    console.error(`❌ Erro durante limpeza: ${error.message}`);
  }
}

/**
 * Formata dados do usuário para resposta da API - VERSÃO CORRIGIDA
 */
async function formatUserForRanking(user, rank = null, baseUrl = null) {
  // 🏆 CORREÇÃO CRÍTICA: Use 'await' aqui e torne a função 'async'
  const photoUrl = await processUserProfilePhoto(user, baseUrl);

  const formattedUser = {
    _id: user._id,
    id: user._id,
    name: user.name,
    fullName: user.fullName || user.name,
    displayName: user.fullName || user.name,
    username: user.username,
    avatar: user.avatar,
    // Atribua o resultado resolvido da Promise
    profilePhotoUrl: photoUrl,
    coins: user.coins,
    balance: user.coins, // Compatibilidade com frontend
    level: user.level,
    totalDonated: user.totalDonated || 0,
    totalReceived: user.totalReceived || 0,
    createdAt: user.createdAt,
  };

  if (rank !== null) {
    formattedUser.rank = rank;
  }

  // Log para debug (apenas em desenvolvimento)
  if (process.env.NODE_ENV === "development") {
    const hasPhoto = formattedUser.profilePhotoUrl ? "📷" : "👤";
    // console.log(
    //   `${hasPhoto} Usuário formatado: ${formattedUser.displayName} - Foto: ${
    //     formattedUser.profilePhotoUrl || "sem foto"
    //   }`
    // );
  }

  return formattedUser;
}

// ========== ROTA PARA LIMPEZA MANUAL (DESENVOLVIMENTO) ==========
/**
 * POST /api/ranking/clean-photos
 * Limpa referências de fotos inválidas (apenas em desenvolvimento)
 */
router.post("/clean-photos", auth, async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({
      success: false,
      message: "Operação disponível apenas em desenvolvimento",
    });
  }

  try {
    await cleanInvalidPhotoReferences();
    res.json({
      success: true,
      message: "Limpeza de referências inválidas concluída",
    });
  } catch (error) {
    console.error("Erro na limpeza:", error);
    res.status(500).json({
      success: false,
      message: "Erro durante limpeza",
    });
  }
});

// ========== MIDDLEWARE PARA VERIFICAR UPLOADS DIRECTORY ==========
/**
 * Garante que o diretório de uploads existe
 */
function ensureUploadsDirectory() {
  const uploadsDir = path.join(__dirname, "../uploads/profiles");

  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log("📁 Diretório de uploads criado:", uploadsDir);
    } catch (error) {
      console.error("❌ Erro ao criar diretório de uploads:", error.message);
    }
  }
}

// Garantir diretório existe na inicialização
ensureUploadsDirectory();

// ========== ROTA PRINCIPAL DO RANKING - CORRIGIDA ==========
router.get("/", auth, async (req, res) => {
  try {
    const { limit = 100, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Buscar usuários ativos ordenados por coins - INCLUINDO profilePhoto
    const users = await User.find({ status: "active" })
      .select(
        "name fullName username avatar coins level totalDonated totalReceived createdAt profilePhoto"
      )
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Contar total de usuários para paginação
    const totalUsers = await User.countDocuments({ status: "active" });

    // Encontrar posição do usuário atual no ranking global
    const currentUserRank =
      (await User.countDocuments({
        status: "active",
        $or: [
          { coins: { $gt: req.user.coins } },
          {
            coins: req.user.coins,
            totalDonated: { $gt: req.user.totalDonated },
          },
          {
            coins: req.user.coins,
            totalDonated: req.user.totalDonated,
            createdAt: { $lt: req.user.createdAt },
          },
        ],
      })) + 1;

    // CORREÇÃO: Aplicar formatação com validação de fotos
    const usersWithRank = users.map((user, index) => {
      return formatUserForRanking(user, skip + index + 1, baseUrl);
    });

    // Buscar dados completos do usuário atual incluindo foto
    const currentUserWithPhoto = await User.findById(req.user._id).select(
      "name fullName username avatar coins level totalDonated totalReceived createdAt profilePhoto"
    );

    const currentUserFormatted = formatUserForRanking(
      currentUserWithPhoto,
      currentUserRank,
      baseUrl
    );

    res.json({
      success: true,
      data: {
        users: usersWithRank,
        totalUsers,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        currentUserRank,
        currentUser: currentUserFormatted,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar ranking:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ========== TOP 10 DO RANKING - CORRIGIDO ==========
// Se formatUserForRanking está corrigida, a rota deve ser assim:
// routes/rankingRoutes.js - ROTA /top10 CORRIGIDA
router.get("/top10", auth, async (req, res) => {
  try {
    // ⚠️ Removido: baseUrl não é mais usado se processUserProfilePhoto foi corrigida para GCS

    // É uma boa prática usar .lean() para performance, pois você está mapeando os objetos
    const topUsers = await User.find({ status: "active" })
      .select(
        "name fullName username avatar coins level totalDonated profilePhoto"
      )
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .limit(10)
      .lean();

    // 🏆 CORREÇÃO CRÍTICA: Use Promise.all() + map(async)
    const usersWithRank = await Promise.all(
      topUsers.map((user, index) => {
        // Agora, o await é necessário dentro do map
        return formatUserForRanking(user, index + 1);
      })
    );

    res.json({
      success: true,
      data: usersWithRank,
    });
  } catch (error) {
    console.error("Erro ao buscar top 10:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar top 10",
    });
  }
});

// ========== POSIÇÃO ESPECÍFICA DO USUÁRIO - CORRIGIDA ==========

// routes/rankingRoutes.js - ROTA /my-position CORRIGIDA E COMPLETA
// routes/rankingRoutes.js - ROTA /my-position COMPLETA E CORRIGIDA
router.get("/my-position", auth, async (req, res) => {
  try {
    // 1. Buscar usuário completo (necessário para profilePhoto)
    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuário não encontrado" });
    }

    // 2. Cálculo do Ranque (seu código está OK)
    const rank =
      (await User.countDocuments({
        status: "active",
        $or: [
          { coins: { $gt: user.coins } },
          { coins: user.coins, totalDonated: { $gt: user.totalDonated } },
          {
            coins: user.coins,
            totalDonated: user.totalDonated,
            createdAt: { $lt: user.createdAt },
          },
        ],
      })) + 1;

    const totalUsers = await User.countDocuments({ status: "active" });

    // 3. 🏆 CORREÇÃO CRÍTICA: Use await para formatar o usuário
    const formattedUser = await formatUserForRanking(user, rank);

    // 4. Retornar a resposta completa
    res.json({
      success: true,
      data: {
        myPosition: rank,
        totalUsers,
        user: formattedUser,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar posição do usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar posição do usuário",
    });
  }
});

// As demais rotas permanecem iguais...
// ========== RANKING POR PROXIMIDADE - CORRIGIDO ==========
router.get("/around-me", auth, async (req, res) => {
  try {
    const { range = 5 } = req.query;
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Calcular posição atual
    const currentRank =
      (await User.countDocuments({
        status: "active",
        $or: [
          { coins: { $gt: req.user.coins } },
          {
            coins: req.user.coins,
            totalDonated: { $gt: req.user.totalDonated },
          },
        ],
      })) + 1;

    const skip = Math.max(0, currentRank - parseInt(range) - 1);
    const limit = parseInt(range) * 2 + 1;

    const users = await User.find({ status: "active" })
      .select(
        "name fullName username avatar coins level totalDonated profilePhoto"
      )
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const usersWithRank = users.map((user, index) => {
      const formattedUser = formatUserForRanking(
        user,
        skip + index + 1,
        baseUrl
      );
      formattedUser.isCurrentUser =
        user._id.toString() === req.user._id.toString();
      return formattedUser;
    });

    res.json({
      success: true,
      data: {
        users: usersWithRank,
        currentUserRank: currentRank,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar ranking por proximidade:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar ranking",
    });
  }
});

// ========== ESTATÍSTICAS DO RANKING ==========
router.get("/stats", auth, async (req, res) => {
  try {
    const stats = await User.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalCoins: { $sum: "$coins" },
          avgCoins: { $avg: "$coins" },
          maxCoins: { $max: "$coins" },
          minCoins: { $min: "$coins" },
          totalDonated: { $sum: "$totalDonated" },
          avgDonated: { $avg: "$totalDonated" },
        },
      },
    ]);

    const levelDistribution = await User.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: "$level",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        general: stats[0] || {},
        levelDistribution,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar estatísticas",
    });
  }
});

module.exports = router;
