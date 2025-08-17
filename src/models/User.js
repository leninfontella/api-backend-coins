// src/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: false, trim: true },
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },

    // ========== NOVOS CAMPOS PARA SISTEMA DE BUSCA ==========
    username: {
      type: String,
      unique: true,
      sparse: true, // permite null mas mantém unique
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
    },
    institution: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    avatar: {
      type: String,
      default: "👤",
    },

    // ========== SISTEMA DE MOEDAS - CAMPOS ATUALIZADOS ==========
    coins: {
      type: Number,
      default: 100, // Saldo inicial de 100 moedas
      min: [0, "Saldo não pode ser negativo"],
    },

    // Sistema de levels expandido e compatível
    level: {
      type: String,
      enum: [
        // Seus levels originais
        "Doador Iniciante",
        "Doador Bronze",
        "Doador Prata",
        "Doador Ouro",
        "Doador Platina",
        // Levels do novo sistema
        "Iniciante",
        "Explorador",
        "Aventureiro",
        "Benfeitor",
        "Generoso",
        "Filantropo",
        "Magnata",
        "Lenda",
        "Mito",
        "Divino",
      ],
      default: "Doador Iniciante",
    },

    // Campos originais mantidos
    totalDonated: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalReceived: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ========== NOVOS CAMPOS PARA SISTEMA AVANÇADO ==========
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    // Estatísticas detalhadas (compatível com o sistema anterior)
    stats: {
      donationsSent: { type: Number, default: 0 },
      totalDonated: { type: Number, default: 0 }, // Sincronizado com campo raiz
      donationsReceived: { type: Number, default: 0 },
      totalReceived: { type: Number, default: 0 }, // Sincronizado com campo raiz
      lastDonationAt: Date,
      lastReceivedAt: Date,
    },

    // Configurações do usuário
    settings: {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      donationPrivacy: {
        type: String,
        enum: ["public", "private", "friends"],
        default: "public",
      },
      profileVisibility: {
        type: String,
        enum: ["public", "private"],
        default: "public",
      },
      maxDonationAmount: { type: Number, default: 10000 },
      dailyDonationLimit: { type: Number, default: 50000 },
    },

    // Usuários bloqueados
    blockedUsers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: String,
        blockedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

// ========== ÍNDICES PARA OTIMIZAÇÃO ==========
userSchema.index({ name: "text", username: "text", institution: "text" });
userSchema.index({ coins: -1 });
userSchema.index({ status: 1 });
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ totalDonated: -1 });

// ========== MIDDLEWARE ==========

// Middleware para hash da senha (mantido original)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Middleware para sincronizar stats com campos raiz e calcular nível
userSchema.pre("save", function (next) {
  // Sincronizar estatísticas
  if (
    this.isModified("stats.totalDonated") ||
    this.isModified("totalDonated")
  ) {
    this.stats.totalDonated = this.totalDonated;
  }
  if (
    this.isModified("stats.totalReceived") ||
    this.isModified("totalReceived")
  ) {
    this.stats.totalReceived = this.totalReceived;
  }

  // Atualizar level se moedas mudaram
  if (
    this.isModified("coins") ||
    this.isModified("totalDonated") ||
    this.isNew
  ) {
    this.level = this.calculateLevel();
  }

  next();
});

// ========== MÉTODOS ORIGINAIS (MANTIDOS) ==========

// Método para comparar senha (mantido original)
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Método para atualizar saldo e estatísticas (melhorado)
userSchema.methods.updateCoins = async function (amount, operation = "other") {
  // Atualizar saldo
  this.coins += amount;

  // Atualizar estatísticas baseado na operação
  if (operation === "donation" && amount < 0) {
    this.totalDonated += Math.abs(amount);
    this.stats.donationsSent += 1;
    this.stats.totalDonated = this.totalDonated;
    this.stats.lastDonationAt = new Date();
  } else if (operation === "received" && amount > 0) {
    this.totalReceived += amount;
    this.stats.donationsReceived += 1;
    this.stats.totalReceived = this.totalReceived;
    this.stats.lastReceivedAt = new Date();
  }

  // Atualizar level será feito automaticamente pelo middleware
  return await this.save();
};

// Método para verificar se tem saldo suficiente (mantido)
userSchema.methods.hasEnoughCoins = function (amount) {
  return this.coins >= amount;
};

// ========== NOVOS MÉTODOS ==========

// Método melhorado para calcular level (compatível com sistema antigo e novo)
userSchema.methods.calculateLevel = function () {
  const donated = this.totalDonated;
  const coins = this.coins;

  // Sistema baseado principalmente em moedas totais (coins + donated)
  const totalWealth = coins + donated;

  // Níveis do novo sistema (baseado em wealth total)
  if (totalWealth >= 1000000) return "Divino";
  if (totalWealth >= 500000) return "Mito";
  if (totalWealth >= 100000) return "Lenda";
  if (totalWealth >= 50000) return "Magnata";
  if (totalWealth >= 10000) return "Filantropo";
  if (totalWealth >= 5000) return "Generoso";
  if (totalWealth >= 2000) return "Benfeitor";
  if (totalWealth >= 1000) return "Aventureiro";
  if (totalWealth >= 500) return "Explorador";

  // Manter compatibilidade com sistema antigo para usuários existentes
  if (donated >= 5000) return "Doador Platina";
  if (donated >= 2000) return "Doador Ouro";
  if (donated >= 1000) return "Doador Prata";
  if (donated >= 500) return "Doador Bronze";

  return coins >= 100 ? "Iniciante" : "Doador Iniciante";
};

// Método original atualizado para usar o novo sistema
userSchema.methods.updateLevel = function () {
  this.level = this.calculateLevel();
};

// Novo método para verificar se pode doar (com mais validações)
userSchema.methods.canDonate = function (amount) {
  return (
    this.coins >= amount &&
    this.status === "active" &&
    amount > 0 &&
    amount <= (this.settings.maxDonationAmount || 10000)
  );
};

// Método para obter total de doações do dia
userSchema.methods.getDailyDonationTotal = async function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const Donation = mongoose.model("Donation");
  const result = await Donation.aggregate([
    {
      $match: {
        donor: this._id,
        status: "completed",
        createdAt: { $gte: today, $lt: tomorrow },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);

  return result.length > 0 ? result[0].total : 0;
};

// Método para verificar se usuário está bloqueado
userSchema.methods.isBlocked = function (userId) {
  return this.blockedUsers.some(
    (blocked) => blocked.user.toString() === userId.toString()
  );
};

// Método para obter dados públicos (atualizado)
userSchema.methods.getPublicData = function () {
  return {
    id: this._id,
    fullName: this.fullName || this.name,
    name: this.name,
    username: this.username,
    email: this.email,
    avatar: this.avatar,
    institution: this.institution,
    coins: this.coins,
    level: this.level,
    totalDonated: this.totalDonated,
    totalReceived: this.totalReceived,
    stats: {
      donationsSent: this.stats.donationsSent,
      donationsReceived: this.stats.donationsReceived,
      lastDonationAt: this.stats.lastDonationAt,
      lastReceivedAt: this.stats.lastReceivedAt,
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// ========== MÉTODOS ESTÁTICOS ==========

// Ranking de usuários
userSchema.statics.getRanking = function (limit = 100, skip = 0) {
  return this.find({ status: "active" })
    .sort({ coins: -1, totalDonated: -1, name: 1 })
    .select(
      "name username fullName avatar institution coins level totalDonated totalReceived stats createdAt"
    )
    .limit(limit)
    .skip(skip);
};

// Buscar usuários
userSchema.statics.searchUsers = function (query, currentUserId, options = {}) {
  const { limit = 20, skip = 0 } = options;

  return this.find({
    $and: [
      { _id: { $ne: currentUserId } },
      { status: "active" },
      { "blockedUsers.user": { $ne: currentUserId } },
      {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { fullName: { $regex: query, $options: "i" } },
          { username: { $regex: query, $options: "i" } },
          { institution: { $regex: query, $options: "i" } },
        ],
      },
    ],
  })
    .select(
      "name fullName username avatar institution coins level stats totalDonated totalReceived"
    )
    .sort({ coins: -1, totalDonated: -1, name: 1 })
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model("User", userSchema);
