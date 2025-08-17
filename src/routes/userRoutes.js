const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/auth"); // Seu middleware existente

// ========== ROTAS PROTEGIDAS (precisam de token) ==========
// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// GET /api/user/profile - Obter dados completos do usuário
router.get("/profile", userController.getProfile);

// GET /api/user/balance - Obter apenas o saldo
router.get("/balance", userController.getBalance);

// POST /api/user/update-balance - Atualizar saldo
router.post("/update-balance", userController.updateBalance);

// GET /api/user/stats - Obter estatísticas do usuário
router.get("/stats", userController.getStats);

// NOVAS ROTAS PARA SISTEMA DE DOAÇÃO

// GET /api/user/search - Buscar usuários para doação
router.get("/search", userController.searchUsers);

// POST /api/user/donate - Processar doação entre usuários
router.post("/donate", userController.donateCoins);

module.exports = router;
