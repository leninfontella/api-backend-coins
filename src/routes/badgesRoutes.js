const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { query, validationResult } = require("express-validator");

// Aplicar middleware de autenticação
router.use(authMiddleware);

// Definição dos níveis de badge (sincronizado com frontend)
const BADGE_LEVELS = {
  1: { min: 0, max: 199, name: "Iniciante", color: "#8B5CF6", icon: "🌱" },
  2: { min: 200, max: 499, name: "Explorador", color: "#06B6D4", icon: "🔍" },
  3: { min: 500, max: 999, name: "Aventureiro", color: "#10B981", icon: "🎒" },
  4: { min: 1000, max: 4999, name: "Benfeitor", color: "#F59E0B", icon: "🤝" },
  5: { min: 5000, max: 9999, name: "Generoso", color: "#EF4444", icon: "❤️" },
  6: {
    min: 10000,
    max: 49999,
    name: "Filantropo",
    color: "#EC4899",
    icon: "🏆",
  },
  7: { min: 50000, max: 99999, name: "Magnata", color: "#8B5CF6", icon: "💎" },
  8: { min: 100000, max: 499999, name: "Lenda", color: "#06B6D4", icon: "⭐" },
  9: { min: 500000, max: 999999, name: "Mito", color: "#F97316", icon: "🔥" },
  10: {
    min: 1000000,
    max: Infinity,
    name: "Divino",
    color: "#FFD700",
    icon: "👑",
  },
};

// Função para determinar nível baseado em pontos
function calculateBadgeLevel(points) {
  for (let level in BADGE_LEVELS) {
    const levelData = BADGE_LEVELS[level];
    if (points >= levelData.min && points <= levelData.max) {
      return { level: parseInt(level), ...levelData };
    }
  }
  return { level: 1, ...BADGE_LEVELS[1] };
}

// GET /api/badges - Obter dados completos do sistema de badges do usuário
router.get("/", async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Calcular pontos baseado em totalDonated (como no sistema atual)
    const points = user.totalDonated || 0;
    const currentLevel = calculateBadgeLevel(points);

    // Próximo nível
    const nextLevelNum = currentLevel.level + 1;
    const nextLevel = BADGE_LEVELS[nextLevelNum]
      ? { level: nextLevelNum, ...BADGE_LEVELS[nextLevelNum] }
      : null;

    // Calcular progresso
    let progress = 100;
    if (nextLevel) {
      const currentLevelMin = BADGE_LEVELS[currentLevel.level].min;
      const nextLevelMin = nextLevel.min;
      progress =
        ((points - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;
      progress = Math.max(0, Math.min(100, progress));
    }

    // Calcular todos os níveis com status
    const allLevels = Object.keys(BADGE_LEVELS).map((levelNum) => {
      const level = BADGE_LEVELS[levelNum];
      let status = "locked";
      let statusText = "Bloqueado";

      if (points >= level.min) {
        status = "unlocked";
        statusText = "Desbloqueado";
      }

      if (parseInt(levelNum) === currentLevel.level) {
        status = "current";
        statusText = "Atual";
      }

      return {
        level: parseInt(levelNum),
        ...level,
        status,
        statusText,
      };
    });

    const response = {
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          fullName: user.fullName || user.name,
          coins: user.coins,
          totalDonated: user.totalDonated || 0,
          totalReceived: user.totalReceived || 0,
          level: user.level,
        },
        badges: {
          currentPoints: points,
          currentLevel: currentLevel,
          nextLevel: nextLevel,
          progress: progress,
          allLevels: allLevels,
          pointsToNextLevel: nextLevel ? nextLevel.min - points : 0,
        },
        stats: {
          totalLevelsUnlocked: allLevels.filter((l) => l.status !== "locked")
            .length,
          totalLevelsAvailable: Object.keys(BADGE_LEVELS).length,
          completionPercentage: Math.round(
            (allLevels.filter((l) => l.status !== "locked").length /
              Object.keys(BADGE_LEVELS).length) *
              100
          ),
        },
      },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error("Erro ao obter dados de badges:", error);
    next(error);
  }
});

// GET /api/badges/levels - Obter apenas definições dos níveis
router.get("/levels", (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        levels: BADGE_LEVELS,
        totalLevels: Object.keys(BADGE_LEVELS).length,
      },
    });
  } catch (error) {
    console.error("Erro ao obter níveis de badges:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

// GET /api/badges/progress - Obter apenas progresso atual
router.get("/progress", async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("totalDonated");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    const points = user.totalDonated || 0;
    const currentLevel = calculateBadgeLevel(points);
    const nextLevelNum = currentLevel.level + 1;
    const nextLevel = BADGE_LEVELS[nextLevelNum]
      ? { level: nextLevelNum, ...BADGE_LEVELS[nextLevelNum] }
      : null;

    let progress = 100;
    if (nextLevel) {
      const currentLevelMin = BADGE_LEVELS[currentLevel.level].min;
      const nextLevelMin = nextLevel.min;
      progress =
        ((points - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;
      progress = Math.max(0, Math.min(100, progress));
    }

    res.json({
      success: true,
      data: {
        points: points,
        currentLevel: currentLevel,
        nextLevel: nextLevel,
        progress: progress,
        pointsToNextLevel: nextLevel ? nextLevel.min - points : 0,
      },
    });
  } catch (error) {
    console.error("Erro ao obter progresso de badges:", error);
    next(error);
  }
});

// GET /api/badges/ranking - Obter ranking por badges
router.get(
  "/ranking",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limite deve ser entre 1 e 100"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Dados inválidos",
          errors: errors.array(),
        });
      }

      const { page = 1, limit = 50 } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Buscar usuários ordenados por totalDonated
      const users = await User.find({ status: "active", isActive: true })
        .select(
          "name fullName username avatar totalDonated coins level createdAt"
        )
        .sort({ totalDonated: -1, coins: -1, name: 1 })
        .limit(limitNum)
        .skip(skip);

      // Calcular badge level para cada usuário
      const usersWithBadges = users.map((user, index) => {
        const points = user.totalDonated || 0;
        const badgeLevel = calculateBadgeLevel(points);

        return {
          position: skip + index + 1,
          user: {
            id: user._id,
            name: user.name,
            fullName: user.fullName || user.name,
            username: user.username,
            avatar: user.avatar,
            coins: user.coins,
            totalDonated: user.totalDonated || 0,
            level: user.level,
            joinedAt: user.createdAt,
          },
          badge: {
            points: points,
            level: badgeLevel.level,
            name: badgeLevel.name,
            color: badgeLevel.color,
            icon: badgeLevel.icon,
          },
        };
      });

      // Total de usuários para paginação
      const totalUsers = await User.countDocuments({
        status: "active",
        isActive: true,
      });

      res.json({
        success: true,
        data: {
          ranking: usersWithBadges,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalUsers,
            pages: Math.ceil(totalUsers / limitNum),
            hasNext: skip + limitNum < totalUsers,
            hasPrev: pageNum > 1,
          },
        },
      });
    } catch (error) {
      console.error("Erro ao obter ranking de badges:", error);
      next(error);
    }
  }
);

// PUT /api/badges/refresh - Forçar atualização dos dados de badge (para debug)
router.put("/refresh", async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Recalcular nível baseado no totalDonated atual
    const points = user.totalDonated || 0;
    const calculatedLevel = calculateBadgeLevel(points);

    // Atualizar level do usuário se necessário
    if (user.level !== calculatedLevel.name) {
      user.level = calculatedLevel.name;
      await user.save();
    }

    const currentLevel = calculatedLevel;
    const nextLevelNum = currentLevel.level + 1;
    const nextLevel = BADGE_LEVELS[nextLevelNum]
      ? { level: nextLevelNum, ...BADGE_LEVELS[nextLevelNum] }
      : null;

    let progress = 100;
    if (nextLevel) {
      const currentLevelMin = BADGE_LEVELS[currentLevel.level].min;
      const nextLevelMin = nextLevel.min;
      progress =
        ((points - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;
      progress = Math.max(0, Math.min(100, progress));
    }

    res.json({
      success: true,
      message: "Dados de badge atualizados com sucesso",
      data: {
        user: {
          id: user._id,
          name: user.name,
          fullName: user.fullName || user.name,
          level: user.level,
        },
        badges: {
          currentPoints: points,
          currentLevel: currentLevel,
          nextLevel: nextLevel,
          progress: progress,
          pointsToNextLevel: nextLevel ? nextLevel.min - points : 0,
        },
        updated: true,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar badges:", error);
    next(error);
  }
});

module.exports = router;
