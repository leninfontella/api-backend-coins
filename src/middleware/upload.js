const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// 🆕 IMPORT PARA CACHE
const serverCache = require("../utils/serverCache");

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, "../uploads/profiles");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`📁 Diretório de uploads criado: ${uploadsDir}`);
}

// Configuração do storage
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

// Middleware para processar e salvar a imagem
const processProfileImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    console.log(`📤 Processando upload de imagem para usuário: ${req.user.id}`);

    // 🆕 INVALIDAR CACHE DA IMAGEM ANTIGA ANTES DE PROCESSAR
    if (req.user.profileImage) {
      const oldImagePath = `/uploads/profiles/${req.user.profileImage}`;
      serverCache.invalidate(oldImagePath);
      console.log(
        `🔄 Cache invalidado para imagem antiga: ${req.user.profileImage}`
      );

      // Remover arquivo físico antigo
      const oldFilePath = path.join(uploadsDir, req.user.profileImage);
      if (fs.existsSync(oldFilePath)) {
        try {
          await fs.promises.unlink(oldFilePath);
          console.log(`🗑️  Arquivo antigo removido: ${req.user.profileImage}`);
        } catch (unlinkError) {
          console.error(
            `⚠️  Erro ao remover arquivo antigo: ${unlinkError.message}`
          );
          // Não interrompe o processo se não conseguir remover o arquivo antigo
        }
      }
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const filename = `profile-${req.user.id}-${timestamp}.webp`;
    const filepath = path.join(uploadsDir, filename);

    console.log(`🔄 Gerando nova imagem: ${filename}`);

    // Processar imagem com sharp
    const imageBuffer = await sharp(req.file.buffer)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .webp({
        quality: 85,
        effort: 4, // Melhor compressão
      })
      .toBuffer();

    // Salvar arquivo processado
    await fs.promises.writeFile(filepath, imageBuffer);

    // Verificar se o arquivo foi criado com sucesso
    const stats = await fs.promises.stat(filepath);

    if (!stats.isFile()) {
      throw new Error("Falha ao criar arquivo de imagem");
    }

    // 🆕 PRÉ-CARREGAR A NOVA IMAGEM NO CACHE
    const newImagePath = `/uploads/profiles/${filename}`;
    serverCache.set(newImagePath, imageBuffer, "image/webp", stats.size);
    console.log(`💾 Nova imagem pré-carregada no cache: ${filename}`);

    // Adicionar informações da imagem ao req
    req.processedImage = {
      filename: filename,
      path: `/uploads/profiles/${filename}`,
      fullPath: filepath,
      size: stats.size,
      originalName: req.file.originalname,
      originalSize: req.file.size,
      mimetype: "image/webp",
      processedAt: new Date(),
      cached: true, // 🆕 Indicador de que foi cacheada
    };

    console.log(
      `✅ Imagem processada com sucesso: ${filename} (${stats.size} bytes)`
    );

    next();
  } catch (error) {
    console.error("❌ Erro ao processar imagem:", error);

    // 🆕 LIMPAR CACHE EM CASO DE ERRO
    if (req.processedImage && req.processedImage.path) {
      serverCache.invalidate(req.processedImage.path);
    }

    // Tentar limpar arquivo parcialmente criado
    if (req.processedImage && req.processedImage.fullPath) {
      try {
        await fs.promises.unlink(req.processedImage.fullPath);
        console.log(`🧹 Arquivo parcial removido após erro`);
      } catch (cleanupError) {
        console.error("Erro ao limpar arquivo:", cleanupError);
      }
    }

    // Retornar erro específico baseado no tipo
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

// 🆕 MIDDLEWARE PARA LIMPEZA DE IMAGENS ANTIGAS (OPCIONAL)
const cleanupOldImages = async (req, res, next) => {
  try {
    // Executar limpeza apenas ocasionalmente (1% de chance)
    if (Math.random() > 0.01) {
      return next();
    }

    console.log(`🧹 Executando limpeza de imagens antigas...`);

    const files = await fs.promises.readdir(uploadsDir);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 dias
    let removed = 0;

    for (const file of files) {
      if (!file.startsWith("profile-")) continue;

      const filePath = path.join(uploadsDir, file);
      const stats = await fs.promises.stat(filePath);

      // Remove arquivos muito antigos
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.promises.unlink(filePath);
        serverCache.invalidate(`/uploads/profiles/${file}`);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(
        `🗑️  Limpeza concluída: ${removed} arquivos antigos removidos`
      );
    }
  } catch (error) {
    console.error("⚠️  Erro na limpeza de arquivos antigos:", error);
    // Não interrompe o fluxo principal
  }

  next();
};

// 🆕 FUNÇÃO UTILITÁRIA PARA INVALIDAR CACHE DE USUÁRIO
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

// 🆕 FUNÇÃO PARA VERIFICAR SAÚDE DO SISTEMA DE UPLOAD
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
      diskSpace: "N/A", // Pode ser implementado com libraries específicas
      cacheStats: serverCache.getStats(),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
};

/**
 * Middleware para cache HTTP de imagens de perfil
 * Reduz requisições desnecessárias usando headers HTTP
 */
const imageCache = (req, res, next) => {
  const filePath = req.path;

  // Aplica apenas para imagens de perfil
  if (filePath.includes("/uploads/profiles/")) {
    console.log(`🖼️  Cache middleware para: ${filePath}`);

    try {
      const fullPath = path.join(__dirname, "..", filePath);

      // Verifica se arquivo existe
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
        const lastModified = stats.mtime.toUTCString();

        // Define headers de cache
        res.set({
          "Cache-Control": "public, max-age=3600", // 1 hora
          ETag: etag,
          "Last-Modified": lastModified,
          Expires: new Date(Date.now() + 3600000).toUTCString(),
          Vary: "Accept-Encoding",
        });

        // Se browser já tem a imagem (mesmo ETag)
        if (req.headers["if-none-match"] === etag) {
          console.log(`✅ Cache HIT (ETag): ${path.basename(filePath)}`);
          return res.status(304).end();
        }

        // Se arquivo não foi modificado
        if (req.headers["if-modified-since"]) {
          const clientDate = new Date(req.headers["if-modified-since"]);
          if (stats.mtime <= clientDate) {
            console.log(`✅ Cache HIT (Modified): ${path.basename(filePath)}`);
            return res.status(304).end();
          }
        }

        console.log(`❌ Cache MISS: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error("Erro no cache middleware:", error);
    }
  }

  next();
};

/**
 * Middleware específico para invalidar cache quando necessário
 */
const invalidateCache = (imagePath) => {
  try {
    console.log(`🔄 Invalidando cache para: ${imagePath}`);
    // O cache será invalidado automaticamente quando o arquivo for modificado
    // devido ao ETag baseado em mtime
  } catch (error) {
    console.error("Erro ao invalidar cache:", error);
  }
};

module.exports = {
  upload: upload.single("profilePhoto"),
  processProfileImage,
  validateImageDimensions,
  cleanupOldImages,
  invalidateUserCache,
  getUploadHealth,
  uploadsDir,
  imageCache,
  invalidateCache,
};
