const express = require("express");
const router = express.Router();
const {
  upload,
  processProfileImage,
  setNoCacheHeaders,
} = require("../middleware/upload");
const profileController = require("../controllers/profileController");
const authMiddleware = require("../middleware/authMiddleware");

const serverCache = require("../utils/serverCache");

// Middleware de autenticação aplicado a todas as rotas
router.use(authMiddleware);

// CRÍTICO: Middleware para adicionar headers no-cache em TODAS as respostas de perfil
router.use((req, res, next) => {
  setNoCacheHeaders(res);
  next();
});

// Obter dados do perfil
router.get("/", profileController.getProfile);

// Upload APENAS da foto (endpoint específico)
router.post(
  "/upload-photo",
  upload,
  processProfileImage,
  async (req, res, next) => {
    try {
      if (req.user.profileImage) {
        const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;
        serverCache.invalidate(oldImagePath);
        console.log(
          `Cache invalidado para upload de nova foto: ${req.user.profileImage}`
        );
      }
      next();
    } catch (error) {
      console.error("Erro ao invalidar cache no upload:", error);
      next();
    }
  },
  profileController.uploadProfilePhoto
);

// Atualizar perfil completo (com ou sem foto)
router.put(
  "/",
  upload,
  processProfileImage,
  async (req, res, next) => {
    try {
      if (req.file && req.user.profileImage) {
        const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;
        serverCache.invalidate(oldImagePath);
        console.log(
          `Cache invalidado para atualização completa: ${req.user.profileImage}`
        );
      }
      next();
    } catch (error) {
      console.error("Erro ao invalidar cache na atualização:", error);
      next();
    }
  },
  profileController.updateProfile
);

// Remover foto de perfil
router.delete(
  "/photo",
  async (req, res, next) => {
    try {
      if (req.user.profileImage) {
        const imagePath = `/uploads/profiles/${req.user.profileImage}`;
        serverCache.invalidate(imagePath);
        console.log(
          `Cache invalidado para remoção de foto: ${req.user.profileImage}`
        );
      }
      next();
    } catch (error) {
      console.error("Erro ao invalidar cache na remoção:", error);
      next();
    }
  },
  profileController.removeProfilePhoto
);

router.post("/cache/invalidate", async (req, res) => {
  try {
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({
        success: false,
        message: "imagePath é obrigatório",
      });
    }

    const invalidated = serverCache.invalidate(imagePath);

    res.json({
      success: true,
      message: invalidated
        ? "Cache invalidado com sucesso"
        : "Cache não encontrado",
      data: {
        imagePath,
        invalidated,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao invalidar cache específico:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: error.message,
    });
  }
});

router.post("/cache/invalidate-my-images", async (req, res) => {
  try {
    const userId = req.user.id;

    const removed = serverCache.invalidatePattern(`profile-${userId}-`);

    res.json({
      success: true,
      message: `Cache invalidado para ${removed} imagem(ns) do usuário`,
      data: {
        userId,
        imagesInvalidated: removed,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao invalidar cache do usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: error.message,
    });
  }
});

module.exports = router;
