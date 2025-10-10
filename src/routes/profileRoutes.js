// routes/profileRoutes.js - ROTAS UNIFICADAS E COMPLETAS

const express = require("express");
const router = express.Router();

// ========== CONTROLLERS ==========
const profileController = require("../controllers/profileController");

// ========== MIDDLEWARES DE AUTENTICAÇÃO ==========
const { protect } = require("../middleware/auth");
const authMiddleware = require("../middleware/authMiddleware");

// ========== MIDDLEWARES DE UPLOAD ==========
const {
  upload,
  processProfileImage,
  validateImageDimensions,
  cleanupOldImages,
} = require("../middleware/upload");

// ========== MIDDLEWARES DE VALIDAÇÃO E PERSISTÊNCIA ==========
const {
  validateAndRestorePhoto,
  enrichWithPhoto,
  logPhotoAccess,
  forcePhotoSync,
} = require("../middleware/photoValidation");

// ========== SERVICES E UTILITIES ==========
const serverCache = require("../utils/serverCache");
const gcsService = require("../services/gcsService");

// ========== MIDDLEWARE GLOBAL DE AUTENTICAÇÃO ==========
// Aplicado a todas as rotas deste router
router.use(protect || authMiddleware);

// ========== MIDDLEWARE DE INVALIDAÇÃO DE CACHE ==========
const invalidateImageCache = async (req, res, next) => {
  try {
    if (req.user?.profileImage || req.user?.photo) {
      const imageName = req.user.profileImage || req.user.photo;

      // Invalidar cache local
      const localPath = `/uploads/profiles/${imageName}`;
      serverCache.invalidate(localPath);

      // Invalidar cache do GCS
      const gcsUrl = gcsService.getPublicUrl(imageName);
      if (gcsUrl) {
        serverCache.invalidate(gcsUrl);
      }

      console.log(`🔄 Cache invalidado: ${imageName}`);
    }
    next();
  } catch (error) {
    console.error("⚠️ Erro ao invalidar cache:", error);
    next(); // Continua mesmo com erro no cache
  }
};

// ========== ROTAS PRINCIPAIS DE PERFIL ==========

/**
 * @route   GET /api/profile
 * @desc    Obter perfil do usuário autenticado
 * @access  Private
 */
router.get(
  "/",
  logPhotoAccess,
  validateAndRestorePhoto,
  enrichWithPhoto,
  profileController.getProfile
);

/**
 * @route   PUT /api/profile
 * @desc    Atualizar perfil completo (com ou sem foto)
 * @access  Private
 */
router.put(
  "/",
  upload,
  validateImageDimensions,
  processProfileImage,
  logPhotoAccess,
  invalidateImageCache,
  validateAndRestorePhoto,
  profileController.updateProfile
);

/**
 * @route   POST /api/profile/upload-photo
 * @desc    Upload APENAS da foto de perfil
 * @access  Private
 * @note    Endpoint específico para upload de foto separadamente
 */
router.post(
  "/upload-photo",
  upload,
  validateImageDimensions,
  processProfileImage,
  cleanupOldImages,
  logPhotoAccess,
  invalidateImageCache,
  enrichWithPhoto,
  profileController.uploadProfilePhoto
);

/**
 * @route   DELETE /api/profile/photo
 * @desc    Remover foto de perfil
 * @access  Private
 */
router.delete(
  "/photo",
  logPhotoAccess,
  invalidateImageCache,
  validateAndRestorePhoto,
  profileController.removeProfilePhoto
);

// ========== ROTAS DE SINCRONIZAÇÃO ==========

/**
 * @route   POST /api/profile/sync-photo
 * @desc    Forçar sincronização da foto do banco com GCS
 * @access  Private
 * @note    Útil para corrigir inconsistências
 */
router.post("/sync-photo", logPhotoAccess, async (req, res) => {
  try {
    const photoUrl = await forcePhotoSync(req.user.id);

    res.json({
      success: true,
      message: photoUrl
        ? "Foto sincronizada com sucesso"
        : "Sem foto para sincronizar",
      photoUrl: photoUrl,
    });
  } catch (error) {
    console.error("❌ Erro ao sincronizar foto:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao sincronizar foto",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ========== ROTAS DE CACHE ==========

/**
 * @route   POST /api/profile/cache/invalidate
 * @desc    Invalidar cache específico de uma imagem
 * @access  Private
 * @note    Útil para debug e manutenção
 */
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
    console.error("❌ Erro ao invalidar cache específico:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/profile/cache/invalidate-my-images
 * @desc    Invalidar cache de todas as imagens do usuário atual
 * @access  Private
 */
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
    console.error("❌ Erro ao invalidar cache do usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ========== ROTAS DE STORAGE/GCS ==========

/**
 * @route   GET /api/profile/storage/health
 * @desc    Verificar saúde do sistema de storage (GCS)
 * @access  Private
 * @alias   /api/profile/health
 */
router.get("/storage/health", profileController.getStorageHealth);
router.get("/health", profileController.getStorageHealth); // Alias

/**
 * @route   GET /api/profile/storage/images
 * @desc    Listar todas as imagens de perfil no GCS
 * @access  Private (Admin recomendado)
 * @alias   /api/profile/images
 */
router.get("/storage/images", profileController.listProfileImages);
router.get("/images", profileController.listProfileImages); // Alias

/**
 * @route   GET /api/profile/storage/check/:filename
 * @desc    Verificar se um arquivo específico existe no GCS
 * @access  Private
 */
router.get("/storage/check/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: "filename é obrigatório",
      });
    }

    const exists = await gcsService.fileExists(filename);

    res.json({
      success: true,
      data: {
        filename,
        exists,
        url: exists ? gcsService.getPublicUrl(filename) : null,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao verificar arquivo:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao verificar arquivo",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/profile/storage/cleanup
 * @desc    Limpeza manual de imagens antigas no GCS
 * @access  Private (Admin recomendado)
 * @note    Adicione verificação de admin no controller
 */
router.post("/storage/cleanup", async (req, res) => {
  try {
    // TODO: Adicionar verificação de admin
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Acesso negado: apenas administradores",
    //   });
    // }

    const { daysOld } = req.body;
    const days = daysOld || 30;

    console.log(`🧹 Iniciando limpeza manual de imagens (>${days} dias)`);

    const removed = await gcsService.cleanupOldImages(days);

    res.json({
      success: true,
      message: `Limpeza concluída: ${removed} arquivo(s) removido(s)`,
      data: {
        filesRemoved: removed,
        daysOld: days,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Erro na limpeza manual:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao executar limpeza",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ========== ROTAS DE COMPATIBILIDADE ==========

/**
 * @route   GET /api/users/profile
 * @desc    Alias para GET /api/profile (retrocompatibilidade)
 * @access  Private
 */
router.get(
  "/users/profile",
  logPhotoAccess,
  validateAndRestorePhoto,
  enrichWithPhoto,
  profileController.getProfile
);

/**
 * @route   PUT /api/users/profile
 * @desc    Alias para PUT /api/profile (retrocompatibilidade)
 * @access  Private
 */
router.put(
  "/users/profile",
  upload,
  validateImageDimensions,
  processProfileImage,
  logPhotoAccess,
  invalidateImageCache,
  validateAndRestorePhoto,
  profileController.updateProfile
);

// ========== EXPORTAÇÃO ==========

module.exports = router;
