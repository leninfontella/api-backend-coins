const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Middleware de autenticação JWT
 * Verifica se o token é válido e adiciona os dados do usuário na requisição
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token de acesso não fornecido",
        code: "NO_TOKEN",
      });
    }

    // Verificar se JWT_SECRET está definido
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET não definido nas variáveis de ambiente");
      return res.status(500).json({
        success: false,
        message: "Erro de configuração do servidor",
        code: "JWT_SECRET_MISSING",
      });
    }

    // Verificar e decodificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Buscar usuário no banco de dados
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
        code: "USER_NOT_FOUND",
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Conta de usuário desativada",
        code: "USER_INACTIVE",
      });
    }

    // Adicionar dados do usuário à requisição
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      isVerified: user.isVerified,
      level: user.level,
      coins: user.coins,
    };

    next();
  } catch (error) {
    console.error("Erro na autenticação:", error);

    // Diferentes tipos de erro do JWT
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expirado. Faça login novamente",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Token inválido",
        code: "INVALID_TOKEN",
      });
    }

    if (error.name === "NotBeforeError") {
      return res.status(401).json({
        success: false,
        message: "Token ainda não é válido",
        code: "TOKEN_NOT_ACTIVE",
      });
    }

    // Erro genérico
    return res.status(500).json({
      success: false,
      message: "Erro interno do servidor na autenticação",
      code: "AUTH_ERROR",
    });
  }
};

/**
 * Middleware opcional - permite acesso mesmo sem token
 * Adiciona dados do usuário se o token for válido, mas não bloqueia se não houver
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      // Sem token, mas continua
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (user && user.isActive) {
      req.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        isVerified: user.isVerified,
        level: user.level,
        coins: user.coins,
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    // Em caso de erro, continua sem usuário autenticado
    req.user = null;
    next();
  }
};

/**
 * Middleware para verificar se usuário é admin
 * Deve ser usado APÓS authenticateToken
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Autenticação necessária",
      code: "AUTH_REQUIRED",
    });
  }

  // Verificar se usuário tem permissão de admin
  // Ajuste conforme seu sistema de permissões
  if (!req.user.isAdmin && req.user.level !== "Admin") {
    return res.status(403).json({
      success: false,
      message: "Acesso negado. Permissão de administrador necessária",
      code: "ADMIN_REQUIRED",
    });
  }

  next();
};

/**
 * Middleware para verificar se o usuário é verificado
 */
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Autenticação necessária",
      code: "AUTH_REQUIRED",
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Conta não verificada. Verifique seu email",
      code: "VERIFICATION_REQUIRED",
    });
  }

  next();
};

/**
 * Middleware para verificar se o usuário possui moedas suficientes
 */
const checkBalance = (minimumAmount) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Autenticação necessária",
          code: "AUTH_REQUIRED",
        });
      }

      // Buscar dados atualizados do usuário
      const user = await User.findById(req.user.id).select("coins");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
          code: "USER_NOT_FOUND",
        });
      }

      const requiredAmount = minimumAmount || req.body.amount || 0;

      if (user.coins < requiredAmount) {
        return res.status(400).json({
          success: false,
          message: `Saldo insuficiente. Você tem ${user.coins} moedas, mas precisa de ${requiredAmount}`,
          code: "INSUFFICIENT_BALANCE",
          data: {
            currentBalance: user.coins,
            requiredAmount: requiredAmount,
            deficit: requiredAmount - user.coins,
          },
        });
      }

      // Atualizar dados do usuário na requisição com saldo atual
      req.user.coins = user.coins;
      next();
    } catch (error) {
      console.error("Erro ao verificar saldo:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao verificar saldo do usuário",
        code: "BALANCE_CHECK_ERROR",
      });
    }
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireVerified,
  checkBalance,
};
