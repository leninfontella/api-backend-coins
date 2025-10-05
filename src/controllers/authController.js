const User = require("../models/User");
const Token = require("../models/Token");
const Notification = require("../models/Notification");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");

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
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { name, email, phone, password } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email já cadastrado" });

    const user = new User({ name, email, phone, password });
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

    res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso!",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          coins: user.coins,
          level: user.level,
          totalDonated: user.totalDonated,
          totalReceived: user.totalReceived,
        },
        accessToken,
        // Novo usuário não tem notificações pendentes
        hasPendingNotifications: false,
        pendingNotificationsCount: 0,
      },
    });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: "Email já cadastrado" });
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

    res.json({
      success: true,
      message: "Login realizado com sucesso!",
      data: {
        user: user.toJSON(),
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

    res.json({
      success: true,
      data: {
        accessToken,
        hasPendingNotifications: hasPending,
        unreadNotificationsCount: unreadCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      await Token.deleteOne({ token });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "strict",
      secure: cookieSecure(),
    });
    res.json({ success: true, message: "Logout realizado com sucesso" });
  } catch (err) {
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

    res.json({
      success: true,
      data: {
        user: user.toJSON(),
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
    next(err);
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
