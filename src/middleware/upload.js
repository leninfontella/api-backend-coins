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
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Apenas arquivos de imagem são permitidos!"), false);
  }
};

// Configuração do multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limite
  },
});

// Middleware para processar e salvar a imagem
const processProfileImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const filename = `profile-${req.user.id}-${Date.now()}.webp`;
    const filepath = path.join(uploadsDir, filename);

    // Processar imagem com sharp
    await sharp(req.file.buffer)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toFile(filepath);

    // Adicionar informações da imagem ao req
    req.processedImage = {
      filename: filename,
      path: `/uploads/profiles/${filename}`,
      size: req.file.size,
      originalName: req.file.originalname,
    };

    next();
  } catch (error) {
    console.error("Erro ao processar imagem:", error);
    next(new Error("Erro ao processar imagem"));
  }
};

module.exports = {
  upload: upload.single("profilePhoto"),
  processProfileImage,
};
