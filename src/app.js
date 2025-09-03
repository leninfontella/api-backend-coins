const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/userRoutes");
const donationRoutes = require("./routes/donations");
const rankingRoutes = require("./routes/rankingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const profileRoutes = require("./routes/profileRoutes");
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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

// 🔧 CORREÇÃO: Rate limit mais generoso para uploads de foto
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 uploads por 15 minutos (mais generoso)
  message: {
    success: false,
    message: "Muitos uploads de foto. Tente novamente em 15 minutos.",
  },
});

// 🔧 CRÍTICO: Aplicar rate limit específico apenas para uploads de foto
app.use("/api/profile/upload-photo", uploadLimiter);

// Rate limit mais restritivo para atualizações completas do perfil
const profileUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 atualizações completas por 15 minutos
  message: {
    success: false,
    message: "Muitas atualizações de perfil. Tente novamente em 15 minutos.",
  },
});

// Aplicar ao endpoint de atualização completa
app.use("/api/profile", (req, res, next) => {
  // Aplicar rate limit apenas para PUT (atualização completa)
  if (req.method === "PUT") {
    return profileUpdateLimiter(req, res, next);
  }
  next();
});

// ========== ROTAS ==========
app.use("/api/auth", authRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ranking", rankingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);

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
      separatePhotoUpload: true, // 🔧 Nova feature
    },
    endpoints: [
      "GET  /",
      "GET  /api/health",
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
      "PUT  /api/profile", // Atualização completa
      "POST /api/profile/upload-photo", // 🔧 Upload apenas de foto
      "DELETE /api/profile/photo",
    ],
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API funcionando normalmente",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    features: {
      authentication: true,
      userCoins: true,
      rateLimiting: true,
      security: true,
      ranking: true,
      dashboard: true,
      profileUpload: true,
      separatePhotoUpload: true,
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
