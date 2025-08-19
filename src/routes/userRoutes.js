const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const donationController = require("../controllers/donationController");
const authMiddleware = require("../middleware/authMiddleware");
const { query, param, validationResult } = require("express-validator");

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

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

// // ========== ROTA DE DIAGNÓSTICO (TEMPORÁRIA) ==========

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

// GET /api/users/balance - Obter apenas o saldo
router.get("/balance", userController.getBalance);

// PUT /api/users/balance - Atualizar saldo (corrigido de POST para PUT)
router.put("/balance", userController.updateBalance);

// GET /api/users/stats - Obter estatísticas do usuário
router.get("/stats", userController.getStats);

// GET /api/users/search - Busca principal de usuários (userController)
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
  ],
  validateRequest,
  userController.searchUsers
);

// ========== ROTAS DE DOAÇÃO ==========

// POST /api/users/donate - Processar doação entre usuários
router.post("/donate", userController.donateCoins);

// GET /api/users/donations/search - Buscar usuários especificamente para doação
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
  ],
  validateRequest,
  donationController.searchUsersForDonation
);

// POST /api/users/donations - Criar nova doação
router.post("/donations", donationController.createDonation);

// GET /api/users/donations - Obter histórico de doações do usuário
router.get("/donations", donationController.getUserDonations);

// GET /api/users/donations/stats - Obter estatísticas de doações
router.get("/donations/stats", donationController.getUserStats);

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

module.exports = router;
