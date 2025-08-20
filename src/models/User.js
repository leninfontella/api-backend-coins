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
      max: [10000000, "Saldo máximo excedido"], // Limite de segurança
      validate: {
        validator: Number.isInteger,
        message: "Saldo deve ser um número inteiro",
      },
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
      validate: {
        validator: Number.isInteger,
        message: "Total doado deve ser um número inteiro",
      },
    },
    totalReceived: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Total recebido deve ser um número inteiro",
      },
    },

    // ========== NOVOS CAMPOS PARA SISTEMA AVANÇADO ==========
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    // Estatísticas detalhadas (compatível com o sistema anterior)
    stats: {
      donationsSent: { type: Number, default: 0, min: 0 },
      totalDonated: { type: Number, default: 0, min: 0 }, // Sincronizado com campo raiz
      donationsReceived: { type: Number, default: 0, min: 0 },
      totalReceived: { type: Number, default: 0, min: 0 }, // Sincronizado com campo raiz
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
      maxDonationAmount: {
        type: Number,
        default: 10000,
        min: 1,
        max: 100000,
      },
      dailyDonationLimit: {
        type: Number,
        default: 50000,
        min: 1,
        max: 1000000,
      },
    },

    // Usuários bloqueados
    blockedUsers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, maxlength: 500 },
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
userSchema.index({ createdAt: -1 }); // Para ordenação por data de criação

// ========== MIDDLEWARE ==========

// Middleware para hash da senha (mantido original)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware para sincronizar stats com campos raiz e calcular nível
userSchema.pre("save", function (next) {
  try {
    // Garantir que valores não sejam negativos
    this.coins = Math.max(0, this.coins || 0);
    this.totalDonated = Math.max(0, this.totalDonated || 0);
    this.totalReceived = Math.max(0, this.totalReceived || 0);

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
  } catch (error) {
    next(error);
  }
});

// ========== MÉTODOS ORIGINAIS (MANTIDOS) ==========

// Método para comparar senha (mantido original)
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Método para atualizar saldo e estatísticas (melhorado com validação)
userSchema.methods.updateCoins = async function (amount, operation = "other") {
  // Validação de entrada
  if (!Number.isInteger(amount)) {
    throw new Error("Quantidade deve ser um número inteiro");
  }

  // Verificar se operação não deixará saldo negativo
  if (this.coins + amount < 0) {
    throw new Error("Saldo insuficiente para esta operação");
  }

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

// Método para validar integridade dos dados
userSchema.methods.validateIntegrity = function () {
  const issues = [];

  if (this.coins < 0) issues.push("Saldo negativo");
  if (this.totalDonated < 0) issues.push("Total doado negativo");
  if (this.totalReceived < 0) issues.push("Total recebido negativo");
  if (this.stats.donationsSent < 0) issues.push("Doações enviadas negativas");
  if (this.stats.donationsReceived < 0)
    issues.push("Doações recebidas negativas");

  // Verificar sincronização
  if (this.stats.totalDonated !== this.totalDonated) {
    issues.push("Dessincronização em totalDonated");
  }
  if (this.stats.totalReceived !== this.totalReceived) {
    issues.push("Dessincronização em totalReceived");
  }

  return {
    isValid: issues.length === 0,
    issues: issues,
  };
};

// Método melhorado para calcular level (compatível com sistema antigo e novo)
userSchema.methods.calculateLevel = function () {
  const donated = this.totalDonated || 0;
  const coins = this.coins || 0;

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
  return this.level;
};

// Novo método para verificar se pode doar (com mais validações)
userSchema.methods.canDonate = function (amount) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if (this.status !== "active") return false;
  if (this.coins < amount) return false;

  const maxAmount = this.settings.maxDonationAmount || 10000;
  if (amount > maxAmount) return false;

  return true;
};

// Método para obter total de doações do dia (com tratamento de erro)
userSchema.methods.getDailyDonationTotal = async function () {
  try {
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
  } catch (error) {
    console.error("Erro ao calcular doações diárias:", error);
    return 0;
  }
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

// Ranking de usuários (com tratamento de erro)
userSchema.statics.getRanking = function (limit = 100, skip = 0) {
  return this.find({ status: "active" })
    .sort({ coins: -1, totalDonated: -1, name: 1 })
    .select(
      "name username fullName avatar institution coins level totalDonated totalReceived stats createdAt"
    )
    .limit(Math.min(limit, 1000)) // Limite máximo de segurança
    .skip(Math.max(0, skip));
};

// Buscar usuários (melhorado)
userSchema.statics.searchUsers = function (query, currentUserId, options = {}) {
  const { limit = 20, skip = 0 } = options;

  if (!query || query.trim().length < 2) {
    throw new Error("Query deve ter pelo menos 2 caracteres");
  }

  const sanitizedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return this.find({
    $and: [
      { _id: { $ne: currentUserId } },
      { status: "active" },
      { "blockedUsers.user": { $ne: currentUserId } },
      {
        $or: [
          { name: { $regex: sanitizedQuery, $options: "i" } },
          { fullName: { $regex: sanitizedQuery, $options: "i" } },
          { username: { $regex: sanitizedQuery, $options: "i" } },
          { institution: { $regex: sanitizedQuery, $options: "i" } },
        ],
      },
    ],
  })
    .select(
      "name fullName username avatar institution coins level stats totalDonated totalReceived"
    )
    .sort({ coins: -1, totalDonated: -1, name: 1 })
    .limit(Math.min(limit, 100)) // Limite máximo de segurança
    .skip(Math.max(0, skip));
};

// Método para corrigir dados inconsistentes
userSchema.statics.fixDataIntegrity = async function () {
  try {
    const users = await this.find({});
    let fixedCount = 0;

    for (const user of users) {
      let needsUpdate = false;

      // Corrigir valores negativos
      if (user.coins < 0) {
        user.coins = 0;
        needsUpdate = true;
      }
      if (user.totalDonated < 0) {
        user.totalDonated = 0;
        needsUpdate = true;
      }
      if (user.totalReceived < 0) {
        user.totalReceived = 0;
        needsUpdate = true;
      }

      // Sincronizar stats
      if (user.stats.totalDonated !== user.totalDonated) {
        user.stats.totalDonated = user.totalDonated;
        needsUpdate = true;
      }
      if (user.stats.totalReceived !== user.totalReceived) {
        user.stats.totalReceived = user.totalReceived;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await user.save();
        fixedCount++;
      }
    }

    return { message: `${fixedCount} usuários corrigidos` };
  } catch (error) {
    throw new Error(`Erro ao corrigir integridade: ${error.message}`);
  }
};

module.exports = mongoose.model("User", userSchema);
