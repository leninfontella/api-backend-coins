const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  let token;

  try {
    // 🔍 Detectar token de múltiplas fontes (Authorization header e cookies)
    if (req.headers.authorization) {
      if (req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.substring(7);
      } else {
        // Caso o token venha sem "Bearer "
        token = req.headers.authorization;
      }
    } else {
      // Fallback para cookie se não houver Authorization header
      token = req.cookies?.accessToken;
    }

    // 🐛 DEBUG: Log do token recebido (apenas em desenvolvimento)
    if (process.env.NODE_ENV === "development") {
      console.log("🔐 Auth Debug:", {
        authHeader: req.headers.authorization,
        hasCookie: !!req.cookies?.accessToken,
        token: token ? `${token.substring(0, 20)}...` : "NENHUM",
        hasToken: !!token,
      });
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token de acesso não fornecido",
        debug:
          process.env.NODE_ENV === "development"
            ? "Authorization header and cookie missing"
            : undefined,
      });
    }

    // 🔍 Verificar se JWT_SECRET existe
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET não configurado!");
      return res.status(500).json({
        success: false,
        message: "Configuração do servidor incorreta",
      });
    }

    // Verificar e decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (process.env.NODE_ENV === "development") {
      console.log("✅ Token decodificado:", { userId: decoded.id });
    }

    // Buscar usuário no banco
    const user = await User.findById(decoded.id).select(
      "-password -refreshTokens"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Usuário não encontrado",
        debug:
          process.env.NODE_ENV === "development"
            ? `User ID ${decoded.id} not found in database`
            : undefined,
      });
    }

    // 🔍 Verificar se a conta está ativa
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Conta desativada",
      });
    }

    // Adicionar dados do usuário ao request
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      // Adicionar outros campos necessários do usuário
      ...user.toObject(),
    };

    if (process.env.NODE_ENV === "development") {
      console.log("✅ Usuário autenticado:", req.user.name);
    }

    next();
  } catch (error) {
    console.error("❌ Erro no middleware de autenticação:", error.message);

    // 🔍 Tratamento específico de erros de JWT
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Token inválido",
        debug:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expirado",
        debug:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // Erro genérico do servidor
    return res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      debug: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = authMiddleware;
