// src/models/Donation.js
const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Usuário doador é obrigatório"],
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Usuário receptor é obrigatório"],
    },
    amount: {
      type: Number,
      required: [true, "Valor da doação é obrigatório"],
      min: [1, "Valor mínimo é 1 moeda"],
      max: [100000, "Valor máximo é 100.000 moedas"],
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, "Mensagem não pode exceder 500 caracteres"],
      default: "",
    },
    category: {
      type: String,
      enum: ["support", "appreciation", "help", "gift", "other"],
      default: "support",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    donorInfo: {
      name: String,
      username: String,
      avatar: String,
    },
    recipientInfo: {
      name: String,
      username: String,
      avatar: String,
    },
    metadata: {
      userAgent: String,
      ipAddress: String,
      processingTime: Number,
      failureReason: String,
      platform: {
        type: String,
        default: "web",
      },
    },
    transactionId: {
      type: String,
      unique: true,
      default: function () {
        return (
          "DON-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9)
        );
      },
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para melhor performance
donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ recipient: 1, createdAt: -1 });
donationSchema.index({ status: 1 });
donationSchema.index({ createdAt: -1 });
donationSchema.index({ donor: 1, status: 1, createdAt: -1 });
donationSchema.index({ transactionId: 1 });
donationSchema.index({ donor: 1, recipient: 1 });

// Virtual para calcular tempo desde a criação
donationSchema.virtual("timeAgo").get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? "agora mesmo" : `há ${minutes} minutos`;
    }
    return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
  } else if (days === 1) {
    return "ontem";
  } else {
    return `há ${days} dias`;
  }
});

// Garantir que virtuals sejam incluídos no JSON
donationSchema.set("toJSON", { virtuals: true });
donationSchema.set("toObject", { virtuals: true });

// Middleware de validação pré-save
donationSchema.pre("save", async function (next) {
  // Não permitir doação para si mesmo
  if (this.donor.toString() === this.recipient.toString()) {
    const error = new Error("Não é possível fazer doação para si mesmo");
    return next(error);
  }

  // Verificar se o usuário tem moedas suficientes (apenas para novas doações)
  if (this.isNew) {
    const User = mongoose.model("User");
    const donorUser = await User.findById(this.donor);

    if (!donorUser) {
      const error = new Error("Usuário doador não encontrado");
      return next(error);
    }

    if (donorUser.coins < this.amount) {
      const error = new Error("Saldo insuficiente para realizar a doação");
      return next(error);
    }
  }

  // Popular informações dos usuários
  if (this.isNew || this.isModified("donor") || this.isModified("recipient")) {
    try {
      const User = mongoose.model("User");

      const [donor, recipient] = await Promise.all([
        User.findById(this.donor).select("name username avatar"),
        User.findById(this.recipient).select("name username avatar"),
      ]);

      if (donor) {
        this.donorInfo = {
          name: donor.name,
          username: donor.username,
          avatar: donor.avatar,
        };
      }

      if (recipient) {
        this.recipientInfo = {
          name: recipient.name,
          username: recipient.username,
          avatar: recipient.avatar,
        };
      }
    } catch (error) {
      console.error("Erro ao popular informações da doação:", error);
    }
  }

  // Definir processedAt quando status muda para completed
  if (
    this.isModified("status") &&
    this.status === "completed" &&
    !this.processedAt
  ) {
    this.processedAt = new Date();
  }

  next();
});

// Middleware pós-save para atualizar estatísticas e moedas
donationSchema.post("save", async function (doc) {
  if (doc.status === "completed" && doc.isModified("status")) {
    try {
      const User = mongoose.model("User");

      // Buscar os documentos completos do doador e do receptor
      const [donorUser, recipientUser] = await Promise.all([
        User.findById(doc.donor),
        User.findById(doc.recipient),
      ]);

      if (donorUser) {
        // Usar o método 'updateCoins' do modelo User para garantir que o middleware seja acionado
        await donorUser.updateCoins(-doc.amount, "donation");
      }

      if (recipientUser) {
        await recipientUser.updateCoins(doc.amount, "received");
      }

      // Criar notificações
      const Notification = mongoose.model("Notification");

      await Promise.all([
        // Notificação para quem recebeu
        new Notification({
          user: doc.recipient,
          title: "Doação Recebida!",
          message: `Você recebeu ${doc.amount} moedas!`,
          type: "donation_received",
          data: {
            donationId: doc._id,
            amount: doc.amount,
            donorId: doc.donor,
            donorName: doc.donorInfo.name,
          },
        }).save(),

        // Notificação para quem doou
        new Notification({
          user: doc.donor,
          title: "Doação Realizada!",
          message: `Sua doação de ${doc.amount} moedas foi processada!`,
          type: "donation_sent",
          data: {
            donationId: doc._id,
            amount: doc.amount,
            recipientId: doc.recipient,
            recipientName: doc.recipientInfo.name,
          },
        }).save(),
      ]);
    } catch (error) {
      console.error("Erro ao atualizar estatísticas:", error);
    }
  }
});

// Métodos estáticos
donationSchema.statics.getUserDonationHistory = function (
  userId,
  options = {}
) {
  const { limit = 20, skip = 0, type = "all" } = options;

  let query = {};

  switch (type) {
    case "sent":
      query.donor = userId;
      break;
    case "received":
      query.recipient = userId;
      break;
    default:
      query.$or = [{ donor: userId }, { recipient: userId }];
  }

  return this.find(query)
    .populate("donor", "name username avatar")
    .populate("recipient", "name username avatar")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

donationSchema.statics.getDailyStats = function (date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        status: "completed",
      },
    },
    {
      $group: {
        _id: null,
        totalDonations: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        avgAmount: { $avg: "$amount" },
        uniqueDonors: { $addToSet: "$donor" },
        uniqueRecipients: { $addToSet: "$recipient" },
      },
    },
    {
      $project: {
        _id: 0,
        totalDonations: 1,
        totalAmount: 1,
        avgAmount: { $round: ["$avgAmount", 2] },
        uniqueDonors: { $size: "$uniqueDonors" },
        uniqueRecipients: { $size: "$uniqueRecipients" },
      },
    },
  ]);
};

// Método para buscar doações por período
donationSchema.statics.findByPeriod = function (
  startDate,
  endDate,
  userId = null
) {
  const query = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: "completed",
  };

  if (userId) {
    query.$or = [{ donor: userId }, { recipient: userId }];
  }

  return this.find(query)
    .populate("donor", "name username avatar")
    .populate("recipient", "name username avatar")
    .sort({ createdAt: -1 });
};

// Método para estatísticas mensais de um usuário
donationSchema.statics.getMonthlyStats = async function (userId, month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const stats = await this.aggregate([
    {
      $match: {
        $or: [
          { donor: new mongoose.Types.ObjectId(userId) },
          { recipient: new mongoose.Types.ObjectId(userId) },
        ],
        createdAt: { $gte: startDate, $lte: endDate },
        status: "completed",
      },
    },
    {
      $group: {
        _id: {
          type: {
            $cond: [
              { $eq: ["$donor", new mongoose.Types.ObjectId(userId)] },
              "donated",
              "received",
            ],
          },
        },
        totalAmount: { $sum: "$amount" },
        totalCount: { $sum: 1 },
      },
    },
  ]);

  const result = {
    donated: { amount: 0, count: 0 },
    received: { amount: 0, count: 0 },
  };

  stats.forEach((stat) => {
    result[stat._id.type] = {
      amount: stat.totalAmount,
      count: stat.totalCount,
    };
  });

  return result;
};

// Método para buscar top usuários com mais interações
donationSchema.statics.getTopInteractions = function (
  userId,
  limit = 5,
  period = 30
) {
  const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        donor: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: "completed",
      },
    },
    {
      $group: {
        _id: "$recipient",
        interactionCount: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        lastInteraction: { $max: "$createdAt" },
      },
    },
    {
      $sort: { interactionCount: -1 },
    },
    {
      $limit: limit,
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userInfo",
      },
    },
    {
      $unwind: "$userInfo",
    },
    {
      $project: {
        _id: 1,
        interactionCount: 1,
        totalAmount: 1,
        lastInteraction: 1,
        userName: "$userInfo.name",
        userUsername: "$userInfo.username",
        userAvatar: "$userInfo.avatar",
      },
    },
  ]);
};

module.exports = mongoose.model("Donation", donationSchema);
