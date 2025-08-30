const express = require("express");
const router = express.Router();
const { upload, processProfileImage } = require("../middleware/upload");
const profileController = require("../controllers/profileController");
const authMiddleware = require("../middleware/authMiddleware");

// Middleware de autenticação aplicado a todas as rotas
router.use(authMiddleware);

// Obter dados do perfil
router.get("/", profileController.getProfile);

// Atualizar perfil completo (com ou sem foto)
router.put("/", upload, processProfileImage, profileController.updateProfile);

// Upload apenas da foto
router.post(
  "/upload-photo",
  upload,
  processProfileImage,
  profileController.uploadProfilePhoto
);

// Remover foto de perfil
router.delete("/photo", profileController.removeProfilePhoto);

module.exports = router;
