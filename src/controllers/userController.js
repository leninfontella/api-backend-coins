const User = require("../models/User");

// Obter dados completos do usuário logado
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // CORREÇÃO: Estrutura compatível com frontend
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          fullName: user.fullName || user.name, // CORREÇÃO: Garantir nome completo
          displayName: user.fullName || user.name, // Adicionar displayName
          email: user.email,
          coins: user.coins,
          balance: user.coins, // Compatibilidade
          level: user.level,
          totalDonated: user.totalDonated || 0,
          totalReceived: user.totalReceived || 0,
          avatar: user.avatar || null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Erro ao obter perfil:", error);
    next(error);
  }
};

// CORREÇÃO: Retornar 'coins' com estrutura consistente
exports.getBalance = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id, "coins");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // CORREÇÃO: Retornar estrutura compatível com frontend
    res.json({
      success: true,
      coins: user.coins, // Frontend procura por 'coins'
      data: {
        balance: user.coins, // Manter compatibilidade
        coins: user.coins,
      },
    });
  } catch (error) {
    console.error("Erro ao obter saldo:", error);
    next(error);
  }
};

// Atualizar saldo do usuário
exports.updateBalance = async (req, res, next) => {
  try {
    const { amount, operation, type, description } = req.body;

    // CORREÇÃO: Aceitar tanto 'operation' quanto 'type' para compatibilidade
    const operationType = operation || type;

    // Validações
    if (typeof amount !== "number") {
      return res.status(400).json({
        success: false,
        message: "Quantidade deve ser um número",
      });
    }

    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: "Quantidade deve ser diferente de zero",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // CORREÇÃO: Tratar valores negativos corretamente
    let finalAmount = amount;

    // Se o tipo é 'subtract' ou amount é negativo, garantir que seja negativo
    if (operationType === "subtract" || amount < 0) {
      finalAmount = -Math.abs(amount);
    } else if (operationType === "add") {
      finalAmount = Math.abs(amount);
    }

    // Verificar se o saldo não ficará negativo para operações de subtração
    if (finalAmount < 0 && user.coins < Math.abs(finalAmount)) {
      return res.status(400).json({
        success: false,
        message: "Saldo insuficiente",
      });
    }

    // Atualizar saldo
    user.coins += finalAmount;

    // Atualizar estatísticas baseadas no tipo de operação
    if (finalAmount < 0) {
      user.totalDonated = (user.totalDonated || 0) + Math.abs(finalAmount);
    } else {
      user.totalReceived = (user.totalReceived || 0) + finalAmount;
    }

    await user.save();

    // Log da transação para auditoria
    console.log(
      `💰 Saldo atualizado - Usuário: ${
        user.fullName || user.name
      }, Valor: ${finalAmount}, Novo saldo: ${user.coins}`
    );

    // CORREÇÃO: Retornar estrutura compatível
    res.json({
      success: true,
      message: "Saldo atualizado com sucesso",
      data: {
        coins: user.coins,
        balance: user.coins, // Compatibilidade
        level: user.level,
        totalDonated: user.totalDonated || 0,
        totalReceived: user.totalReceived || 0,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar saldo:", error);
    next(error);
  }
};

// Obter estatísticas do usuário (para dashboard)
exports.getStats = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Calcular algumas estatísticas interessantes
    const stats = {
      coins: user.coins,
      level: user.level,
      totalDonated: user.totalDonated || 0,
      totalReceived: user.totalReceived || 0,
      netBalance: user.coins,
      donationRank: await getDonationRank(user.totalDonated || 0),
      coinsRank: await getCoinsRank(user.coins),

      // CORREÇÃO: Adicionar campos que o frontend espera
      totalEarned: user.coins + (user.totalDonated || 0), // Total que já passou pelas mãos
      bonusCoins: Math.floor(user.coins * 0.1), // Simulado - 10% como bônus
      monthlyCoins: Math.floor(user.coins * 0.15), // Simulado - 15% como ganho mensal
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Erro ao obter estatísticas:", error);
    next(error);
  }
};

// Obter dados de um usuário específico pelo ID
exports.getUserById = async (req, res, next) => {
  try {
    const userId = req.params.userId;

    const user = await User.findById(userId).select(
      "name fullName email username coins level avatar totalDonated totalReceived createdAt updatedAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          fullName: user.fullName || user.name,
          displayName: user.fullName || user.name,
          email: user.email,
          username: user.username,
          coins: user.coins,
          level: user.level,
          totalDonated: user.totalDonated || 0,
          totalReceived: user.totalReceived || 0,
          avatar: user.avatar || null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar usuário por ID:", error);
    next(error);
  }
};

// CORREÇÃO: Buscar usuários para sistema de doação
exports.searchUsers = async (req, res, next) => {
  try {
    console.log("🔍 Iniciando busca de usuários...");
    console.log("👤 Usuário logado:", req.user);
    console.log("🔗 Query params:", req.query);

    const { query, q, page = 1, limit = 10 } = req.query;
    const searchQuery = query || q;

    // Validação da query
    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        message: "Parâmetro de busca é obrigatório",
        debug: "Missing 'query' or 'q' parameter",
      });
    }

    if (searchQuery.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Query deve ter pelo menos 2 caracteres",
      });
    }

    console.log(`🔍 Buscando por: "${searchQuery}"`);

    const searchRegex = new RegExp(searchQuery.trim(), "i");
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // 🔍 CORREÇÃO: Busca mais robusta
    const users = await User.find({
      $and: [
        { _id: { $ne: req.user.id } }, // Excluir usuário atual
        {
          $or: [
            { name: searchRegex },
            { fullName: searchRegex }, // CORREÇÃO: Incluir fullName
            { email: searchRegex },
            { username: searchRegex },
          ],
        },
      ],
    })
      .select(
        "name fullName email username coins level avatar totalDonated totalReceived createdAt"
      )
      .limit(limitNum)
      .skip(skip)
      .sort({ name: 1 }); // Ordenar por nome

    console.log(`✅ Encontrados ${users.length} usuários`);

    // 🔍 CORREÇÃO: Formatar dados para o frontend
    const formattedUsers = users.map((user) => ({
      id: user._id.toString(),
      name: user.fullName || user.name || "Usuário Anônimo", // CORREÇÃO: Priorizar fullName
      fullName: user.fullName || user.name,
      displayName: user.fullName || user.name,
      username: user.username || user.email || "sem-username",
      email: user.email,
      avatar: user.avatar || "👤",
      coins: user.coins || 0,
      level: user.level || 1,
      levelText: `Nível ${user.level || 1}`,
      totalDonated: user.totalDonated || 0,
      totalReceived: user.totalReceived || 0,
      institution: "Instituição Exemplo", // TODO: Adicionar campo no modelo
      joinDate: user.createdAt
        ? user.createdAt.toISOString().split("T")[0]
        : null,
    }));

    // Total de resultados (para paginação)
    const totalResults = await User.countDocuments({
      $and: [
        { _id: { $ne: req.user.id } },
        {
          $or: [
            { name: searchRegex },
            { fullName: searchRegex }, // CORREÇÃO: Incluir fullName
            { email: searchRegex },
            { username: searchRegex },
          ],
        },
      ],
    });

    const response = {
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalResults,
          pages: Math.ceil(totalResults / limitNum),
          hasNext: skip + limitNum < totalResults,
          hasPrev: pageNum > 1,
        },
      },
      debug: {
        searchQuery: searchQuery,
        foundUsers: users.length,
        totalResults: totalResults,
      },
    };

    console.log("✅ Busca concluída com sucesso");
    res.json(response);
  } catch (error) {
    console.error("❌ Erro na busca de usuários:", error);
    next(error);
  }
};

// CORREÇÃO: Processar doações
exports.donateCoins = async (req, res, next) => {
  try {
    const { recipientId, amount, message } = req.body;

    // Validações
    if (!recipientId || !amount) {
      return res.status(400).json({
        success: false,
        message: "ID do destinatário e quantidade são obrigatórios",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantidade deve ser maior que zero",
      });
    }

    // Buscar usuários
    const [donor, recipient] = await Promise.all([
      User.findById(req.user.id),
      User.findById(recipientId),
    ]);

    if (!donor) {
      return res.status(404).json({
        success: false,
        message: "Usuário doador não encontrado",
      });
    }

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Usuário destinatário não encontrado",
      });
    }

    // Verificar saldo
    if (donor.coins < amount) {
      return res.status(400).json({
        success: false,
        message: "Saldo insuficiente",
      });
    }

    // Processar transação
    donor.coins -= amount;
    donor.totalDonated = (donor.totalDonated || 0) + amount;

    recipient.coins += amount;
    recipient.totalReceived = (recipient.totalReceived || 0) + amount;

    // Salvar ambos os usuários
    await Promise.all([donor.save(), recipient.save()]);

    // Log da transação
    console.log(
      `Doação processada - ${donor.fullName || donor.name} -> ${
        recipient.fullName || recipient.name
      }: ${amount} moedas`
    );

    res.json({
      success: true,
      message: `Doação de ${amount} moedas realizada com sucesso!`,
      data: {
        donor: {
          coins: donor.coins,
          totalDonated: donor.totalDonated,
        },
        recipient: {
          name: recipient.fullName || recipient.name,
          coins: recipient.coins,
        },
        transaction: {
          amount,
          message: message || "",
          timestamp: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Erro ao processar doação:", error);
    next(error);
  }
};

// Função auxiliar para calcular ranking por doações
async function getDonationRank(totalDonated) {
  try {
    const rank = await User.countDocuments({
      totalDonated: { $gt: totalDonated },
    });
    return rank + 1; // +1 porque queremos a posição (não o número de pessoas acima)
  } catch (error) {
    return null;
  }
}

// Função auxiliar para calcular ranking por moedas
async function getCoinsRank(coins) {
  try {
    const rank = await User.countDocuments({
      coins: { $gt: coins },
    });
    return rank + 1;
  } catch (error) {
    return null;
  }
}
