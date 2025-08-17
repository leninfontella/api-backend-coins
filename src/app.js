const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/userRoutes");
const donationRoutes = require("./routes/donations");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// 🔹 Lista de origens permitidas
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
];

// 🔹 Configuração de CORS
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

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// Rate limiter básico
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

// Rate limiter específico para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Muitas tentativas de login. Tente novamente em 15 minutos.",
  },
});
app.use("/api/auth/", authLimiter);

// 🔹 Rotas (sempre depois do CORS e middlewares globais)
app.use("/api/auth", authRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/users", userRoutes);

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
    },
    endpoints: [
      "GET  /",
      "GET  /api/health",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "POST /api/auth/refresh-token",
      "POST /api/auth/logout",
      "GET  /api/auth/me",
      "GET  /api/users/profile",
      "GET  /api/users/balance",
      "POST /api/users/update-balance",
      "GET  /api/users/stats",
      "GET  /api/users/search",
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
    },
  });
});

// 🔹 Error handler (deve ser o último middleware)
app.use(errorHandler);

module.exports = app;
