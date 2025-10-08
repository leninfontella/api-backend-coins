const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// IMPORT PARA GCS
const gcsService = require("../services/gcsService");

// IMPORT PARA CACHE EM MEMÓRIA
const serverCache = require("../utils/serverCache");

// Criar diretório de uploads se não existir (mantém como fallback/backup local)
const uploadsDir = path.join(__dirname, "../uploads/profiles");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`📁 Diretório de uploads criado: ${uploadsDir}`);
}

// Configuração do storage - usa memória para processar antes de enviar ao GCS
const storage = multer.memoryStorage();

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Apenas arquivos de imagem são permitidos! (JPEG, PNG, GIF, WebP)"
      ),
      false
    );
  }
};

// Configuração do multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limite
    files: 1, // Apenas 1 arquivo por vez
  },
});

// Função utilitária para invalidar cache HTTP (ainda útil para backup local)
const invalidateHttpCache = (filename) => {
  try {
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      const now = new Date();
      fs.utimesSync(filePath, now, now);
      console.log(`🔄 Cache HTTP invalidado: ${filename}`);
    }
  } catch (error) {
    console.error("Erro ao invalidar cache HTTP:", error);
  }
};

// Middleware para processar e fazer upload da imagem para GCS
const processProfileImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    console.log(`📤 Processando upload de imagem para usuário: ${req.user.id}`);

    // INVALIDAR E DELETAR IMAGEM ANTIGA DO GCS
    if (req.user.profileImage) {
      const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;

      // Invalidar cache em memória
      serverCache.invalidate(oldImagePath);

      // Invalidar cache HTTP (se houver cópia local)
      invalidateHttpCache(req.user.profileImage);

      // 🆕 DELETAR DO GCS
      await gcsService.deleteImage(req.user.profileImage);

      console.log(
        `🔄 Caches invalidados e arquivo deletado do GCS: ${req.user.profileImage}`
      );

      // Remover arquivo físico local antigo (se existir como backup)
      const oldFilePath = path.join(uploadsDir, req.user.profileImage);
      if (fs.existsSync(oldFilePath)) {
        try {
          await fs.promises.unlink(oldFilePath);
          console.log(
            `🗑️  Arquivo local antigo removido: ${req.user.profileImage}`
          );
        } catch (unlinkError) {
          console.error(
            `⚠️  Erro ao remover arquivo local antigo: ${unlinkError.message}`
          );
        }
      }
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const filename = `profile-${req.user.id}-${timestamp}.webp`;

    console.log(`🔄 Gerando nova imagem: ${filename}`);

    // 🆕 FAZER UPLOAD DIRETAMENTE PARA O GCS
    const uploadResult = await gcsService.uploadImage(
      req.file.buffer,
      filename,
      "image/webp"
    );

    if (!uploadResult.success) {
      throw new Error("Falha no upload para GCS");
    }

    console.log(`✅ Upload para GCS bem-sucedido: ${uploadResult.url}`);

    // 🆕 OPCIONAL: Salvar cópia local como backup
    const saveLocalBackup = process.env.SAVE_LOCAL_BACKUP === "true";
    if (saveLocalBackup) {
      try {
        const filepath = path.join(uploadsDir, filename);
        const processedBuffer = await sharp(req.file.buffer)
          .resize(300, 300, {
            fit: "cover",
            position: "center",
          })
          .webp({
            quality: 85,
            effort: 4,
          })
          .toBuffer();

        await fs.promises.writeFile(filepath, processedBuffer);
        console.log(`💾 Backup local salvo: ${filename}`);
      } catch (backupError) {
        console.error("⚠️  Erro ao salvar backup local:", backupError.message);
        // Não interrompe o fluxo se backup falhar
      }
    }

    // PRÉ-CARREGAR A NOVA IMAGEM NO CACHE EM MEMÓRIA (para requisições futuras)
    // Nota: A URL agora é do GCS, não local
    const newImagePath = uploadResult.url;
    serverCache.set(
      newImagePath,
      req.file.buffer,
      "image/webp",
      uploadResult.size
    );
    console.log(`💾 Nova imagem pré-carregada no cache: ${filename}`);

    // Adicionar informações da imagem ao req
    req.processedImage = {
      filename: filename,
      path: uploadResult.url, // 🆕 URL do GCS, não caminho local
      fullPath: uploadResult.path, // Path no bucket GCS
      publicUrl: uploadResult.url, // 🆕 URL pública do GCS
      size: uploadResult.size,
      originalName: req.file.originalname,
      originalSize: req.file.size,
      mimetype: "image/webp",
      processedAt: new Date(),
      cached: true,
      bucket: uploadResult.bucket,
      storage: "gcs", // 🆕 Indicador de storage usado
    };

    console.log(
      `✅ Imagem processada e enviada para GCS: ${filename} (${uploadResult.size} bytes)`
    );
    console.log(`🌐 URL pública: ${uploadResult.url}`);

    next();
  } catch (error) {
    console.error("❌ Erro ao processar imagem:", error);

    // LIMPAR CACHES EM CASO DE ERRO
    if (req.processedImage && req.processedImage.path) {
      serverCache.invalidate(req.processedImage.path);
    }

    // 🆕 Tentar deletar do GCS se foi parcialmente enviado
    if (req.processedImage && req.processedImage.filename) {
      try {
        await gcsService.deleteImage(req.processedImage.filename);
        console.log(`🧹 Arquivo parcial removido do GCS após erro`);
      } catch (cleanupError) {
        console.error("Erro ao limpar arquivo do GCS:", cleanupError);
      }
    }

    // Retornar erro específico baseado no tipo
    let errorMessage = "Erro ao processar imagem";

    if (error.message.includes("Input file")) {
      errorMessage = "Arquivo de imagem inválido ou corrompido";
    } else if (
      error.message.includes("GCS") ||
      error.message.includes("Google Cloud")
    ) {
      errorMessage = "Erro ao fazer upload para o servidor de armazenamento";
    } else if (error.message.includes("Input buffer")) {
      errorMessage = "Formato de imagem não suportado";
    } else if (error.message.includes("Network")) {
      errorMessage = "Erro de conexão com o servidor de armazenamento";
    }

    const err = new Error(errorMessage);
    err.status = 400;
    err.originalError = error.message;
    next(err);
  }
};

// Middleware adicional para validar dimensões da imagem
const validateImageDimensions = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    console.log(`📏 Validando dimensões da imagem...`);
    const metadata = await sharp(req.file.buffer).metadata();

    console.log(
      `📊 Dimensões da imagem: ${metadata.width}x${metadata.height}px`
    );

    // Validar dimensões mínimas
    if (metadata.width < 50 || metadata.height < 50) {
      return res.status(400).json({
        success: false,
        message: "A imagem deve ter pelo menos 50x50 pixels",
        data: {
          current: `${metadata.width}x${metadata.height}`,
          minimum: "50x50",
        },
      });
    }

    // Validar dimensões máximas
    if (metadata.width > 5000 || metadata.height > 5000) {
      return res.status(400).json({
        success: false,
        message: "A imagem não pode exceder 5000x5000 pixels",
        data: {
          current: `${metadata.width}x${metadata.height}`,
          maximum: "5000x5000",
        },
      });
    }

    // Validar se a imagem não está corrompida
    if (!metadata.width || !metadata.height) {
      return res.status(400).json({
        success: false,
        message: "Arquivo de imagem inválido ou corrompido",
      });
    }

    console.log(`✅ Validação de dimensões aprovada`);
    next();
  } catch (error) {
    console.error("❌ Erro ao validar dimensões:", error);
    return res.status(400).json({
      success: false,
      message: "Erro ao validar imagem - arquivo pode estar corrompido",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Middleware para limpeza de imagens antigas no GCS (opcional)
const cleanupOldImages = async (req, res, next) => {
  try {
    // Executar limpeza apenas ocasionalmente (1% de chance)
    if (Math.random() > 0.01) {
      return next();
    }

    console.log(`🧹 Executando limpeza de imagens antigas no GCS...`);

    // 🆕 Usar serviço GCS para limpeza
    const removed = await gcsService.cleanupOldImages(30);

    if (removed > 0) {
      console.log(
        `🗑️  Limpeza GCS concluída: ${removed} arquivos antigos removidos`
      );
    }

    // Também limpar arquivos locais antigos (backup)
    const saveLocalBackup = process.env.SAVE_LOCAL_BACKUP === "true";
    if (saveLocalBackup && fs.existsSync(uploadsDir)) {
      const files = await fs.promises.readdir(uploadsDir);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 dias
      let localRemoved = 0;

      for (const file of files) {
        if (!file.startsWith("profile-")) continue;

        const filePath = path.join(uploadsDir, file);
        const stats = await fs.promises.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.promises.unlink(filePath);
          serverCache.invalidate(`/uploads/profiles/${file}`);
          localRemoved++;
        }
      }

      if (localRemoved > 0) {
        console.log(
          `🗑️  Limpeza local concluída: ${localRemoved} backups antigos removidos`
        );
      }
    }
  } catch (error) {
    console.error("⚠️  Erro na limpeza de arquivos antigos:", error);
    // Não interrompe o fluxo principal
  }

  next();
};

// Função utilitária para invalidar cache de usuário
const invalidateUserCache = (userId) => {
  try {
    const pattern = `profile-${userId}-`;
    const removed = serverCache.invalidatePattern(pattern);
    console.log(`🔄 Cache invalidado para usuário ${userId}: ${removed} itens`);
    return removed;
  } catch (error) {
    console.error("Erro ao invalidar cache do usuário:", error);
    return 0;
  }
};

// Função para verificar saúde do sistema de upload
const getUploadHealth = async () => {
  try {
    // Verificar saúde do GCS
    const gcsHealth = await gcsService.checkHealth();

    // Verificar diretório local
    const dirExists = fs.existsSync(uploadsDir);
    let localStats = null;

    if (dirExists) {
      const stats = fs.statSync(uploadsDir);
      const files = fs.readdirSync(uploadsDir);
      const profileFiles = files.filter((f) => f.startsWith("profile-"));

      localStats = {
        directory: uploadsDir,
        totalFiles: files.length,
        profileImages: profileFiles.length,
      };
    }

    return {
      healthy: gcsHealth.healthy,
      storage: {
        primary: {
          type: "Google Cloud Storage",
          ...gcsHealth,
        },
        backup: {
          type: "Local Filesystem",
          enabled: process.env.SAVE_LOCAL_BACKUP === "true",
          healthy: dirExists,
          ...localStats,
        },
      },
      cacheStats: serverCache.getStats(),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
};

module.exports = {
  upload: upload.single("profilePhoto"),
  processProfileImage,
  validateImageDimensions,
  cleanupOldImages,
  invalidateUserCache,
  invalidateHttpCache,
  getUploadHealth,
  uploadsDir,
};
