const User = require("../models/User");
const Token = require("../models/Token");
const Notification = require("../models/Notification");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");

const bcrypt = require("bcryptjs");

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

exports.register = async (req, res, next) => {
  const errors = validationResult(req);

  //diagnóstico
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

    // Salvar refresh token no DB
    const expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await Token.create({ user: user._id, token: refreshToken, expiresAt });

    // Enviar cookie httpOnly com refresh token
    res.cookie("refreshToken", refreshToken, cookieOptions(req));

    // 🔧 CORREÇÃO: Preparar dados do usuário com foto SEMPRE (mesmo null para novos)
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
      // 🔧 CRÍTICO: Sempre incluir foto (null para novos usuários)
      profilePhotoUrl: user.profilePhotoUrl, // Virtual que retorna URL do GCS ou null
      profilePhoto: user.profilePhoto, // Objeto completo para debug
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
        // Novo usuário não tem notificações pendentes
        hasPendingNotifications: false,
        pendingNotificationsCount: 0,
      },
    });
  } catch (err) {
    console.error("❌ Erro no registro:", err);
    if (err.code === 11000) {
      // Verifica qual campo causou a violação de unicidade
      if (err.keyValue.email) {
        return res.status(409).json({ message: "Email já cadastrado" });
      }
      if (err.keyValue.cpf) {
        // ✅ TRATAMENTO CPF
        return res.status(409).json({ message: "CPF já cadastrado!" });
      }
      if (err.keyValue.phone) {
        // ✅ TRATAMENTO PHONE
        return res.status(409).json({ message: "Telefone já cadastrado!" });
      }
    }

    // Trata outros erros de validação do Mongoose (ex: required)
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

    // Salvar refresh token
    const expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await Token.create({ user: user._id, token: refreshToken, expiresAt });

    res.cookie("refreshToken", refreshToken, cookieOptions(req));

    // 🔔 BUSCAR NOTIFICAÇÕES PENDENTES (não exibidas)
    const pendingNotifications = await Notification.find({
      user: user._id,
      displayed: false,
      status: "unread",
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const hasPendingNotifications = pendingNotifications.length > 0;

    // Opcional: Obter contagem total de não lidas
    const unreadCount = await Notification.getUnreadCount(user._id);

    // 🔧 CRÍTICO: Preparar dados do usuário com foto SEMPRE
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
      balance: user.coins, // Alias
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
      // 🔧 CRÍTICO: Sempre incluir foto do banco
      profilePhotoUrl: user.profilePhotoUrl, // Virtual que retorna URL do GCS ou null
      profilePhoto: user.profilePhoto, // Objeto completo para debug
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
        // 📬 Informações de notificações pendentes
        hasPendingNotifications,
        pendingNotificationsCount: pendingNotifications.length,
        unreadNotificationsCount: unreadCount,
        // Opcionalmente, enviar as notificações mais recentes
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

    // Verificar token assinado
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Refresh token inválido" });
    }

    // Checar se token existe no DB
    const stored = await Token.findOne({ user: payload.id, token });
    if (!stored)
      return res.status(401).json({ message: "Refresh token não reconhecido" });

    // 🔧 NOVO: Buscar usuário para incluir foto na resposta
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    // Gerar novos tokens
    const accessToken = createAccessToken(payload.id);
    const newRefreshToken = createRefreshToken(payload.id);

    // Substituir token no DB (rotacionar)
    stored.token = newRefreshToken;
    stored.expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await stored.save();

    res.cookie("refreshToken", newRefreshToken, cookieOptions(req));

    // 🔔 Incluir informações de notificações no refresh
    const unreadCount = await Notification.getUnreadCount(payload.id);
    const hasPending = unreadCount > 0;

    // 🔧 NOVO: Incluir dados do usuário com foto
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      profilePhotoUrl: user.profilePhotoUrl, // 🔧 CRÍTICO: Incluir foto
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
        user: userData, // 🔧 NOVO: Incluir dados do usuário
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

    // 🔔 Incluir informações de notificações no endpoint /me
    const unreadCount = await Notification.getUnreadCount(user._id);
    const pendingNotifications = await Notification.find({
      user: user._id,
      displayed: false,
      status: "unread",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    // 🔧 CORREÇÃO: Preparar dados do usuário com foto SEMPRE
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
      // 🔧 CRÍTICO: Sempre incluir foto
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
        // 📬 Informações de notificações
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

exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Senha atual e nova senha são obrigatórias",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Verificar senha atual
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Senha atual incorreta",
      });
    }

    // Evitar reutilização da senha atual
    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "A nova senha deve ser diferente da atual",
      });
    }

    // Criptografar nova senha
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.lastPasswordChange = new Date();

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Senha alterada com sucesso!",
      timestamp: user.lastPasswordChange,
    });
  } catch (error) {
    console.error("❌ Erro ao alterar senha:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno ao alterar senha",
    });
  }
};

// --- Helpers ---

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
