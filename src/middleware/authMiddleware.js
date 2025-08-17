// ========== 1. CORREÇÃO authMiddleware.js ==========
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  let token;

  // 🔍 CORREÇÃO: Melhor detecção de token
  if (req.headers.authorization) {
    if (req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else {
      // Caso o token venha sem "Bearer "
      token = req.headers.authorization;
    }
  }

  // 🐛 DEBUG: Log do token recebido
  console.log("🔐 Auth Debug:", {
    authHeader: req.headers.authorization,
    token: token ? `${token.substring(0, 20)}...` : "NENHUM",
    hasToken: !!token,
  });

  if (!token) {
    console.log("❌ Token não fornecido");
    return res.status(401).json({
      success: false,
      message: "Token não fornecido",
      debug: "Authorization header missing or invalid",
    });
  }

  try {
    // 🔍 CORREÇÃO: Verificar se JWT_SECRET existe
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET não configurado!");
      return res.status(500).json({
        success: false,
        message: "Configuração do servidor incorreta",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token decodificado:", { userId: decoded.id });

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.log("❌ Usuário não encontrado para ID:", decoded.id);
      return res.status(401).json({
        success: false,
        message: "Usuário não encontrado",
        debug: `User ID ${decoded.id} not found in database`,
      });
    }

    // 🔍 CORREÇÃO: Adicionar mais dados ao req.user
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    console.log("✅ Usuário autenticado:", req.user.name);
    next();
  } catch (err) {
    console.error("❌ Erro de token:", err.message);

    // 🔍 CORREÇÃO: Mensagens mais específicas
    let errorMessage = "Token inválido ou expirado";
    if (err.name === "TokenExpiredError") {
      errorMessage = "Token expirado";
    } else if (err.name === "JsonWebTokenError") {
      errorMessage = "Token inválido";
    }

    return res.status(401).json({
      success: false,
      message: errorMessage,
      debug: err.message,
    });
  }
};
