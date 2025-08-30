const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, "../uploads/profiles");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const filename = `profile-${req.user.id}-${timestamp}.webp`;
    const filepath = path.join(uploadsDir, filename);

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
    };

    console.log(
      `Imagem processada com sucesso: ${filename} (${stats.size} bytes)`
    );

    next();
  } catch (error) {
    console.error("Erro ao processar imagem:", error);

    // Tentar limpar arquivo parcialmente criado
    if (req.processedImage && req.processedImage.fullPath) {
      try {
        await fs.promises.unlink(req.processedImage.fullPath);
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
    }

    const err = new Error(errorMessage);
    err.status = 400;
    next(err);
  }
};

// Middleware adicional para validar dimensões da imagem
const validateImageDimensions = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const metadata = await sharp(req.file.buffer).metadata();

    // Validar dimensões mínimas
    if (metadata.width < 50 || metadata.height < 50) {
      return res.status(400).json({
        success: false,
        message: "A imagem deve ter pelo menos 50x50 pixels",
      });
    }

    // Validar dimensões máximas
    if (metadata.width > 5000 || metadata.height > 5000) {
      return res.status(400).json({
        success: false,
        message: "A imagem não pode exceder 5000x5000 pixels",
      });
    }

    next();
  } catch (error) {
    console.error("Erro ao validar dimensões:", error);
    return res.status(400).json({
      success: false,
      message: "Erro ao validar imagem",
    });
  }
};

module.exports = {
  upload: upload.single("profilePhoto"),
  processProfileImage,
  validateImageDimensions,
  uploadsDir,
};
