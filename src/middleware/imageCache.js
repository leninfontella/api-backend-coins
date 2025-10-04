const path = require("path");
const fs = require("fs");

/**
 * Middleware para cache HTTP de imagens de perfil
 * Reduz requisições desnecessárias usando headers HTTP
 */
const imageCache = (req, res, next) => {
  const filePath = req.path;

  // Aplica apenas para imagens de perfil
  if (filePath.includes("/profiles/")) {
    console.log(`🖼️  Cache middleware para: ${filePath}`);

    try {
      // CORREÇÃO: Caminho correto para os arquivos
      const fullPath = path.join(__dirname, "../uploads", filePath);

      // Verifica se arquivo existe
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
        const lastModified = stats.mtime.toUTCString();

        // Define headers de cache
        res.set({
          "Cache-Control": "public, max-age=3600, must-revalidate", // 1 hora
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
      } else {
        console.log(`⚠️  Arquivo não encontrado: ${fullPath}`);
      }
    } catch (error) {
      console.error("Erro no cache middleware:", error);
    }
  }

  next();
};

/**
 * Middleware específico para invalidar cache quando necessário
 * Modifica o mtime do arquivo para forçar nova validação
 */
const invalidateCache = (imagePath) => {
  try {
    console.log(`🔄 Invalidando cache para: ${imagePath}`);

    // Converte path relativo para absoluto
    const fullPath = path.join(__dirname, "../uploads", imagePath);

    if (fs.existsSync(fullPath)) {
      // Atualiza o mtime para invalidar ETags
      const now = new Date();
      fs.utimesSync(fullPath, now, now);
      console.log(`✅ Cache invalidado com sucesso: ${imagePath}`);
    } else {
      console.log(`⚠️  Arquivo não encontrado para invalidar: ${fullPath}`);
    }
  } catch (error) {
    console.error("Erro ao invalidar cache:", error);
  }
};

/**
 * Middleware para adicionar headers de cache em todas as imagens
 */
const addCacheHeaders = (req, res, next) => {
  // Override do res.sendFile para adicionar headers
  const originalSendFile = res.sendFile;

  res.sendFile = function (filePath, options, callback) {
    // Se é uma imagem de perfil, adiciona headers de cache
    if (req.path.includes("/profiles/")) {
      try {
        const stats = fs.statSync(filePath);
        const etag = `"${stats.mtime.getTime()}-${stats.size}"`;

        this.set({
          "Cache-Control": "public, max-age=3600, must-revalidate",
          ETag: etag,
          "Last-Modified": stats.mtime.toUTCString(),
          Expires: new Date(Date.now() + 3600000).toUTCString(),
        });
      } catch (error) {
        console.error("Erro ao definir headers de cache:", error);
      }
    }

    return originalSendFile.call(this, filePath, options, callback);
  };

  next();
};

module.exports = {
  imageCache,
  invalidateCache,
  addCacheHeaders,
};
