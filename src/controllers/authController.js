const User = require("../models/User");
const Token = require("../models/Token");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");

const createAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });
};

const createRefreshToken = (userId) => {
  // refresh token também assinado, mas guardado no DB
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  });
};

exports.register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { name, email, password } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email já cadastrado" });

    const user = new User({ name, email, password });
    // coins: 100 é automático pelo default no schema
    await user.save();

    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    // salvar refresh token no DB
    const expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await Token.create({ user: user._id, token: refreshToken, expiresAt });

    // enviar cookie httpOnly com refresh token
    res.cookie("refreshToken", refreshToken, cookieOptions(req));

    // ========== MODIFICADO: Incluir dados de moedas na resposta ==========
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

    // salvar refresh token
    const expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await Token.create({ user: user._id, token: refreshToken, expiresAt });

    res.cookie("refreshToken", refreshToken, cookieOptions(req));

    // ✅ Usar toJSON para incluir virtuals (como profilePhotoUrl)
    res.json({
      success: true,
      message: "Login realizado com sucesso!",
      data: {
        user: user.toJSON(), // <-- inclui profilePhotoUrl automaticamente
        accessToken,
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

    // verificar token assinado
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Refresh token inválido" });
    }

    // checar se token existe no DB
    const stored = await Token.findOne({ user: payload.id, token });
    if (!stored)
      return res.status(401).json({ message: "Refresh token não reconhecido" });

    // gerar novos tokens
    const accessToken = createAccessToken(payload.id);
    const newRefreshToken = createRefreshToken(payload.id);

    // substituir token no DB (rotacionar)
    stored.token = newRefreshToken;
    stored.expiresAt = new Date(
      Date.now() + msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    );
    await stored.save();

    res.cookie("refreshToken", newRefreshToken, cookieOptions(req));

    res.json({ success: true, data: { accessToken } });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      // deletar do DB
      await Token.deleteOne({ token });
    }

    // limpar cookie do cliente
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

// ========== MODIFICADO: Incluir dados de moedas na resposta do me ==========
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuário não encontrado" });
    }

    res.json({
      success: true,
      data: {
        user: user.toJSON(), // ✅ inclui virtuals como profilePhotoUrl
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
    // em dev, definir maxAge baseado na variável (em ms)
    maxAge: msToMillis(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"),
  };
}

function cookieSecure() {
  // permitir override em .env (COOKIE_SECURE=true) para produção
  return (
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production"
  );
}

function msToMillis(str) {
  // converte '7d' | '15m' | '1h' para milissegundos simples
  // suporte básico: d = dias, h = horas, m = minutos
  try {
    const num = parseInt(str.slice(0, -1), 10);
    const unit = str.slice(-1);
    if (unit === "d") return num * 24 * 60 * 60 * 1000;
    if (unit === "h") return num * 60 * 60 * 1000;
    if (unit === "m") return num * 60 * 1000;
    // default: treat as ms
    return parseInt(str, 10);
  } catch (e) {
    // fallback 7 dias
    return 7 * 24 * 60 * 60 * 1000;
  }
}
