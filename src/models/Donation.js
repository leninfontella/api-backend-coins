// src/models/Donation.js
const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: 100000,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 500,
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
    },
  },
  {
    timestamps: true,
  }
);

// Índices
donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ recipient: 1, createdAt: -1 });
donationSchema.index({ status: 1 });
donationSchema.index({ createdAt: -1 });
donationSchema.index({ donor: 1, status: 1, createdAt: -1 });

// Middleware para popular informações antes de salvar
donationSchema.pre("save", async function (next) {
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

      // Criar notificações (o restante do código pode ser mantido)
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

module.exports = mongoose.model("Donation", donationSchema);
