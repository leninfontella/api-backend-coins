const errorHandler = (err, req, res, next) => {
  console.error("🚨 Erro não tratado:", err);

  // Erro de validação do MongoDB
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  // Erro de cast do MongoDB (ID inválido)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "ID inválido",
    });
  }

  // Erro de duplicação (chave única) - código 11000
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} já está em uso`,
    });
  }

  // Erro de JWT
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Token inválido",
    });
  }

  // Token expirado
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expirado",
    });
  }

  // Erro de sintaxe JSON
  if (err.name === "SyntaxError" && err.message.includes("JSON")) {
    return res.status(400).json({
      success: false,
      message: "JSON inválido na requisição",
    });
  }

  // Erro de CORS
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      success: false,
      message: "Acesso negado - Origin não permitida",
    });
  }

  // Erro de rate limit
  if (err.message && err.message.includes("rate limit")) {
    return res.status(429).json({
      success: false,
      message: err.message,
    });
  }

  // Determinar status code
  const statusCode =
    err.status ||
    err.statusCode ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  // Erro genérico
  res.status(statusCode).json({
    success: false,
    message: err.message || "Erro interno do servidor",
    debug:
      process.env.NODE_ENV === "development"
        ? {
            stack: err.stack,
            name: err.name,
          }
        : undefined,
  });
};

module.exports = errorHandler;
