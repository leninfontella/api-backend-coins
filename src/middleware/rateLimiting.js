// src/middleware/rateLimiting.js
const rateLimit = require("express-rate-limit");

// Rate limit para doações - máximo 10 doações por minuto
const donationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 requests por minuto
  message: {
    success: false,
    message: "Muitas tentativas de doação. Tente novamente em 1 minuto.",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit por usuário logado
    return req.user?.id || req.ip;
  },
});

// Rate limit para busca - máximo 30 buscas por minuto
const searchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Muitas buscas realizadas. Tente novamente em 1 minuto.",
    retryAfter: 60,
  },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

// Rate limit geral para API
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // máximo 1000 requests por 15 minutos
  message: {
    success: false,
    message: "Muitas requisições realizadas. Tente novamente em 15 minutos.",
    retryAfter: 900,
  },
});

module.exports = {
  donationRateLimit,
  searchRateLimit,
  apiRateLimit,
};
