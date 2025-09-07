const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

// IMPORTS PARA CACHE - CORRIGIDOS
const { imageCache, addCacheHeaders } = require("./middleware/imageCache");
const serverCache = require("./utils/serverCache");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/userRoutes");
const donationRoutes = require("./routes/donations");
const rankingRoutes = require("./routes/rankingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const profileRoutes = require("./routes/profileRoutes");
const badgesRoutes = require("./routes/badgesRoutes"); // NOVO
const errorHandler = require("./middleware/errorHandler");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin não permitida pelo CORS: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// MIDDLEWARE DE CACHE HTTP PRIMEIRO (para todas as imagens)
app.use("/uploads", addCacheHeaders);

// MIDDLEWARE DE CACHE EM MEMÓRIA ESPECÍFICO PARA PROFILES
app.use("/uploads/profiles", async (req, res, next) => {
  try {
    const filename = req.path.substring(1); // Remove '/' inicial
    const imagePath = `/uploads/profiles/${filename}`;

    console.log(`📸 Requisição de imagem: ${filename}`);

    // Verifica cache em memória primeiro
    const cached = serverCache.get(imagePath);
    if (cached) {
      // Define headers apropriados antes de enviar do cache
      res.set({
        "Content-Type": cached.contentType,
        "Content-Length": cached.fileSize,
        "Cache-Control": "public, max-age=3600, must-revalidate",
        ETag: `"${cached.timestamp}-${cached.fileSize}"`,
        "Last-Modified": new Date(cached.timestamp).toUTCString(),
        Expires: new Date(Date.now() + 3600000).toUTCString(),
      });

      // Verifica se cliente já tem a versão atual (304 Not Modified)
      const clientEtag = req.headers["if-none-match"];
      const serverEtag = `"${cached.timestamp}-${cached.fileSize}"`;

      if (clientEtag === serverEtag) {
        console.log(`✅ Cache HIT + 304: ${filename}`);
        return res.status(304).end();
      }

      // Verifica por Last-Modified
      if (req.headers["if-modified-since"]) {
        const clientDate = new Date(req.headers["if-modified-since"]);
        const serverDate = new Date(cached.timestamp);
        if (serverDate <= clientDate) {
          console.log(`✅ Cache HIT + 304 (Modified): ${filename}`);
          return res.status(304).end();
        }
      }

      console.log(`✅ Cache HIT: ${filename}`);
      return res.send(cached.buffer);
    }

    console.log(`❌ Cache MISS: ${filename}`);
    next();
  } catch (error) {
    console.error("Erro no cache de imagem:", error);
    next();
  }
});

// MIDDLEWARE PARA INTERCEPTAR E CACHEAR ARQUIVOS SERVIDOS PELO EXPRESS.STATIC
app.use("/uploads/profiles", (req, res, next) => {
  const originalSendFile = res.sendFile;

  // Override do sendFile para cachear após servir
  res.sendFile = function (filePath, options, callback) {
    const fileName = path.basename(filePath);

    // Callback personalizado para cachear após envio bem-sucedido
    const customCallback = (err) => {
      if (!err && req.path.includes("profiles/")) {
        try {
          const buffer = fs.readFileSync(filePath);
          const stats = fs.statSync(filePath);
          const ext = path.extname(filePath).slice(1).toLowerCase();

          // Determinar content-type correto
          let contentType = "image/webp";
          if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
          else if (ext === "png") contentType = "image/png";
          else if (ext === "gif") contentType = "image/gif";

          // Armazena no cache em memória com timestamp do arquivo
          const cacheData = {
            buffer: buffer,
            contentType: contentType,
            fileSize: buffer.length,
            timestamp: stats.mtime.getTime(),
            imagePath: req.path,
          };

          serverCache.cache.set(serverCache.generateKey(req.path), cacheData);
          console.log(
            `💾 Arquivo cacheado após servir: ${fileName} (${buffer.length} bytes)`
          );
        } catch (cacheError) {
          console.error("Erro ao cachear arquivo servido:", cacheError);
        }
      }

      if (callback) callback(err);
    };

    return originalSendFile.call(this, filePath, options, customCallback);
  };

  next();
});

// Servir arquivos estáticos com cache otimizado
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1h",
    etag: true,
    lastModified: true,
    immutable: false,
    setHeaders: (res, filePath) => {
      // Headers específicos para imagens de perfil
      if (filePath.includes("profiles/")) {
        res.set("Cache-Control", "public, max-age=3600, must-revalidate");
        res.set("Vary", "Accept-Encoding");
      }
    },
  })
);

// RATE LIMITERS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Muitas requisições. Tente novamente em 15 minutos.",
  },
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Muitas tentativas de login. Tente novamente em 15 minutos.",
  },
});
app.use("/api/auth/", authLimiter);

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Muitos uploads de foto. Tente novamente em 15 minutos.",
  },
});
app.use("/api/profile/upload-photo", uploadLimiter);

const profileUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Muitas atualizações de perfil. Tente novamente em 15 minutos.",
  },
});

app.use("/api/profile", (req, res, next) => {
  if (req.method === "PUT") {
    return profileUpdateLimiter(req, res, next);
  }
  next();
});

// ROTAS
app.use("/api/auth", authRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ranking", rankingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/badges", badgesRoutes); // NOVO

// ROTAS DE CACHE COM AUTENTICAÇÃO
const authMiddleware = require("./middleware/authMiddleware");

app.get("/api/cache/stats", authMiddleware, (req, res) => {
  try {
    const stats = serverCache.getStats();
    res.json({
      success: true,
      data: {
        cache: {
          ...stats,
          efficiency:
            stats.hitRate > 50
              ? "Boa"
              : stats.hitRate > 20
              ? "Regular"
              : "Baixa",
        },
        cached_images: serverCache.listCached(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erro ao obter estatísticas do cache",
      error: error.message,
    });
  }
});

app.post("/api/cache/clear", authMiddleware, (req, res) => {
  try {
    const cleared = serverCache.clear();
    console.log(`🧹 Cache limpo manualmente por usuário: ${req.user.id}`);

    res.json({
      success: true,
      message: `Cache limpo: ${cleared} itens removidos`,
      data: {
        itemsRemoved: cleared,
        clearedBy: req.user.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erro ao limpar cache",
      error: error.message,
    });
  }
});

// Rota principal
app.get("/", (req, res) => {
  res.json({
    message: "API rodando ✅",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    features: {
      authentication: true,
      userCoins: true,
      rateLimiting: true,
      security: true,
      ranking: true,
      dashboard: true,
      profileUpload: true,
      separatePhotoUpload: true,
      imageCache: true,
      serverCache: true,
      badgeSystem: true, // NOVO
    },
    endpoints: [
      "GET  /",
      "GET  /api/health",
      "GET  /api/cache/stats",
      "POST /api/cache/clear",
      // Auth endpoints
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET  /api/auth/check",
      "POST /api/auth/refresh-token",
      "POST /api/auth/logout",
      "GET  /api/auth/me",
      // User endpoints
      "GET  /api/users/profile",
      "GET  /api/users/balance",
      "POST /api/users/update-balance",
      "GET  /api/users/stats",
      "GET  /api/users/search",
      // Badges endpoints - NOVO
      "GET  /api/badges",
      "GET  /api/badges/levels",
      "GET  /api/badges/progress",
      "GET  /api/badges/ranking",
      "PUT  /api/badges/refresh",
      // Ranking endpoints
      "GET  /api/ranking",
      "GET  /api/ranking/top10",
      "GET  /api/ranking/my-position",
      "GET  /api/ranking/around-me",
      "GET  /api/ranking/stats",
      // Dashboard endpoints
      "GET  /api/dashboard",
      "PUT  /api/dashboard/goal",
      "GET  /api/dashboard/interactions",
      // Profile endpoints
      "GET  /api/profile",
      "PUT  /api/profile",
      "POST /api/profile/upload-photo",
      "DELETE /api/profile/photo",
    ],
  });
});

// Health check
app.get("/api/health", (req, res) => {
  const cacheStats = serverCache.getStats();

  res.json({
    success: true,
    message: "API funcionando normalmente",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    cache: {
      status: "active",
      items: cacheStats.items,
      totalMB: cacheStats.totalMB,
      hitRate: cacheStats.hitRate.toFixed(2) + "%",
    },
    features: {
      authentication: true,
      userCoins: true,
      rateLimiting: true,
      security: true,
      ranking: true,
      dashboard: true,
      profileUpload: true,
      separatePhotoUpload: true,
      imageCache: true,
      serverCache: true,
      badgeSystem: true, // NOVO
    },
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Rota ${req.method} ${req.originalUrl} não encontrada`,
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

module.exports = app;
