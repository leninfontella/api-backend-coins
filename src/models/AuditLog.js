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
        "LOGIN",
        "LOGOUT",
        "PROFILE_UPDATE",
        "DONATION_SENT",
        "DONATION_RECEIVED",
        "ACCOUNT_CREATED",
        "ACCOUNT_DELETED",
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
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // Usar apenas timestamp manual
  }
);

// Índice composto para queries eficientes
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

// Auto-deletar logs antigos (opcional - após 90 dias)
auditLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
