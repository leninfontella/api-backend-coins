const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const authController = require("../controllers/authController");
const protect = require("../middleware/authMiddleware");
const multer = require("multer");
const upload = multer();

router.post(
  "/register",
  upload.none(),
  [
    check("name", "Nome é obrigatório").trim().notEmpty(),
    check("email", "Email inválido").isEmail().normalizeEmail(),
    check("cpf", "CPF inválido ou não fornecido")
      .trim()
      .notEmpty()
      .isLength({ min: 11, max: 14 }) // Ajuste min/max conforme sua regra de negócio (com ou sem máscara)
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
  [
    check("email", "Email inválido").isEmail().normalizeEmail(),
    check("password", "Senha é obrigatória").notEmpty(),
  ],
  authController.login
);

// Adicionado: Rota para verificar o status de autenticação
router.get("/check", protect, (req, res) => {
  // Se o middleware `protect` passar, o token é válido
  res.status(200).json({ success: true, message: "Usuário autenticado" });
});

router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);

module.exports = router;
