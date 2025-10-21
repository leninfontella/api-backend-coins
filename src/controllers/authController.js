const User = require("../models/User");
const Token = require("../models/Token");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../services/emailService");

// ========== HELPERS ==========

const createAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });
};

const createRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  });
};

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cookieOptions(req) {
  const secure = cookieSecure();
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    maxAge: msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"),
  };
}

function cookieSecure() {
  return (
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production"
  );
}

function msToMillis(str) {
  try {
    const num = parseInt(str.slice(0, -1), 10);
    const unit = str.slice(-1);
    if (unit === "d") return num * 24 * 60 * 60 * 1000;
    if (unit === "h") return num * 60 * 60 * 1000;
    if (unit === "m") return num * 60 * 1000;
    return parseInt(str, 10);
  } catch (e) {
    return 7 * 24 * 60 * 60 * 1000;
  }
}

// ========== AUTENTICAÇÃO BÁSICA ==========

exports.register = async (req, res, next) => {
  const errors = validationResult(req);

  console.log("📝 Dados recebidos no registro:", req.body);
  console.log("⚠️ Erros de validação:", errors.array());

  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { name, email, phone, password, cpf } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: "Email já cadastrado!" });

    const cpfExists = await User.findOne({ cpf });
    if (cpfExists) {
      return res.status(409).json({ message: "CPF já cadastrado!" });
    }

    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(409).json({ message: "Telefone já cadastrado!" });
    }

    const user = new User({ name, email, phone, password, cpf });
    await user.save();

    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    const expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await Token.create({ user: user._id, token: refreshToken, expiresAt });

    res.cookie("refreshToken", refreshToken, cookieOptions(req));

    const userData = {
      id: user._id,
      name: user.name,
      fullName: user.fullName || user.name,
      email: user.email,
      cpf: user.cpf,
      phone: user.phone || "",
      avatar: user.avatar,
      institution: user.institution,
      coins: user.coins,
      balance: user.coins,
      level: user.level,
      xp: user.xp,
      maxXp: user.maxXp,
      score: user.score,
      totalDonated: user.totalDonated,
      totalReceived: user.totalReceived,
      totalDonations: user.totalDonations,
      stats: user.stats,
      preferences: user.preferences,
      settings: user.settings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profilePhotoUrl: user.profilePhotoUrl,
      profilePhoto: user.profilePhoto,
    };

    console.log("✅ Registro bem-sucedido:", {
      userId: user._id,
      email: user.email,
      cpf: user.cpf,
      hasPhoto: !!userData.profilePhotoUrl,
      photoUrl: userData.profilePhotoUrl,
    });

    res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso!",
      data: {
        user: userData,
        accessToken,
        hasPendingNotifications: false,
        pendingNotificationsCount: 0,
      },
    });
  } catch (err) {
    console.error("❌ Erro no registro:", err);
    if (err.code === 11000) {
      if (err.keyValue.email) {
        return res.status(409).json({ message: "Email já cadastrado" });
      }
      if (err.keyValue.cpf) {
        return res.status(409).json({ message: "CPF já cadastrado!" });
      }
      if (err.keyValue.phone) {
        return res.status(409).json({ message: "Telefone já cadastrado!" });
      }
    }

    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Erro de validação: " + err.message });
    }

    next(err);
  }
};

exports.login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res.status(401).json({ message: "Credenciais inválidas" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ message: "Credenciais inválidas" });

    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    const expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await Token.create({ user: user._id, token: refreshToken, expiresAt });

    res.cookie("refreshToken", refreshToken, cookieOptions(req));

    const pendingNotifications = await Notification.find({
      user: user._id,
      displayed: false,
      status: "unread",
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const hasPendingNotifications = pendingNotifications.length > 0;
    const unreadCount = await Notification.getUnreadCount(user._id);

    const userData = {
      id: user._id,
      name: user.name,
      fullName: user.fullName || user.name,
      email: user.email,
      cpf: user.cpf,
      phone: user.phone || "",
      avatar: user.avatar,
      institution: user.institution,
      coins: user.coins,
      balance: user.coins,
      level: user.level,
      xp: user.xp,
      maxXp: user.maxXp,
      score: user.score,
      totalDonated: user.totalDonated,
      totalReceived: user.totalReceived,
      totalDonations: user.totalDonations,
      stats: user.stats,
      preferences: user.preferences,
      settings: user.settings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profilePhotoUrl: user.profilePhotoUrl,
      profilePhoto: user.profilePhoto,
    };

    console.log("✅ Login bem-sucedido:", {
      userId: user._id,
      email: user.email,
      hasPhoto: !!userData.profilePhotoUrl,
      photoUrl: userData.profilePhotoUrl,
      photoStorage: user.profilePhoto?.storage,
      photoFilename: user.profilePhoto?.filename,
    });

    res.json({
      success: true,
      message: "Login realizado com sucesso!",
      data: {
        user: userData,
        accessToken,
        hasPendingNotifications,
        pendingNotificationsCount: pendingNotifications.length,
        unreadNotificationsCount: unreadCount,
        recentNotifications: pendingNotifications.slice(0, 5).map((n) => ({
          id: n._id,
          type: n.type,
          title: n.title,
          message: n.message,
          priority: n.priority,
          createdAt: n.createdAt,
          data: n.data,
        })),
      },
    });
  } catch (err) {
    console.error("❌ Erro no login:", err);
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: "Sem refresh token" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Refresh token inválido" });
    }

    const stored = await Token.findOne({ user: payload.id, token });
    if (!stored)
      return res.status(401).json({ message: "Refresh token não reconhecido" });

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    const accessToken = createAccessToken(payload.id);
    const newRefreshToken = createRefreshToken(payload.id);

    stored.token = newRefreshToken;
    stored.expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await stored.save();

    res.cookie("refreshToken", newRefreshToken, cookieOptions(req));

    const unreadCount = await Notification.getUnreadCount(payload.id);
    const hasPending = unreadCount > 0;

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      profilePhotoUrl: user.profilePhotoUrl,
      coins: user.coins,
      level: user.level,
    };

    console.log("🔄 Refresh token bem-sucedido:", {
      userId: user._id,
      hasPhoto: !!userData.profilePhotoUrl,
      photoUrl: userData.profilePhotoUrl,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        user: userData,
        hasPendingNotifications: hasPending,
        unreadNotificationsCount: unreadCount,
      },
    });
  } catch (err) {
    console.error("❌ Erro no refresh token:", err);
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      await Token.deleteOne({ token });
      console.log("🚪 Logout: Refresh token removido do banco");
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "strict",
      secure: cookieSecure(),
    });

    console.log("✅ Logout realizado com sucesso");

    res.json({ success: true, message: "Logout realizado com sucesso" });
  } catch (err) {
    console.error("❌ Erro no logout:", err);
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuário não encontrado" });
    }

    const unreadCount = await Notification.getUnreadCount(user._id);
    const pendingNotifications = await Notification.find({
      user: user._id,
      displayed: false,
      status: "unread",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const userData = {
      id: user._id,
      name: user.name,
      fullName: user.fullName || user.name,
      email: user.email,
      cpf: user.cpf,
      phone: user.phone || "",
      avatar: user.avatar,
      institution: user.institution,
      coins: user.coins,
      balance: user.coins,
      level: user.level,
      xp: user.xp,
      maxXp: user.maxXp,
      score: user.score,
      totalDonated: user.totalDonated,
      totalReceived: user.totalReceived,
      totalDonations: user.totalDonations,
      stats: user.stats,
      preferences: user.preferences,
      settings: user.settings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profilePhotoUrl: user.profilePhotoUrl,
      profilePhoto: user.profilePhoto,
    };

    console.log("👤 GET /me:", {
      userId: user._id,
      email: user.email,
      hasPhoto: !!userData.profilePhotoUrl,
      photoUrl: userData.profilePhotoUrl,
    });

    res.json({
      success: true,
      data: {
        user: userData,
        notifications: {
          unreadCount,
          hasPending: pendingNotifications.length > 0,
          pendingCount: pendingNotifications.length,
          recent: pendingNotifications.map((n) => ({
            id: n._id,
            type: n.type,
            title: n.title,
            message: n.message,
            priority: n.priority,
            createdAt: n.createdAt,
          })),
        },
      },
    });
  } catch (err) {
    console.error("❌ Erro no /me:", err);
    next(err);
  }
};

// ========== ALTERAÇÃO DE SENHA (AUTENTICADO) ==========

exports.changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      console.warn("⚠️ Tentativa de alteração de senha com senha incorreta:", {
        userId: user._id,
        email: user.email,
        ip: req.ip,
        timestamp: new Date(),
      });

      return res.status(400).json({
        success: false,
        message: "Senha atual incorreta",
      });
    }

    const samePassword = await user.comparePassword(newPassword);
    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "A nova senha deve ser diferente da atual",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "A senha deve ter pelo menos 8 caracteres",
      });
    }

    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[^a-zA-Z0-9]/.test(newPassword);

    const complexityScore = [
      hasUpperCase,
      hasLowerCase,
      hasNumber,
      hasSpecialChar,
    ].filter(Boolean).length;

    if (complexityScore < 3) {
      return res.status(400).json({
        success: false,
        message:
          "Senha muito fraca. Use combinação de maiúsculas, minúsculas, números e símbolos",
      });
    }

    user.password = newPassword;
    user.lastPasswordChange = new Date();

    const tokensDeleted = await Token.deleteMany({ user: user._id });

    await user.save();

    try {
      await AuditLog.create({
        userId: user._id,
        action: "PASSWORD_CHANGE",
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        metadata: {
          email: user.email,
          tokensInvalidated: tokensDeleted.deletedCount,
          timestamp: new Date(),
        },
      });
    } catch (auditError) {
      console.error("⚠️ Erro ao criar log de auditoria:", auditError);
    }

    console.log("✅ Senha alterada com sucesso:", {
      userId: user._id,
      email: user.email,
      timestamp: user.lastPasswordChange,
      tokensInvalidated: tokensDeleted.deletedCount,
    });

    return res.status(200).json({
      success: true,
      message:
        "Senha alterada com sucesso! Por segurança, faça login novamente.",
      timestamp: user.lastPasswordChange,
      requiresLogin: true,
    });
  } catch (error) {
    console.error("❌ Erro ao alterar senha:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno ao alterar senha",
    });
  }
};

// ========== RECUPERAÇÃO DE SENHA (SEM AUTENTICAÇÃO) ==========

exports.requestPasswordReset = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { email } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Por segurança, não revelar se o email existe
      return res.json({
        success: true,
        message: "Se o email existir, um código foi enviado",
      });
    }

    if (user.status !== "active" || !user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Conta inativa ou suspensa",
      });
    }

    const verificationCode = generateVerificationCode();

    const hashedCode = crypto
      .createHash("sha256")
      .update(verificationCode)
      .digest("hex");

    user.resetPasswordToken = hashedCode;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutos
    await user.save();

    // Enviar email usando o serviço
    try {
      await emailService.sendPasswordResetCode(user, verificationCode);

      console.log("✅ Código de recuperação enviado:", {
        email: user.email,
        userId: user._id,
        expiresAt: new Date(user.resetPasswordExpires),
      });

      res.json({
        success: true,
        message: "Código enviado para o email cadastrado",
        expiresIn: 900, // 15 minutos em segundos
      });
    } catch (emailError) {
      console.error("❌ Erro ao enviar email:", emailError);

      // Limpar campos de reset se o email falhar
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        message: "Erro ao enviar email. Tente novamente mais tarde.",
        error:
          process.env.NODE_ENV === "development"
            ? emailError.message
            : undefined,
      });
    }
  } catch (error) {
    console.error("❌ Erro ao solicitar recuperação:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao processar solicitação",
    });
  }
};

exports.verifyResetCode = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { email, code } = req.body;

  try {
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedCode,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Código inválido ou expirado",
      });
    }

    // Gerar token temporário válido por 10 minutos
    const resetToken = jwt.sign(
      { id: user._id, purpose: "password-reset" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    console.log("✅ Código verificado com sucesso:", {
      email: user.email,
      userId: user._id,
    });

    res.json({
      success: true,
      message: "Código verificado com sucesso",
      resetToken, // Frontend usa este token para resetar senha
    });
  } catch (error) {
    console.error("❌ Erro ao verificar código:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao verificar código",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { resetToken, newPassword } = req.body;

  try {
    // Verificar token temporário
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);

      if (decoded.purpose !== "password-reset") {
        throw new Error("Token inválido");
      }
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Token de reset inválido ou expirado",
      });
    }

    const user = await User.findById(decoded.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Verificar se não está reutilizando senha antiga
    const samePassword = await user.comparePassword(newPassword);
    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "A nova senha deve ser diferente da anterior",
      });
    }

    // Atualizar senha
    user.password = newPassword;
    user.lastPasswordChange = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    // Invalidar todos os refresh tokens
    await Token.deleteMany({ user: user._id });

    // Log de auditoria
    try {
      await AuditLog.create({
        userId: user._id,
        action: "PASSWORD_RESET",
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        metadata: {
          email: user.email,
          method: "email-verification",
          timestamp: new Date(),
        },
      });
    } catch (auditError) {
      console.error("⚠️ Erro ao criar log de auditoria:", auditError);
    }

    // Enviar email de confirmação
    try {
      await emailService.sendPasswordChangedConfirmation(user);
    } catch (emailError) {
      console.error("⚠️ Erro ao enviar email de confirmação:", emailError);
      // Não falhar a operação se o email de confirmação falhar
    }

    console.log("✅ Senha resetada com sucesso:", {
      userId: user._id,
      email: user.email,
      timestamp: user.lastPasswordChange,
    });

    res.json({
      success: true,
      message: "Senha alterada com sucesso! Faça login com sua nova senha.",
    });
  } catch (error) {
    console.error("❌ Erro ao resetar senha:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao resetar senha",
    });
  }
};
