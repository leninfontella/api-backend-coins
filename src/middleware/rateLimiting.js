// src/middleware/rateLimiting.js
const rateLimit = require("express-rate-limit");

// Rate limiter específico para dashboard - mais permissivo pois são consultas
const dashboardRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 30, // máximo 30 requests por 5 minutos
  message: {
    success: false,
    message: "Muitas consultas ao dashboard. Tente novamente em 5 minutos.",
    code: "DASHBOARD_RATE_LIMIT",
  },
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message:
        "Muitas consultas ao dashboard. Tente novamente em alguns minutos.",
      code: "DASHBOARD_RATE_LIMIT",
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    });
  },
});

// Rate limiter para atualizações de metas - mais restritivo
const goalUpdateRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 atualizações de meta por 15 minutos
  message: {
    success: false,
    message: "Muitas atualizações de meta. Tente novamente em 15 minutos.",
    code: "GOAL_UPDATE_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message:
        "Você está atualizando a meta com muita frequência. Tente novamente em alguns minutos.",
      code: "GOAL_UPDATE_RATE_LIMIT",
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    });
  },
});

// Rate limiter para consultas de interações - moderado
const interactionsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 20, // máximo 20 consultas por 10 minutos
  message: {
    success: false,
    message: "Muitas consultas de interações. Tente novamente em 10 minutos.",
    code: "INTERACTIONS_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Muitas consultas de interações. Aguarde alguns minutos.",
      code: "INTERACTIONS_RATE_LIMIT",
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    });
  },
});

// Rate limiter geral para doações - muito restritivo
const donationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // máximo 5 doações por minuto
  message: {
    success: false,
    message: "Muitas doações em pouco tempo. Aguarde 1 minuto.",
    code: "DONATION_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message:
        "Você está fazendo doações muito rapidamente. Aguarde um momento.",
      code: "DONATION_RATE_LIMIT",
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    });
  },
});

// Rate limiter para APIs públicas/busca de usuários
const searchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 50, // máximo 50 buscas por 5 minutos
  message: {
    success: false,
    message: "Muitas buscas. Tente novamente em 5 minutos.",
    code: "SEARCH_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Muitas buscas realizadas. Aguarde alguns minutos.",
      code: "SEARCH_RATE_LIMIT",
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    });
  },
});

module.exports = {
  dashboardRateLimit,
  goalUpdateRateLimit,
  interactionsRateLimit,
  donationRateLimit,
  searchRateLimit,
};
