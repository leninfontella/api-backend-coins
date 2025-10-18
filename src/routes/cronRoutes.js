// src/routes/cronRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Middleware de segurança para cron jobs
const validateCronSecret = (req, res, next) => {
  const cronSecret = req.headers["x-cron-secret"];

  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  next();
};

// Endpoint de reset mensal
router.post("/monthly-reset", validateCronSecret, async (req, res) => {
  try {
    console.log("🔄 Iniciando reset mensal de saldo...");

    const result = await User.updateMany(
      {
        status: "active",
        isActive: true,
      },
      {
        $set: { coins: 100 },
      }
    );

    // Opcional: Registrar histórico
    const resetLog = {
      date: new Date(),
      usersAffected: result.modifiedCount,
      success: true,
    };

    console.log(
      `✅ Reset mensal concluído: ${result.modifiedCount} usuários atualizados`
    );

    res.status(200).json({
      success: true,
      message: "Reset mensal executado com sucesso",
      usersAffected: result.modifiedCount,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Erro no reset mensal:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao executar reset mensal",
      error: error.message,
    });
  }
});

// Endpoint de teste (opcional)
router.get("/test", validateCronSecret, (req, res) => {
  res.json({
    success: true,
    message: "Cron endpoint está funcionando!",
    timestamp: new Date(),
  });
});

module.exports = router;
