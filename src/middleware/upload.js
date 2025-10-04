const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const serverCache = require("../utils/serverCache");

const uploadsDir = path.join(__dirname, "../uploads/profiles");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`DiretÃ³rio de uploads criado: ${uploadsDir}`);
}

const storage = multer.memoryStorage();

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

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

const invalidateHttpCache = (filename) => {
  try {
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      const now = new Date();
      fs.utimesSync(filePath, now, now);
      console.log(`Cache HTTP invalidado: ${filename}`);
    }
  } catch (error) {
    console.error("Erro ao invalidar cache HTTP:", error);
  }
};

// FUNÇÃO NOVA: Forçar no-cache nos headers da resposta
const setNoCacheHeaders = (res) => {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
};

const processProfileImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    console.log(`Processando upload de imagem para usuário: ${req.user.id}`);

    // Invalidar e remover imagem antiga
    if (req.user.profileImage) {
      const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;

      serverCache.invalidate(oldImagePath);
      invalidateHttpCache(req.user.profileImage);

      console.log(
        `Caches invalidados para imagem antiga: ${req.user.profileImage}`
      );

      const oldFilePath = path.join(uploadsDir, req.user.profileImage);
      if (fs.existsSync(oldFilePath)) {
        try {
          await fs.promises.unlink(oldFilePath);
          console.log(`Arquivo antigo removido: ${req.user.profileImage}`);
        } catch (unlinkError) {
          console.error(
            `Erro ao remover arquivo antigo: ${unlinkError.message}`
          );
        }
      }
    }

    // CRÍTICO: Usar timestamp + random para garantir URL única
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const filename = `profile-${req.user.id}-${timestamp}-${randomSuffix}.webp`;
    const filepath = path.join(uploadsDir, filename);

    console.log(`Gerando nova imagem: ${filename}`);

    const imageBuffer = await sharp(req.file.buffer)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .webp({
        quality: 85,
        effort: 4,
      })
      .toBuffer();

    await fs.promises.writeFile(filepath, imageBuffer);

    const stats = await fs.promises.stat(filepath);

    if (!stats.isFile()) {
      throw new Error("Falha ao criar arquivo de imagem");
    }

    // PRÉ-CARREGAR no cache em memória
    const newImagePath = `/uploads/profiles/${filename}`;
    serverCache.set(newImagePath, imageBuffer, "image/webp", stats.size);
    console.log(`Nova imagem pré-carregada no cache: ${filename}`);

    // CRÍTICO: Adicionar timestamp na URL para mobile
    const urlWithTimestamp = `${newImagePath}?t=${timestamp}&v=${randomSuffix}`;

    req.processedImage = {
      filename: filename,
      path: newImagePath,
      pathWithTimestamp: urlWithTimestamp,
      fullPath: filepath,
      size: stats.size,
      originalName: req.file.originalname,
      originalSize: req.file.size,
      mimetype: "image/webp",
      processedAt: new Date(),
      cached: true,
      mtime: stats.mtime,
      timestamp: timestamp,
      cacheBuster: randomSuffix,
    };

    console.log(
      `Imagem processada com sucesso: ${filename} (${stats.size} bytes)`
    );

    next();
  } catch (error) {
    console.error("Erro ao processar imagem:", error);

    if (req.processedImage && req.processedImage.path) {
      serverCache.invalidate(req.processedImage.path);
    }

    if (req.processedImage && req.processedImage.fullPath) {
      try {
        await fs.promises.unlink(req.processedImage.fullPath);
        console.log(`Arquivo parcial removido após erro`);
      } catch (cleanupError) {
        console.error("Erro ao limpar arquivo:", cleanupError);
      }
    }

    let errorMessage = "Erro ao processar imagem";

    if (error.message.includes("Input file")) {
      errorMessage = "Arquivo de imagem inválido ou corrompido";
    } else if (error.message.includes("ENOSPC")) {
      errorMessage = "Espaço em disco insuficiente";
    } else if (error.message.includes("EACCES")) {
      errorMessage = "Permissão negada para salvar arquivo";
    } else if (error.message.includes("Input buffer")) {
      errorMessage = "Formato de imagem não suportado";
    }

    const err = new Error(errorMessage);
    err.status = 400;
    err.originalError = error.message;
    next(err);
  }
};

const validateImageDimensions = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    console.log(`Validando dimensões da imagem...`);
    const metadata = await sharp(req.file.buffer).metadata();

    console.log(`Dimensões da imagem: ${metadata.width}x${metadata.height}px`);

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

    if (!metadata.width || !metadata.height) {
      return res.status(400).json({
        success: false,
        message: "Arquivo de imagem inválido ou corrompido",
      });
    }

    console.log(`Validação de dimensões aprovada`);
    next();
  } catch (error) {
    console.error("Erro ao validar dimensões:", error);
    return res.status(400).json({
      success: false,
      message: "Erro ao validar imagem - arquivo pode estar corrompido",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const cleanupOldImages = async (req, res, next) => {
  try {
    if (Math.random() > 0.01) {
      return next();
    }

    console.log(`Executando limpeza de imagens antigas...`);

    const files = await fs.promises.readdir(uploadsDir);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const file of files) {
      if (!file.startsWith("profile-")) continue;

      const filePath = path.join(uploadsDir, file);
      const stats = await fs.promises.stat(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        await fs.promises.unlink(filePath);
        serverCache.invalidate(`/uploads/profiles/${file}`);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`Limpeza concluída: ${removed} arquivos antigos removidos`);
    }
  } catch (error) {
    console.error("Erro na limpeza de arquivos antigos:", error);
  }

  next();
};

const invalidateUserCache = (userId) => {
  try {
    const pattern = `profile-${userId}-`;
    const removed = serverCache.invalidatePattern(pattern);
    console.log(`Cache invalidado para usuário ${userId}: ${removed} itens`);
    return removed;
  } catch (error) {
    console.error("Erro ao invalidar cache do usuário:", error);
    return 0;
  }
};

const getUploadHealth = () => {
  try {
    const dirExists = fs.existsSync(uploadsDir);
    const stats = fs.statSync(uploadsDir);
    const files = fs.readdirSync(uploadsDir);
    const profileFiles = files.filter((f) => f.startsWith("profile-"));

    return {
      healthy: dirExists && stats.isDirectory(),
      directory: uploadsDir,
      totalFiles: files.length,
      profileImages: profileFiles.length,
      diskSpace: "N/A",
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
  setNoCacheHeaders, // EXPORTAR nova função
};
