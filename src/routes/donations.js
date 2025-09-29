// src/routes/donations.js
const express = require("express");
const router = express.Router();
const donationController = require("../controllers/donationController");
const authMiddleware = require("../middleware/authMiddleware");
const { body, param, query } = require("express-validator");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const { notifyDonationReceived } = require("../utils/socketNotifications");

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

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// POST /donations - Criar nova doação (versão simplificada com notificações)
router.post(
  "/",
  [
    body("recipientId")
      .notEmpty()
      .withMessage("ID do destinatário é obrigatório")
      .isMongoId()
      .withMessage("ID do destinatário inválido"),
    body("amount")
      .isInt({ min: 1, max: 100000 })
      .withMessage("Valor deve ser entre 1 e 100.000"),
    body("message")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Mensagem não pode exceder 500 caracteres"),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { recipientId, amount, message } = req.body;
      const donorId = req.user.id;

      if (donorId === recipientId) {
        return res.status(400).json({
          success: false,
          message: "Você não pode doar para si mesmo",
        });
      }

      const donor = await User.findById(donorId);
      const recipient = await User.findById(recipientId);

      if (!donor || !recipient) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

      if (donor.coins < amount) {
        return res.status(400).json({
          success: false,
          message: "Saldo insuficiente",
        });
      }

      donor.coins -= amount;
      donor.totalDonated = (donor.totalDonated || 0) + amount;
      recipient.coins += amount;
      recipient.totalReceived = (recipient.totalReceived || 0) + amount;

      await donor.save();
      await recipient.save();

      const io = req.app.get("io");
      const userSockets = req.app.get("userSockets");
      if (io && userSockets) {
        notifyDonationReceived(io, userSockets, recipientId, {
          donorName: donor.name,
          amount: amount,
          message: message || "",
        });
      }

      console.log(
        `✅ Doação processada: ${donor.name} -> ${recipient.name} (${amount} moedas)`
      );

      res.json({
        success: true,
        message: "Doação realizada com sucesso",
        data: {
          donorBalance: donor.coins,
          recipientBalance: recipient.coins,
          amount: amount,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Erro ao processar doação:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao processar doação",
        error: error.message,
      });
    }
  }
);

// GET /donations - Histórico de doações do usuário
router.get(
  "/",
  [
    query("type")
      .optional()
      .isIn(["all", "sent", "received"])
      .withMessage("Tipo deve ser: all, sent ou received"),
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
  donationController.getUserDonations
);

// ✅ NOVA ROTA: /donations/received
// GET /donations/received - Listar doações recebidas pelo usuário logado

// GET /donations/received - Doações recebidas desde um timestamp
router.get(
  "/received",
  [
    query("since")
      .optional()
      .trim()
      .isNumeric()
      .withMessage("O timestamp deve ser um número válido"),
  ],

  validateRequest,
  donationController.getReceivedDonations
);

// GET /donations/:donationId - Obter doação específica
router.get(
  "/:donationId",
  [param("donationId").isMongoId().withMessage("ID de doação inválido")],
  validateRequest,
  donationController.getDonation
);

// PUT /donations/:donationId/cancel - Cancelar doação
router.put(
  "/:donationId/cancel",
  [param("donationId").isMongoId().withMessage("ID de doação inválido")],
  validateRequest,
  donationController.cancelDonation
);

// GET /donations/stats/user/:userId? - Estatísticas do usuário
router.get(
  "/stats/user/:userId?",
  [
    param("userId")
      .optional()
      .isMongoId()
      .withMessage("ID de usuário inválido"),
  ],
  validateRequest,
  donationController.getUserStats
);

// GET /donations/stats/global - Estatísticas globais
router.get("/stats/global", donationController.getGlobalStats);

// GET /donations/ranking/users - Ranking de usuários
router.get(
  "/ranking/users",
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
  donationController.getRanking
);

// GET /donations/ranking/donors - Top doadores
router.get(
  "/ranking/donors",
  [
    query("period")
      .optional()
      .isIn(["day", "week", "month", "year"])
      .withMessage("Período deve ser: day, week, month ou year"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limite deve ser entre 1 e 50"),
  ],
  validateRequest,
  donationController.getTopDonors
);

// GET /donations/ranking/recipients - Top receptores
router.get(
  "/ranking/recipients",
  [
    query("period")
      .optional()
      .isIn(["day", "week", "month", "year"])
      .withMessage("Período deve ser: day, week, month ou year"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limite deve ser entre 1 e 50"),
  ],
  validateRequest,
  donationController.getTopRecipients
);

// GET /donations/feed/recent - Feed de doações recentes (público)
router.get(
  "/feed/recent",
  [
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
  donationController.getRecentDonations
);

module.exports = router;
