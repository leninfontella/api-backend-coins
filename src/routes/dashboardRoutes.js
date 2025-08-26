const express = require("express");
const {
  getDashboardData,
  updateMonthlyGoal,
  getDetailedInteractions,
} = require("../controllers/dashboardController");
const { authenticateToken } = require("../middleware/authenticateToken");
const { dashboardRateLimit } = require("../middleware/rateLimiting");

const router = express.Router();

// Middleware de autenticação para todas as rotas
router.use(authenticateToken);

// Middleware de rate limiting específico para dashboard
router.use(dashboardRateLimit);

/**
 * @route   GET /api/dashboard
 * @desc    Obter todos os dados do dashboard do usuário
 * @access  Private
 * @returns {Object} Dados completos do dashboard incluindo:
 *   - Dados básicos do usuário
 *   - Estatísticas mensais (doações feitas/recebidas)
 *   - Última doação realizada
 *   - Usuário com maior interação
 *   - Progresso da meta mensal
 */
router.get("/", getDashboardData);

/**
 * @route   PUT /api/dashboard/goal
 * @desc    Atualizar meta mensal de doações
 * @access  Private
 * @body    { goalAmount: Number }
 * @returns {Object} Confirmação e nova meta
 */
router.put("/goal", updateMonthlyGoal);

/**
 * @route   GET /api/dashboard/interactions
 * @desc    Obter estatísticas detalhadas de interações
 * @access  Private
 * @query   {
 *   period: 'week' | 'month' | 'year' (default: 'month'),
 *   limit: Number (default: 5)
 * }
 * @returns {Array} Lista dos usuários com mais interações
 */
router.get("/interactions", getDetailedInteractions);

module.exports = router;
