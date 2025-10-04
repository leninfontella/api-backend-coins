const path = require("path");
const fs = require("fs");

/**
 * Middleware para cache HTTP de imagens - VERSÃO MOBILE-FRIENDLY
 * DESABILITA cache agressivo para permitir atualizações imediatas
 */
const imageCache = (req, res, next) => {
  const filePath = req.path;

  if (filePath.includes("/profiles/")) {
    console.log(`Cache middleware para: ${filePath}`);

    try {
      const fullPath = path.join(__dirname, "../uploads", filePath);

      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);

        // CRÍTICO: Headers para FORÇAR revalidação em mobile
        res.set({
          // NO-CACHE agressivo para mobile
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",

          // Permitir CORS
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",

          // ETag ainda é útil, mas não para cache
          ETag: `"${stats.mtime.getTime()}-${stats.size}"`,
          "Last-Modified": stats.mtime.toUTCString(),

          // Vary para diferentes dispositivos
          Vary: "Accept-Encoding, User-Agent",
        });

        // REMOVIDO: Lógica de 304 Not Modified
        // Sempre retornar 200 com a imagem para garantir atualização

        console.log(
          `Forçando nova requisição (sem cache): ${path.basename(filePath)}`
        );
      } else {
        console.log(`Arquivo não encontrado: ${fullPath}`);
      }
    } catch (error) {
      console.error("Erro no cache middleware:", error);
    }
  }

  next();
};

/**
 * DESABILITADO: invalidateCache
 * Não é mais necessário com no-cache
 */
const invalidateCache = (imagePath) => {
  console.log(
    `Cache invalidation não necessário (no-cache ativo): ${imagePath}`
  );
};

/**
 * Middleware para adicionar headers de no-cache em todas as imagens
 */
const addCacheHeaders = (req, res, next) => {
  const originalSendFile = res.sendFile;

  res.sendFile = function (filePath, options, callback) {
    if (req.path.includes("/profiles/")) {
      try {
        const stats = fs.statSync(filePath);

        // CRÍTICO: No-cache para mobile
        this.set({
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
          ETag: `"${stats.mtime.getTime()}-${stats.size}"`,
          "Last-Modified": stats.mtime.toUTCString(),
          "Access-Control-Allow-Origin": "*",
        });

        console.log(`Headers no-cache adicionados: ${path.basename(filePath)}`);
      } catch (error) {
        console.error("Erro ao definir headers de cache:", error);
      }
    }

    return originalSendFile.call(this, filePath, options, callback);
  };

  next();
};

/**
 * NOVO: Middleware para OPTIONS (CORS preflight)
 */
const handleCorsOptions = (req, res, next) => {
  if (req.method === "OPTIONS") {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.status(204).end();
  }
  next();
};

module.exports = {
  imageCache,
  invalidateCache,
  addCacheHeaders,
  handleCorsOptions,
};
