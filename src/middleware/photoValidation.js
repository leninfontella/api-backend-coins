// middleware/photoValidation.js - Garantir persistência da foto

const User = require("../models/User");
const gcsService = require("../services/gcsService");

/**
 * Middleware para validar e restaurar foto de perfil
 * Executa ANTES de retornar dados do usuário
 */
const validateAndRestorePhoto = async (req, res, next) => {
  try {
    // Só executar se houver usuário autenticado
    if (!req.user || !req.user.id) {
      return next();
    }

    // Buscar usuário do banco
    const user = await User.findById(req.user.id);

    if (!user) {
      return next();
    }

    // Se usuário tem foto no banco, validar
    if (user.profilePhoto && user.profilePhoto.filename) {
      const { filename, path, storage } = user.profilePhoto;

      // Se é foto do GCS
      if (storage === "gcs") {
        // Verificar se URL está válida
        if (!path || !path.startsWith("http")) {
          console.log(
            `⚠️ URL inválida detectada para ${user.email}, reconstruindo...`
          );

          const bucket = user.profilePhoto.bucket || "altrum_coins";
          const correctUrl = `https://storage.googleapis.com/${bucket}/profiles/${filename}`;

          user.profilePhoto.path = correctUrl;
          await user.save();

          console.log(`✅ URL corrigida: ${correctUrl}`);
        }

        // Verificar se arquivo existe no GCS (apenas ocasionalmente para performance)
        if (Math.random() < 0.1) {
          // 10% das requisições
          const exists = await gcsService.fileExists(filename);

          if (!exists) {
            console.log(
              `⚠️ Arquivo ${filename} não existe no GCS, limpando dados...`
            );

            user.profilePhoto = {
              filename: null,
              path: null,
              uploadDate: null,
              storage: null,
              bucket: null,
            };

            await user.save();
          }
        }
      }
    }

    next();
  } catch (error) {
    console.error("❌ Erro no middleware de validação de foto:", error);
    // Não bloquear requisição em caso de erro
    next();
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
