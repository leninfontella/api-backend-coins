const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const authController = require("../controllers/authController");
const protect = require("../middleware/authMiddleware");
const multer = require("multer");
const upload = multer();
const {
  authRateLimit,
  changePasswordRateLimit,
} = require("../middleware/rateLimiting");

// ========== ROTAS DE REGISTRO E LOGIN ==========
router.post(
  "/register",
  upload.none(),
  authRateLimit,
  [
    check("name", "Nome é obrigatório").trim().notEmpty(),
    check("email", "Email inválido").isEmail().normalizeEmail(),
    check("cpf", "CPF inválido ou não fornecido")
      .trim()
      .notEmpty()
      .isLength({ min: 11, max: 14 })
      .withMessage("CPF deve ter entre 11 e 14 caracteres"),
    check("phone")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 10, max: 20 })
      .withMessage("Telefone deve ter entre 10 e 20 caracteres"),
    check("password", "Senha com mínimo de 8 caracteres").isLength({ min: 8 }),
    check("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.password)
        throw new Error("As senhas não conferem");
      return true;
    }),
  ],
  authController.register
);

router.post(
  "/login",
  authRateLimit,
  [
    check("email", "Email inválido").isEmail().normalizeEmail(),
    check("password", "Senha é obrigatória").notEmpty(),
  ],
  authController.login
);

// ========== ROTAS DE AUTENTICAÇÃO ==========
router.get("/check", protect, (req, res) => {
  res.status(200).json({ success: true, message: "Usuário autenticado" });
});

router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);

// ========== ROTAS DE ALTERAÇÃO DE SENHA (AUTENTICADO) ==========
router.post(
  "/change-password",
  protect,
  changePasswordRateLimit,
  [
    check("currentPassword", "Senha atual é obrigatória").notEmpty(),
    check("newPassword", "Nova senha deve ter no mínimo 8 caracteres")
      .isLength({ min: 8 })
      .withMessage("Senha deve ter pelo menos 8 caracteres"),
    check("newPassword")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("Senha deve conter letras maiúsculas, minúsculas e números"),
  ],
  authController.changePassword
);

// ========== ROTAS DE RECUPERAÇÃO DE SENHA ==========
// Solicitar código de recuperação
router.post(
  "/request-password-reset",
  authRateLimit,
  [check("email", "Email inválido").isEmail().normalizeEmail()],
  authController.requestPasswordReset
);

// Verificar código de recuperação
router.post(
  "/verify-reset-code",
  authRateLimit,
  [
    check("email", "Email inválido").isEmail().normalizeEmail(),
    check("code", "Código deve ter 6 dígitos")
      .isLength({ min: 6, max: 6 })
      .isNumeric(),
  ],
  authController.verifyResetCode
);

// Resetar senha com token temporário
router.post(
  "/reset-password",
  authRateLimit,
  [
    check("resetToken", "Token de reset é obrigatório").notEmpty(),
    check("newPassword", "Nova senha deve ter no mínimo 8 caracteres")
      .isLength({ min: 8 })
      .withMessage("Senha deve ter pelo menos 8 caracteres"),
    check("newPassword")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("Senha deve conter letras maiúsculas, minúsculas e números"),
  ],
  authController.resetPassword
);

module.exports = router;
