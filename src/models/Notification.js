// src/models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: [
        "donation_received",
        "donation_sent",
        "level_up",
        "achievement",
        "system",
        "warning",
        "info",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["unread", "read", "archived"],
      default: "unread",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    // Dados extras específicos do tipo de notificação
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Metadados
    metadata: {
      channel: {
        type: String,
        enum: ["web", "mobile", "email", "push"],
        default: "web",
      },
      source: String,
      category: String,
    },
    readAt: Date,
    archivedAt: Date,
    expiresAt: Date, // Para notificações temporárias
  },
  {
    timestamps: true,
  }
);

// Índices
notificationSchema.index({ user: 1, status: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Middleware para limpar notificações antigas
notificationSchema.pre("save", function (next) {
  // Se não tem expiresAt definido, define para 30 dias
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
  }
  next();
});

// Métodos de instância
notificationSchema.methods.markAsRead = function () {
  this.status = "read";
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.archive = function () {
  this.status = "archived";
  this.archivedAt = new Date();
  return this.save();
};

// Métodos estáticos
notificationSchema.statics.getUserNotifications = function (
  userId,
  options = {}
) {
  const {
    status = "unread",
    type,
    limit = 20,
    skip = 0,
    includeRead = false,
  } = options;

  let query = { user: userId };

  if (!includeRead && status) {
    query.status = status;
  }

  if (type) {
    query.type = type;
  }

  return this.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);
};

notificationSchema.statics.getUnreadCount = function (userId) {
  return this.countDocuments({
    user: userId,
    status: "unread",
  });
};

notificationSchema.statics.markAllAsRead = function (userId, types = null) {
  let query = {
    user: userId,
    status: "unread",
  };

  if (types && types.length > 0) {
    query.type = { $in: types };
  }

  return this.updateMany(query, {
    $set: {
      status: "read",
      readAt: new Date(),
    },
  });
};

notificationSchema.statics.createNotification = async function (
  notificationData
) {
  try {
    // Verificar se o usuário existe e aceita notificações
    const User = mongoose.model("User");
    const user = await User.findById(notificationData.user);

    if (!user || !user.settings.pushNotifications) {
      return null;
    }

    const notification = new this(notificationData);
    await notification.save();

    return notification;
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    throw error;
  }
};

notificationSchema.statics.createBulkNotifications = async function (
  notifications
) {
  try {
    return await this.insertMany(notifications, { ordered: false });
  } catch (error) {
    console.error("Erro ao criar notificações em lote:", error);
    throw error;
  }
};

// Helper para criar notificação de level up
notificationSchema.statics.createLevelUpNotification = function (
  userId,
  newLevel,
  oldLevel
) {
  return this.createNotification({
    user: userId,
    title: "🎉 Level Up!",
    message: `Parabéns! Você subiu de ${oldLevel} para ${newLevel}!`,
    type: "level_up",
    priority: "high",
    data: {
      newLevel,
      oldLevel,
      timestamp: new Date(),
    },
  });
};

// Helper para criar notificação de conquista
notificationSchema.statics.createAchievementNotification = function (
  userId,
  achievement
) {
  return this.createNotification({
    user: userId,
    title: "🏆 Nova Conquista!",
    message: `Você desbloqueou: ${achievement.name}`,
    type: "achievement",
    priority: "high",
    data: {
      achievement,
      timestamp: new Date(),
    },
  });
};

module.exports = mongoose.model("Notification", notificationSchema);
