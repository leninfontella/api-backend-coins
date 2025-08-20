// routes/rankingRoutes.js
const express = require("express");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// ========== ROTA PRINCIPAL DO RANKING ==========
/**
 * GET /api/ranking
 * Retorna o ranking completo de usuários ordenados por coins
 */
router.get("/", auth, async (req, res) => {
  try {
    const { limit = 100, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    // Buscar usuários ativos ordenados por coins
    const users = await User.find({ status: "active" })
      .select(
        "name fullName username avatar coins level totalDonated totalReceived createdAt"
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

    // Adicionar posição no ranking para cada usuário
    const usersWithRank = users.map((user, index) => ({
      ...user.toObject(),
      rank: skip + index + 1,
      displayName: user.fullName || user.name,
      balance: user.coins, // Compatibilidade com frontend
    }));

    res.json({
      success: true,
      data: {
        users: usersWithRank,
        totalUsers,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        currentUserRank,
        currentUser: {
          ...req.user.getPublicData(),
          rank: currentUserRank,
          balance: req.user.coins,
        },
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

// ========== TOP 10 DO RANKING ==========
/**
 * GET /api/ranking/top10
 * Retorna apenas os top 10 usuários
 */
router.get("/top10", auth, async (req, res) => {
  try {
    const topUsers = await User.find({ status: "active" })
      .select("name fullName username avatar coins level totalDonated")
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .limit(10);

    const usersWithRank = topUsers.map((user, index) => ({
      ...user.toObject(),
      rank: index + 1,
      displayName: user.fullName || user.name,
      balance: user.coins,
    }));

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

// ========== POSIÇÃO ESPECÍFICA DO USUÁRIO ==========
/**
 * GET /api/ranking/my-position
 * Retorna a posição atual do usuário no ranking
 */
router.get("/my-position", auth, async (req, res) => {
  try {
    // Calcular posição no ranking
    const rank =
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

    const totalUsers = await User.countDocuments({ status: "active" });

    res.json({
      success: true,
      data: {
        user: {
          ...req.user.getPublicData(),
          rank,
          balance: req.user.coins,
        },
        totalUsers,
        percentile: (((totalUsers - rank + 1) / totalUsers) * 100).toFixed(1),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar posição do usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar posição",
    });
  }
});

// ========== RANKING POR PROXIMIDADE ==========
/**
 * GET /api/ranking/around-me
 * Retorna usuários próximos da posição atual do usuário
 */
router.get("/around-me", auth, async (req, res) => {
  try {
    const { range = 5 } = req.query; // Quantos usuários mostrar acima e abaixo

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
      .select("name fullName username avatar coins level totalDonated")
      .sort({ coins: -1, totalDonated: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const usersWithRank = users.map((user, index) => ({
      ...user.toObject(),
      rank: skip + index + 1,
      displayName: user.fullName || user.name,
      balance: user.coins,
      isCurrentUser: user._id.toString() === req.user._id.toString(),
    }));

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
/**
 * GET /api/ranking/stats
 * Retorna estatísticas gerais do ranking
 */
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
