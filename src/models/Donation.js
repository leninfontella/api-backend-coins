// src/models/Donation.js
const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: 100000,
    },
    message: {
      type: String,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    type: {
      type: String,
      enum: ["user", "system", "bonus", "reward"],
      default: "user",
    },
    category: {
      type: String,
      enum: ["donation", "bonus", "reward", "refund", "transfer"],
      default: "donation",
    },
    // 🔧 CORREÇÃO: Atualizar donorInfo para incluir profilePhotoUrl
    donorInfo: {
      name: String,
      username: String,
      avatar: String,
      profilePhotoUrl: String, // 🔧 NOVO
      privacy: {
        type: String,
        enum: ["public", "private"],
        default: "public",
      },
    },
    // 🔧 CORREÇÃO: Atualizar recipientInfo para incluir profilePhotoUrl
    recipientInfo: {
      name: String,
      username: String,
      avatar: String,
      profilePhotoUrl: String, // 🔧 NOVO
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
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

// Virtual para verificar se é doação pública
donationSchema.virtual("isPublic").get(function () {
  return this.donorInfo?.privacy !== "private";
});

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

// Middleware pre-save para atualizar donorInfo e recipientInfo
donationSchema.pre("save", async function (next) {
  // 🔧 NOVO: Garantir que profilePhotoUrl seja salvo em donorInfo/recipientInfo
  if (this.isNew || this.isModified("donor") || this.isModified("recipient")) {
    const User = mongoose.model("User");

    // Buscar donor se necessário
    if (this.donor && (!this.donorInfo || !this.donorInfo.profilePhotoUrl)) {
      const donor = await User.findById(this.donor).select(
        "name fullName username avatar profilePhoto"
      );
      if (donor) {
        this.donorInfo = {
          name: donor.fullName || donor.name,
          username: donor.username,
          avatar: donor.avatar,
          profilePhotoUrl: donor.profilePhotoUrl, // Virtual
          privacy: this.donorInfo?.privacy || "public",
        };
      }
    }

    // Buscar recipient se necessário
    if (
      this.recipient &&
      (!this.recipientInfo || !this.recipientInfo.profilePhotoUrl)
    ) {
      const recipient = await User.findById(this.recipient).select(
        "name fullName username avatar profilePhoto"
      );
      if (recipient) {
        this.recipientInfo = {
          name: recipient.fullName || recipient.name,
          username: recipient.username,
          avatar: recipient.avatar,
          profilePhotoUrl: recipient.profilePhotoUrl, // Virtual
        };
      }
    }
  }

  next();
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

// Método estático para buscar doações com informações completas
donationSchema.statics.findWithFullInfo = async function (query, options = {}) {
  const { page = 1, limit = 20, sort = { createdAt: -1 } } = options;
  const skip = (page - 1) * limit;

  // 🔧 CORREÇÃO: Incluir profilePhoto no populate
  const donations = await this.find(query)
    .populate("donor", "name fullName username avatar profilePhoto")
    .populate("recipient", "name fullName username avatar profilePhoto")
    .sort(sort)
    .limit(limit)
    .skip(skip);

  const total = await this.countDocuments(query);

  // 🔧 NOVO: Processar para garantir profilePhotoUrl
  const processedDonations = donations.map((donation) => {
    const obj = donation.toObject();

    // Adicionar profilePhotoUrl se não existir em donorInfo
    if (obj.donor && !obj.donorInfo?.profilePhotoUrl) {
      obj.donorInfo = {
        ...obj.donorInfo,
        profilePhotoUrl: obj.donor.profilePhotoUrl,
      };
    }

    // Adicionar profilePhotoUrl se não existir em recipientInfo
    if (obj.recipient && !obj.recipientInfo?.profilePhotoUrl) {
      obj.recipientInfo = {
        ...obj.recipientInfo,
        profilePhotoUrl: obj.recipient.profilePhotoUrl,
      };
    }

    return obj;
  });

  return {
    donations: processedDonations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: skip + limit < total,
      hasPrev: page > 1,
    },
  };
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

// Método de instância para obter informações completas
donationSchema.methods.getFullInfo = async function () {
  await this.populate([
    { path: "donor", select: "name fullName username avatar profilePhoto" },
    { path: "recipient", select: "name fullName username avatar profilePhoto" },
  ]);

  return {
    ...this.toObject(),
    donor: {
      ...this.donor?.toObject(),
      profilePhotoUrl: this.donor?.profilePhotoUrl,
    },
    recipient: {
      ...this.recipient?.toObject(),
      profilePhotoUrl: this.recipient?.profilePhotoUrl,
    },
    donorInfo: {
      ...this.donorInfo,
      profilePhotoUrl:
        this.donor?.profilePhotoUrl || this.donorInfo?.profilePhotoUrl,
    },
    recipientInfo: {
      ...this.recipientInfo,
      profilePhotoUrl:
        this.recipient?.profilePhotoUrl || this.recipientInfo?.profilePhotoUrl,
    },
  };
};

const Donation = mongoose.model("Donation", donationSchema);

module.exports = Donation;
