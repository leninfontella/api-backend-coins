const express = require("express");
const router = express.Router();
const { upload, processProfileImage } = require("../middleware/upload");
const profileController = require("../controllers/profileController");
const authMiddleware = require("../middleware/authMiddleware");

// 🆕 IMPORTS PARA CACHE
const serverCache = require("../utils/serverCache");

// Middleware de autenticação aplicado a todas as rotas
router.use(authMiddleware);

// Obter dados do perfil
router.get("/", profileController.getProfile);

// 🔧 SEPARAÇÃO DE ENDPOINTS PARA EVITAR CONFLITOS

// Upload APENAS da foto (endpoint específico)
router.post(
  "/upload-photo",
  upload,
  processProfileImage,
  // 🆕 MIDDLEWARE PARA INVALIDAR CACHE DA IMAGEM ANTIGA
  async (req, res, next) => {
    try {
      // Se há uma imagem antiga, invalida o cache
      if (req.user.profileImage) {
        const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;
        serverCache.invalidate(oldImagePath);
        console.log(
          `🔄 Cache invalidado para upload de nova foto: ${req.user.profileImage}`
        );
      }
      next();
    } catch (error) {
      console.error("Erro ao invalidar cache no upload:", error);
      next(); // Continua mesmo se houver erro no cache
    }
  },
  profileController.uploadProfilePhoto
);

// Atualizar perfil completo (com ou sem foto) - com validação
router.put(
  "/",
  upload,
  processProfileImage,
  // 🆕 MIDDLEWARE PARA INVALIDAR CACHE NA ATUALIZAÇÃO
  async (req, res, next) => {
    try {
      // Se há upload de nova foto, invalida cache da antiga
      if (req.file && req.user.profileImage) {
        const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;
        serverCache.invalidate(oldImagePath);
        console.log(
          `🔄 Cache invalidado para atualização completa: ${req.user.profileImage}`
        );
      }
      next();
    } catch (error) {
      console.error("Erro ao invalidar cache na atualização:", error);
      next(); // Continua mesmo se houver erro no cache
    }
  },
  profileController.updateProfile
);

// Remover foto de perfil
router.delete(
  "/photo",
  // 🆕 MIDDLEWARE PARA INVALIDAR CACHE NA REMOÇÃO
  async (req, res, next) => {
    try {
      if (req.user.profileImage) {
        const imagePath = `/uploads/profiles/${req.user.profileImage}`;
        serverCache.invalidate(imagePath);
        console.log(
          `🗑️  Cache invalidado para remoção de foto: ${req.user.profileImage}`
        );
      }
      next();
    } catch (error) {
      console.error("Erro ao invalidar cache na remoção:", error);
      next(); // Continua mesmo se houver erro no cache
    }
  },
  profileController.removeProfilePhoto
);

// 🆕 ROTA ADICIONAL PARA INVALIDAR CACHE ESPECÍFICO (DEBUG/ADMIN)
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

// 🆕 ROTA PARA INVALIDAR CACHE DO USUÁRIO ATUAL
router.post("/cache/invalidate-my-images", async (req, res) => {
  try {
    const userId = req.user.id;

    // Invalida todas as imagens do usuário usando padrão
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
