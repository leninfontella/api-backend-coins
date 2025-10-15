const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const donationController = require("../controllers/donationController");
const authMiddleware = require("../middleware/authMiddleware");
const { query, param, body, validationResult } = require("express-validator");

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Importar User model para rotas que precisam implementar inline
const User = require("../models/User");

// Middleware para validar resultados
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: errors.array(),
    });
  }
  next();
};

// ========== ROTA DE DIAGNÓSTICO (TEMPORÁRIA) ==========

// GET /api/users/debug/auth - Testar autenticação
router.get("/debug/auth", (req, res) => {
  res.json({
    success: true,
    message: "Autenticação funcionando!",
    user: req.user,
    headers: {
      authorization: req.headers.authorization,
      userAgent: req.headers["user-agent"],
    },
    timestamp: new Date().toISOString(),
  });
});

// ========== ROTAS DE USUÁRIO ==========

// GET /api/users/profile - Obter dados completos do usuário
router.get("/profile", userController.getProfile);

// PUT /api/users/profile - Atualizar dados do perfil
router.put(
  "/profile",
  [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Nome deve ter entre 2 e 100 caracteres"),
    body("fullName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 150 })
      .withMessage("Nome completo deve ter entre 2 e 150 caracteres"),
    body("username")
      .optional()
      .trim()
      .toLowerCase()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage(
        "Username deve ter 3-30 caracteres e conter apenas letras, números e underscore"
      ),
    body("institution")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Instituição deve ter no máximo 200 caracteres"),
    body("avatar")
      .optional()
      .isURL()
      .withMessage("Avatar deve ser uma URL válida"),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { name, fullName, username, institution, avatar, settings } =
        req.body;

      const User = require("../models/User");
      const updateData = {};

      if (name) updateData.name = name.trim();
      if (fullName) updateData.fullName = fullName.trim();
      if (username) updateData.username = username.trim().toLowerCase();
      if (institution) updateData.institution = institution.trim();
      if (avatar) updateData.avatar = avatar;
      if (settings) updateData.settings = { ...req.user.settings, ...settings };

      // Verificar se username já existe (se fornecido)
      if (username) {
        const existingUser = await User.findOne({
          username: username.trim().toLowerCase(),
          _id: { $ne: req.user._id },
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "Username já está em uso",
          });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        updateData,
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        data: updatedUser,
        message: "Perfil atualizado com sucesso",
      });
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Username já está em uso",
        });
      }

      res.status(500).json({
        success: false,
        message: "Erro ao atualizar perfil",
      });
    }
  }
);

// GET /api/users/balance - Obter apenas o saldo
router.get("/balance", userController.getBalance);

// PUT /api/users/balance - Atualizar saldo
router.put(
  "/balance",
  [
    body("amount")
      .notEmpty()
      .isNumeric()
      .withMessage("Quantidade deve ser um número válido"),
    body("operation")
      .optional()
      .isIn(["admin", "bonus", "correction", "refund", "add", "subtract"])
      .withMessage(
        "Operação deve ser: admin, bonus, correction, refund, add ou subtract"
      ),
    body("type")
      .optional()
      .isIn(["admin", "bonus", "correction", "refund", "add", "subtract"])
      .withMessage(
        "Tipo deve ser: admin, bonus, correction, refund, add ou subtract"
      ),
  ],
  validateRequest,
  userController.updateBalance
);

// GET /api/users/stats - Obter estatísticas do usuário
router.get("/stats", userController.getStats);

// GET /api/users/search - Busca principal de usuários
router.get(
  "/search",
  [
    query("q")
      .notEmpty()
      .withMessage("Query de busca é obrigatória")
      .isLength({ min: 2, max: 100 })
      .withMessage("Query deve ter entre 2 e 100 caracteres"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limite deve ser entre 1 e 50"),
    query("type")
      .optional()
      .isIn(["all", "active", "donors", "receivers"])
      .withMessage("Tipo deve ser: all, active, donors ou receivers"),
  ],
  validateRequest,
  userController.searchUsers
);

// ========== ROTAS DE DOAÇÃO ==========

// POST /api/users/donate - Processar doação entre usuários (compatibilidade)
router.post(
  "/donate",
  [
    body("recipientId")
      .notEmpty()
      .isMongoId()
      .withMessage("ID do destinatário inválido"),
    body("amount")
      .notEmpty()
      .isInt({ min: 1 })
      .withMessage("Quantidade deve ser um número inteiro positivo"),
    body("message")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Mensagem deve ter no máximo 500 caracteres"),
  ],
  validateRequest,
  userController.donateCoins
);

// GET /api/users/donations/search - Buscar usuários para doação
router.get(
  "/donations/search",
  [
    query("q")
      .notEmpty()
      .withMessage("Query de busca é obrigatória")
      .isLength({ min: 2, max: 100 })
      .withMessage("Query deve ter entre 2 e 100 caracteres"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limite deve ser entre 1 e 50"),
    query("excludeSelf")
      .optional()
      .isBoolean()
      .withMessage("excludeSelf deve ser um boolean"),
  ],
  validateRequest,
  // Usar userController.searchUsers como fallback se donationController não tiver o método
  async (req, res, next) => {
    try {
      if (typeof donationController.searchUsersForDonation === "function") {
        return donationController.searchUsersForDonation(req, res, next);
      } else {
        // Fallback para userController
        return userController.searchUsers(req, res, next);
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/users/donations - Criar nova doação
router.post(
  "/donations",
  [
    body("recipientId")
      .notEmpty()
      .isMongoId()
      .withMessage("ID do destinatário inválido"),
    body("amount")
      .notEmpty()
      .isInt({ min: 1 })
      .withMessage("Quantidade deve ser um número inteiro positivo"),
    body("message")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Mensagem deve ter no máximo 500 caracteres"),
    body("isAnonymous")
      .optional()
      .isBoolean()
      .withMessage("isAnonymous deve ser um boolean"),
  ],
  validateRequest,
  donationController.createDonation
);

// GET /api/users/donations - Obter histórico de doações do usuário
router.get(
  "/donations",
  [
    query("type")
      .optional()
      .isIn(["sent", "received", "all"])
      .withMessage("Tipo deve ser: sent, received ou all"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limite deve ser entre 1 e 100"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Data inicial deve estar em formato ISO8601"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Data final deve estar em formato ISO8601"),
  ],
  validateRequest,
  donationController.getUserDonations
);

// GET /api/users/donations/stats - Obter estatísticas de doações
router.get("/donations/stats", donationController.getUserStats);

// ========== NOVAS ROTAS PARA TIMELINE ==========

// GET /api/users/donations/all - Obter todas as doações (botão "all")
router.get(
  "/donations/all",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limite deve ser entre 1 e 100"),
  ],
  validateRequest,
  userController.getAllDonations
);

// GET /api/users/donations/sent - Obter doações enviadas pelo usuário
router.get(
  "/donations/sent",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limite deve ser entre 1 e 100"),
  ],
  validateRequest,
  userController.getSentDonations
);

// GET /api/users/donations/received - Obter doações recebidas pelo usuário
router.get(
  "/donations/received",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Página deve ser um número maior que 0"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limite deve ser entre 1 e 100"),
  ],
  validateRequest,
  userController.getReceivedDonations
);

// DELETE /api/users/account - Excluir conta permanentemente
router.delete(
  "/account",
  [
    body("password").notEmpty().withMessage("Senha é obrigatória"),
    body("confirmation")
      .notEmpty()
      .equals("EXCLUIR MINHA CONTA")
      .withMessage("Confirmação incorreta"),
  ],
  validateRequest,
  userController.deleteAccount
);

// ========== ROTAS ESPECÍFICAS POR ID (devem vir por último) ==========

// GET /api/users/:userId - Obter detalhes de um usuário específico
router.get(
  "/:userId",
  [param("userId").isMongoId().withMessage("ID de usuário inválido")],
  validateRequest,
  userController.getUserById
);

// GET /api/users/:userId/can-donate - Verificar se pode doar para um usuário específico
router.get(
  "/:userId/can-donate",
  [param("userId").isMongoId().withMessage("ID de usuário inválido")],
  validateRequest,
  donationController.canDonate
);

// GET /api/users/:userId/donations - Obter doações públicas de um usuário específico
router.get(
  "/:userId/donations",
  [
    param("userId").isMongoId().withMessage("ID de usuário inválido"),
    query("type")
      .optional()
      .isIn(["sent", "received"])
      .withMessage("Tipo deve ser: sent ou received"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limite deve ser entre 1 e 50"),
  ],
  validateRequest,
  // Implementação inline caso o método não exista no controller
  async (req, res) => {
    try {
      // Verificar se o método existe no donationController
      if (donationController.getUserPublicDonations) {
        return donationController.getUserPublicDonations(req, res);
      }

      // Implementação alternativa
      res.json({
        success: true,
        data: {
          donations: [],
          message: "Funcionalidade em desenvolvimento",
        },
      });
    } catch (error) {
      console.error("Erro ao buscar doações públicas:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  }
);

module.exports = router;
