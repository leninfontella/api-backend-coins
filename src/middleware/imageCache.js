const path = require("path");
const fs = require("fs");

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
  imageCache,
  invalidateCache,
};
