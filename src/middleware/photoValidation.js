// middleware/photoValidation.js - Garantir persistência da foto

const User = require("../models/User");
const gcsService = require("../services/gcsService");

/**
 * Middleware para validar e restaurar foto de perfil
 * Executa ANTES de retornar dados do usuário
 */
// middleware/photoValidation.js

const validateAndRestorePhoto = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return next();
    }

    // Se usuário tem foto no banco, validar
    if (user.profilePhoto && user.profilePhoto.filename) {
      const { filename, path, storage } = user.profilePhoto;

      // 🔧 CRÍTICO: NUNCA REMOVER FOTOS DO GCS POR NÃO EXISTIR LOCALMENTE
      if (storage === "gcs") {
        // ✅ Para GCS, apenas verificar se URL está válida
        if (!path || !path.startsWith("http")) {
          console.log(`⚠️ URL inválida para ${user.email}, reconstruindo...`);

          const bucket = user.profilePhoto.bucket || "altrum_coins";
          const correctUrl = `https://storage.googleapis.com/${bucket}/profiles/${filename}`;

          user.profilePhoto.path = correctUrl;
          await user.save();

          console.log(`✅ URL corrigida: ${correctUrl}`);
        }

        // ✅ NUNCA fazer verificação de existência aqui
        // O arquivo está no GCS, não no servidor
      } else if (storage === "local") {
        // ⚠️ Apenas para fotos locais antigas (se existirem)
        const fs = require("fs");
        const path = require("path");
        const localPath = path.join(__dirname, "../uploads/profiles", filename);

        if (!fs.existsSync(localPath)) {
          console.log(`⚠️ Foto local não encontrada: ${filename}`);
          // NÃO limpar, apenas marcar para migração
          user.profilePhoto.needsMigration = true;
          await user.save();
        }
      }
    }

    next();
  } catch (error) {
    console.error("❌ Erro no middleware de validação de foto:", error);
    next(); // Não bloquear requisição
  }
};

/**
 * Middleware para enriquecer resposta com foto
 * Garante que profilePhotoUrl sempre esteja presente
 */
const enrichWithPhoto = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    try {
      // Se resposta contém usuário
      if (data && data.user) {
        const user = data.user;

        // Garantir que profilePhotoUrl existe
        if (
          !user.profilePhotoUrl &&
          user.profilePhoto &&
          user.profilePhoto.path
        ) {
          user.profilePhotoUrl = user.profilePhoto.path;
          console.log("📸 Photo URL adicionada à resposta");
        }

        // Log para debug
        console.log("📤 Resposta enriquecida:", {
          userId: user.id || user._id,
          hasPhoto: !!user.profilePhotoUrl,
          photoUrl: user.profilePhotoUrl,
        });
      }
    } catch (error) {
      console.error("❌ Erro ao enriquecer resposta:", error);
    }

    return originalJson(data);
  };

  next();
};

/**
 * Middleware para log de requisições de foto
 */
const logPhotoAccess = (req, res, next) => {
  if (req.path.includes("profile") || req.path.includes("photo")) {
    console.log("📸 Requisição de foto:", {
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

/**
 * Função utilitária para forçar sync de foto do banco
 */
const forcePhotoSync = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    if (user.profilePhoto && user.profilePhoto.storage === "gcs") {
      const { filename, bucket } = user.profilePhoto;

      // Verificar se arquivo existe
      const exists = await gcsService.fileExists(filename);

      if (exists) {
        // Reconstruir URL correta
        const bucketName = bucket || "altrum_coins";
        const correctUrl = `https://storage.googleapis.com/${bucketName}/profiles/${filename}`;

        user.profilePhoto.path = correctUrl;
        await user.save();

        console.log(`✅ Foto sincronizada para ${user.email}: ${correctUrl}`);
        return correctUrl;
      } else {
        console.log(`⚠️ Arquivo não existe no GCS, limpando dados`);

        user.profilePhoto = {
          filename: null,
          path: null,
          uploadDate: null,
          storage: null,
          bucket: null,
        };

        await user.save();
        return null;
      }
    }

    return user.profilePhotoUrl;
  } catch (error) {
    console.error("❌ Erro ao forçar sync de foto:", error);
    throw error;
  }
};

module.exports = {
  validateAndRestorePhoto,
  enrichWithPhoto,
  logPhotoAccess,
  forcePhotoSync,
};
