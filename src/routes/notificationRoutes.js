const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");

router.use(authMiddleware);

// GET /api/notifications/pending - Buscar não exibidas
router.get("/pending", async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user.id,
      displayed: false,
      type: "donation_received",
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("Erro ao buscar notificações pendentes:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar notificações",
    });
  }
});

// PUT /api/notifications/:id/displayed - Marcar como exibida
router.put("/:id/displayed", async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { displayed: true, displayedAt: new Date() }
    );

    res.json({
      success: true,
      message: "Notificação marcada como exibida",
    });
  } catch (error) {
    console.error("Erro ao marcar notificação:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar notificação",
    });
  }
});

// PUT /api/notifications/:id/read - Marcar como lida
router.put("/:id/read", async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: "Notificação marcada como lida",
    });
  } catch (error) {
    console.error("Erro ao marcar como lida:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar notificação",
    });
  }
});

// GET /api/notifications/count - Contar não lidas
router.get("/count", async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.id,
      read: false,
    });

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("Erro ao contar notificações:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao contar notificações",
    });
  }
});

module.exports = router;
