// src/models/AuditLog.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "PASSWORD_CHANGE",
        "PASSWORD_RESET",
        "LOGIN",
        "LOGOUT",
        "REGISTER",
        "PROFILE_UPDATE",
        "EMAIL_CHANGE",
        "ACCOUNT_DELETION",
        "ACCOUNT_CREATED",
        "DONATION_SENT",
        "DONATION_RECEIVED",
        "SUSPICIOUS_ACTIVITY",
      ],
      index: true,
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["success", "failure", "pending"],
      default: "success",
    },
  },
  {
    timestamps: true, // Usa createdAt e updatedAt automaticamente
  }
);

// Índices compostos para queries otimizadas
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// TTL index - remover logs após 90 dias
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Método estático para buscar logs de um usuário
auditLogSchema.statics.getUserLogs = function (userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-__v");
};

// Método estático para buscar logs por ação
auditLogSchema.statics.getActionLogs = function (action, limit = 100) {
  return this.find({ action })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("userId", "name email")
    .select("-__v");
};

// Método estático para detectar atividades suspeitas
auditLogSchema.statics.detectSuspiciousActivity = async function (
  userId,
  timeWindowMinutes = 10
) {
  const timeThreshold = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
  const recentAttempts = await this.countDocuments({
    userId,
    action: { $in: ["PASSWORD_CHANGE", "PASSWORD_RESET"] },
    createdAt: { $gte: timeThreshold },
  });
  return recentAttempts > 5; // Mais de 5 tentativas em 10 minutos
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
