const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const authController = require("../controllers/authController");
const protect = require("../middleware/authMiddleware");

router.post(
  "/register",
  [
    check("name", "Nome é obrigatório").trim().notEmpty(),
    check("email", "Email inválido").isEmail().normalizeEmail(),
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

router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);

module.exports = router;
