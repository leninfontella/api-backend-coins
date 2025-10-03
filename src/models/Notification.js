// src/models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
      // Estrutura para donation_received/donation_sent
      donationId: mongoose.Schema.Types.ObjectId,
      amount: Number,
      donor: {
        id: mongoose.Schema.Types.ObjectId,
        name: String,
        username: String,
        avatar: String,
      },
      newBalance: Number,
      timestamp: Date,
      // Estrutura para level_up
      newLevel: Number,
      oldLevel: Number,
      // Estrutura para achievement
      achievement: mongoose.Schema.Types.Mixed,
    },
    // Campos de leitura e exibição (compatibilidade com sistema antigo)
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    displayed: {
      type: Boolean,
      default: false,
      index: true,
    },
    displayedAt: Date,
    readAt: Date,
    archivedAt: Date,
    expiresAt: Date, // Para notificações temporárias
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
  },
  {
    timestamps: true,
  }
);

// Índices otimizados (combinação de ambos os sistemas)
notificationSchema.index({ user: 1, status: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1 });
notificationSchema.index({ user: 1, displayed: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Middleware para sincronizar campos read/status e limpar notificações antigas
notificationSchema.pre("save", function (next) {
  // Sincronizar read com status
  if (this.isModified("status")) {
    this.read = this.status === "read" || this.status === "archived";
  }
  if (this.isModified("read") && !this.isModified("status")) {
    this.status = this.read ? "read" : "unread";
  }

  // Se não tem expiresAt definido, define para 30 dias
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
  }

  next();
});

// Métodos de instância
notificationSchema.methods.markAsRead = function () {
  this.status = "read";
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.archive = function () {
  this.status = "archived";
  this.read = true;
  this.archivedAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDisplayed = function () {
  this.displayed = true;
  this.displayedAt = new Date();
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

notificationSchema.statics.getUndisplayedNotifications = function (userId) {
  return this.find({
    user: userId,
    displayed: false,
  }).sort({ createdAt: -1 });
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
      read: true,
      readAt: new Date(),
    },
  });
};

notificationSchema.statics.markAllAsDisplayed = function (userId) {
  return this.updateMany(
    {
      user: userId,
      displayed: false,
    },
    {
      $set: {
        displayed: true,
        displayedAt: new Date(),
      },
    }
  );
};

notificationSchema.statics.createNotification = async function (
  notificationData
) {
  try {
    // Verificar se o usuário existe e aceita notificações
    const User = mongoose.model("User");
    const user = await User.findById(notificationData.user);

    if (!user || !user.settings?.pushNotifications) {
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

// Helper para criar notificação de doação recebida
notificationSchema.statics.createDonationReceivedNotification = function (
  userId,
  donationData
) {
  return this.createNotification({
    user: userId,
    title: "💰 Doação Recebida!",
    message: `Você recebeu R$ ${donationData.amount.toFixed(2)} de ${
      donationData.donor.name
    }`,
    type: "donation_received",
    priority: "high",
    data: {
      donationId: donationData.donationId,
      amount: donationData.amount,
      message: donationData.message,
      donor: donationData.donor,
      newBalance: donationData.newBalance,
      timestamp: new Date(),
    },
  });
};

// Helper para criar notificação de doação enviada
notificationSchema.statics.createDonationSentNotification = function (
  userId,
  donationData
) {
  return this.createNotification({
    user: userId,
    title: "✨ Doação Enviada!",
    message: `Você doou R$ ${donationData.amount.toFixed(2)}`,
    type: "donation_sent",
    priority: "normal",
    data: {
      donationId: donationData.donationId,
      amount: donationData.amount,
      message: donationData.message,
      newBalance: donationData.newBalance,
      timestamp: new Date(),
    },
  });
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
    message: `Parabéns! Você subiu do nível ${oldLevel} para ${newLevel}!`,
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

// Virtual para compatibilidade com código legado
notificationSchema.virtual("isRead").get(function () {
  return this.read || this.status === "read";
});

notificationSchema.virtual("isDisplayed").get(function () {
  return this.displayed;
});

// Configurar virtuals no JSON
notificationSchema.set("toJSON", { virtuals: true });
notificationSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Notification", notificationSchema);
