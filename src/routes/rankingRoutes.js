const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const mongoose = require("mongoose");

// ========== FUNÇÕES HELPER ==========

/**
 * Helper function para incluir fotos no ranking
 */
const includeProfilePhotos = (users, includePhotos = false) => {
  if (!includePhotos) return users;

  return users.map((user) => {
    const userObj = user.toObject ? user.toObject() : user;

    // Incluir URL completa da foto se existir
    if (userObj.profilePhoto || userObj.avatar) {
      const photoField = userObj.profilePhoto || userObj.avatar;

      // CORREÇÃO: Verificar se photoField é uma string antes de usar startsWith
      if (typeof photoField === "string") {
        userObj.profilePhotoUrl = photoField.startsWith("http")
          ? photoField
          : `/uploads/profiles/${photoField.replace(
              /^\/uploads\/profiles\//,
              ""
            )}`;
      } else {
        // Lidar com casos onde a foto não é uma string válida
        userObj.profilePhotoUrl = null;
      }

      // Manter compatibilidade com ambos os campos
      userObj.avatar = userObj.avatar || userObj.profilePhoto;
      userObj.profilePhoto = userObj.profilePhoto || userObj.avatar;
    } else {
      userObj.profilePhotoUrl = null;
    }

    return userObj;
  });
};

/**
 * Função para otimizar consulta com fotos
 */
const getRankingQuery = (includePhotos = false) => {
  const baseQuery = {
    $and: [
      { coins: { $gte: 0 } },
      {
        $or: [{ status: "active" }, { isActive: { $ne: false } }],
      },
    ],
  };

  const selectFields = includePhotos
    ? "fullName name displayName username coins balance level rank profilePhoto avatar totalDonated totalReceived createdAt updatedAt"
    : "fullName name displayName username coins balance level rank totalDonated totalReceived createdAt updatedAt";

  return { query: baseQuery, select: selectFields };
};

/**
 * Função para calcular posição no ranking
 */
const calculateUserRank = async (
  userCoins,
  userTotalDonated,
  userCreatedAt,
  baseQuery
) => {
  return (
    (await User.countDocuments({
      ...baseQuery,
      $or: [
        { coins: { $gt: userCoins } },
        {
          coins: userCoins,
          totalDonated: { $gt: userTotalDonated || 0 },
        },
        {
          coins: userCoins,
          totalDonated: userTotalDonated || 0,
          createdAt: { $lt: userCreatedAt },
        },
      ],
    })) + 1
  );
};

/**
 * Função para processar dados do usuário
 */
const processUserData = (user, rank = null, isCurrentUser = false) => {
  const userObj = user.toObject ? user.toObject() : user;

  return {
    _id: userObj._id,
    id: userObj._id,
    name: userObj.name,
    fullName: userObj.fullName || userObj.name,
    displayName: userObj.fullName || userObj.name,
    username: userObj.username,
    avatar: userObj.avatar || userObj.profilePhoto,
    profilePhoto: userObj.profilePhoto || userObj.avatar,
    coins: userObj.coins || 0,
    balance: userObj.coins || userObj.balance || 0,
    level: userObj.level || 1,
    totalDonated: userObj.totalDonated || 0,
    totalReceived: userObj.totalReceived || 0,
    rank: rank || userObj.rank,
    createdAt: userObj.createdAt,
    updatedAt: userObj.updatedAt,
    isCurrentUser,
  };
};

// ========== ROTAS DO RANKING ==========

/**
 * @route GET /api/ranking
 * @desc Obter ranking completo com suporte a fotos e paginação
 * @access Private
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const includePhotos = req.query.includePhotos === "true";
    const skip = (page - 1) * limit;

    console.log(
      `🏆 Buscando ranking - Página: ${page}, Limite: ${limit}, Fotos: ${includePhotos}`
    );

    const { query, select } = getRankingQuery(includePhotos);

    // Buscar usuários ordenados por coins
    const users = await User.find(query)
      .select(select)
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Processar usuários com rank
    const rankedUsers = users.map((user, index) =>
      processUserData(user, skip + index + 1)
    );

    // Incluir fotos se solicitado
    const finalUsers = includeProfilePhotos(rankedUsers, includePhotos);

    // Obter total de usuários
    const totalUsers = await User.countDocuments(query);

    // Calcular posição do usuário atual
    const currentUserPosition = await calculateUserRank(
      req.user.coins,
      req.user.totalDonated,
      req.user.createdAt,
      query
    );

    // Buscar dados do usuário atual
    const currentUser = await User.findById(req.user.id).select(select).lean();

    let processedCurrentUser = null;
    if (currentUser) {
      processedCurrentUser = processUserData(
        currentUser,
        currentUserPosition,
        true
      );

      // CORREÇÃO: Adicionar verificação de tipo de currentUser.profilePhoto
      if (
        includePhotos &&
        currentUser.profilePhoto &&
        typeof currentUser.profilePhoto === "string"
      ) {
        processedCurrentUser.profilePhotoUrl =
          currentUser.profilePhoto.startsWith("http")
            ? currentUser.profilePhoto
            : `/uploads/profiles/${currentUser.profilePhoto.replace(
                /^\/uploads\/profiles\//,
                ""
              )}`;
      }
    }

    console.log(
      `✅ Ranking retornado: ${finalUsers.length} usuários (${
        includePhotos ? "com fotos" : "sem fotos"
      })`
    );

    res.json({
      success: true,
      data: {
        users: finalUsers,
        totalUsers,
        currentUserRank: currentUserPosition,
        currentUser: processedCurrentUser,
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(totalUsers / limit),
          hasNextPage: skip + limit < totalUsers,
          hasPrevPage: page > 1,
          currentPage: page,
        },
        includePhotos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar ranking:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar ranking",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/ranking/top10
 * @desc Obter top 10 usuários com suporte a fotos
 * @access Private
 */
router.get("/top10", authMiddleware, async (req, res) => {
  try {
    const includePhotos = req.query.includePhotos === "true";

    console.log(`🥇 Buscando top 10 - Fotos: ${includePhotos}`);

    const { query, select } = getRankingQuery(includePhotos);

    // Buscar top 10 usuários
    const users = await User.find(query)
      .select(select)
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .limit(10)
      .lean();

    // Processar usuários com rank
    const rankedUsers = users.map((user, index) =>
      processUserData(user, index + 1)
    );

    // Incluir fotos se solicitado
    const finalUsers = includeProfilePhotos(rankedUsers, includePhotos);

    console.log(
      `✅ Top 10 retornado (${includePhotos ? "com fotos" : "sem fotos"})`
    );

    res.json({
      success: true,
      data: {
        users: finalUsers,
        top10: finalUsers, // Compatibilidade
        count: finalUsers.length,
        includePhotos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar top 10:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar top 10",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/ranking/top3
 * @desc Obter top 3 usuários (pódium) com suporte a fotos
 * @access Private
 */
router.get("/top3", authMiddleware, async (req, res) => {
  try {
    const includePhotos = req.query.includePhotos === "true";

    console.log(`🏅 Buscando top 3 (pódium) - Fotos: ${includePhotos}`);

    const { query, select } = getRankingQuery(includePhotos);

    // Buscar top 3 usuários
    const users = await User.find(query)
      .select(select)
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .limit(3)
      .lean();

    // Processar usuários com rank
    const rankedUsers = users.map((user, index) =>
      processUserData(user, index + 1)
    );

    // Incluir fotos se solicitado
    const finalUsers = includeProfilePhotos(rankedUsers, includePhotos);

    console.log(
      `✅ Top 3 retornado (${includePhotos ? "com fotos" : "sem fotos"})`
    );

    res.json({
      success: true,
      data: {
        users: finalUsers,
        top3: finalUsers, // Compatibilidade
        podium: finalUsers, // Compatibilidade
        count: finalUsers.length,
        includePhotos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar top 3:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar top 3",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/ranking/my-position
 * @desc Obter posição do usuário atual no ranking
 * @access Private
 */
router.get("/my-position", authMiddleware, async (req, res) => {
  try {
    const includePhotos = req.query.includePhotos === "true";
    const currentUserId = req.user.id;

    console.log(
      `📍 Buscando posição do usuário: ${currentUserId} - Fotos: ${includePhotos}`
    );

    // Buscar usuário atual
    const { select, query } = getRankingQuery(includePhotos);
    const currentUser = await User.findById(currentUserId)
      .select(select)
      .lean();

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Calcular posição no ranking
    const position = await calculateUserRank(
      currentUser.coins,
      currentUser.totalDonated,
      currentUser.createdAt,
      query
    );

    // Obter total de usuários
    const totalUsers = await User.countDocuments(query);

    // Processar dados do usuário
    let processedUser = processUserData(currentUser, position, true);

    // CORREÇÃO: Adicionar verificação de tipo de photoField
    if (includePhotos && (currentUser.profilePhoto || currentUser.avatar)) {
      const photoField = currentUser.profilePhoto || currentUser.avatar;

      if (typeof photoField === "string") {
        processedUser.profilePhotoUrl = photoField.startsWith("http")
          ? photoField
          : `/uploads/profiles/${photoField.replace(
              /^\/uploads\/profiles\//,
              ""
            )}`;
      } else {
        processedUser.profilePhotoUrl = null;
      }
    }

    console.log(`✅ Posição do usuário: ${position}/${totalUsers}`);

    res.json({
      success: true,
      data: {
        user: processedUser,
        rank: position,
        position,
        totalUsers,
        percentage: (((totalUsers - position + 1) / totalUsers) * 100).toFixed(
          1
        ),
        percentile: (((totalUsers - position + 1) / totalUsers) * 100).toFixed(
          1
        ),
        includePhotos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar posição do usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar posição",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/ranking/around-me
 * @desc Obter ranking ao redor da posição do usuário
 * @access Private
 */
router.get("/around-me", authMiddleware, async (req, res) => {
  try {
    const includePhotos = req.query.includePhotos === "true";
    const range = parseInt(req.query.range) || 5; // usuários acima e abaixo
    const currentUserId = req.user.id;

    console.log(
      `🎯 Buscando ranking ao redor do usuário: ${currentUserId} - Range: ±${range} - Fotos: ${includePhotos}`
    );

    // Buscar usuário atual
    const currentUser = await User.findById(currentUserId).lean();
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    const { query, select } = getRankingQuery(includePhotos);

    // Calcular posição atual
    const currentUserPosition = await calculateUserRank(
      currentUser.coins,
      currentUser.totalDonated,
      currentUser.createdAt,
      query
    );

    // Calcular skip e limit para buscar usuários ao redor
    const skip = Math.max(0, currentUserPosition - range - 1);
    const limit = range * 2 + 1;

    // Buscar usuários ao redor
    const users = await User.find(query)
      .select(select)
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Processar usuários com ranks corretos
    const rankedUsers = users.map((user, index) => {
      const rank = skip + index + 1;
      const isCurrentUser = user._id.toString() === currentUserId;
      return processUserData(user, rank, isCurrentUser);
    });

    // Incluir fotos se solicitado
    const finalUsers = includeProfilePhotos(rankedUsers, includePhotos);

    console.log(
      `✅ Ranking ao redor retornado: ${finalUsers.length} usuários (${
        includePhotos ? "com fotos" : "sem fotos"
      })`
    );

    res.json({
      success: true,
      data: {
        users: finalUsers,
        currentUserRank: currentUserPosition,
        range,
        includePhotos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar ranking ao redor:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar ranking ao redor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/ranking/stats
 * @desc Obter estatísticas do ranking
 * @access Private
 */
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    console.log("📊 Buscando estatísticas do ranking");

    const { query } = getRankingQuery(false);

    // Estatísticas básicas
    const totalUsers = await User.countDocuments(query);

    // Agregação para estatísticas avançadas
    const stats = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCoins: { $sum: "$coins" },
          avgCoins: { $avg: "$coins" },
          maxCoins: { $max: "$coins" },
          minCoins: { $min: "$coins" },
          totalDonated: { $sum: "$totalDonated" },
          avgDonated: { $avg: "$totalDonated" },
          totalReceived: { $sum: "$totalReceived" },
          avgReceived: { $avg: "$totalReceived" },
        },
      },
    ]);

    // Distribuição por níveis
    const levelDistribution = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$level",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Usuários com fotos de perfil
    const usersWithPhotos = await User.countDocuments({
      ...query,
      $or: [
        { profilePhoto: { $exists: true, $ne: null, $ne: "" } },
        { avatar: { $exists: true, $ne: null, $ne: "" } },
      ],
    });

    // Posição do usuário atual
    const currentUserPosition = await calculateUserRank(
      req.user.coins,
      req.user.totalDonated,
      req.user.createdAt,
      query
    );

    console.log("✅ Estatísticas do ranking calculadas");

    res.json({
      success: true,
      data: {
        general: stats[0] || {
          totalCoins: 0,
          avgCoins: 0,
          maxCoins: 0,
          minCoins: 0,
          totalDonated: 0,
          avgDonated: 0,
          totalReceived: 0,
          avgReceived: 0,
        },
        totalUsers,
        usersWithPhotos,
        photoPercentage:
          totalUsers > 0
            ? ((usersWithPhotos / totalUsers) * 100).toFixed(1)
            : 0,
        levelDistribution,
        currentUserRank: currentUserPosition,
        lastUpdated: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar estatísticas",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/ranking/users/:userId/photo
 * @desc Obter foto de perfil de usuário específico
 * @access Private
 */
router.get("/users/:userId/photo", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`🖼️ Buscando foto do usuário: ${userId}`);

    // Validar ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuário inválido",
      });
    }

    // Buscar usuário
    const user = await User.findById(userId)
      .select("fullName name profilePhoto avatar")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    const photoField = user.profilePhoto || user.avatar;

    // Verificar se tem foto
    if (!photoField) {
      return res.json({
        success: true,
        data: {
          hasPhoto: false,
          profilePhoto: null,
          avatar: null,
          profilePhotoUrl: null,
          userName: user.fullName || user.name,
        },
      });
    }

    // CORREÇÃO: Adicionar verificação de tipo de photoField
    let profilePhotoUrl = null;
    if (typeof photoField === "string") {
      // Gerar URL completa da foto
      profilePhotoUrl = photoField.startsWith("http")
        ? photoField
        : `/uploads/profiles/${photoField.replace(
            /^\/uploads\/profiles\//,
            ""
          )}`;
    }

    if (profilePhotoUrl) {
      console.log(`✅ Foto do usuário encontrada: ${profilePhotoUrl}`);
    } else {
      console.log(`❌ Foto do usuário não é uma URL válida.`);
    }

    res.json({
      success: true,
      data: {
        hasPhoto: !!profilePhotoUrl,
        profilePhoto: user.profilePhoto,
        avatar: user.avatar,
        profilePhotoUrl,
        userName: user.fullName || user.name,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar foto do usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar foto",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
