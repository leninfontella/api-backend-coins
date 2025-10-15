// src/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ========== CAMPOS BÁSICOS ==========
    fullName: {
      type: String,
      required: false,
      trim: true,
      maxlength: [100, "Nome completo não pode exceder 100 caracteres"],
    },
    name: {
      type: String,
      required: [true, "Nome é obrigatório"],
      trim: true,
      minlength: [2, "Nome deve ter pelo menos 2 caracteres"],
      maxlength: [100, "Nome não pode exceder 100 caracteres"],
    },
    email: {
      type: String,
      required: [true, "Email é obrigatório"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Email inválido"],
    },
    password: {
      type: String,
      required: [true, "Senha é obrigatória"],
      minlength: [6, "Senha deve ter pelo menos 6 caracteres"],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, "Telefone não pode ter mais de 20 caracteres"],
      default: "",
    },

    // ========== FOTO DE PERFIL ==========
    profilePhoto: {
      filename: { type: String, default: null },
      path: { type: String, default: null },
      uploadDate: { type: Date, default: null },
      storage: {
        type: String,
        enum: ["local", "gcs", null],
        default: null,
      },
      bucket: { type: String, default: null },
    },

    // ========== CAMPOS PARA SISTEMA DE BUSCA ==========
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Username deve ter pelo menos 3 caracteres"],
      maxlength: [30, "Username não pode exceder 30 caracteres"],
    },
    institution: {
      type: String,
      trim: true,
      maxlength: [255, "Instituição não pode exceder 255 caracteres"],
    },
    avatar: {
      type: String,
      default: "👤",
    },

    // ========== SISTEMA DE MOEDAS E GAMIFICAÇÃO ==========
    coins: {
      type: Number,
      default: 100,
      min: [0, "Saldo não pode ser negativo"],
      max: [10000000, "Saldo máximo excedido"],
      validate: {
        validator: Number.isInteger,
        message: "Saldo deve ser um número inteiro",
      },
    },

    // ✅ Sistema de levels baseado APENAS em totalDonated
    level: {
      type: String,
      enum: [
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
      default: "Iniciante",
    },

    // ✅ XP removido ou mantido separado (não afeta level)
    xp: {
      type: Number,
      default: 0,
      min: [0, "XP não pode ser negativo"],
    },
    maxXp: {
      type: Number,
      default: 1000,
    },

    // ✅ Métricas totais - totalDonated define o level
    totalDonated: {
      type: Number,
      default: 0,
      min: [0, "Total doado não pode ser negativo"],
      validate: {
        validator: Number.isInteger,
        message: "Total doado deve ser um número inteiro",
      },
    },
    totalReceived: {
      type: Number,
      default: 0,
      min: [0, "Total recebido não pode ser negativo"],
      validate: {
        validator: Number.isInteger,
        message: "Total recebido deve ser um número inteiro",
      },
    },

    // Compatibilidade
    totalDonations: {
      type: Number,
      default: 0,
      min: [0, "Total de doações não pode ser negativo"],
    },

    // Metas e objetivos
    monthlyGoal: {
      type: Number,
      default: 500,
      min: [50, "Meta mínima é 50 moedas"],
      max: [50000, "Meta máxima é 50.000 moedas"],
    },

    // Score e ranking
    score: {
      type: Number,
      default: 0,
      min: [0, "Score não pode ser negativo"],
    },
    rank: {
      type: Number,
      default: null,
    },

    // ========== STATUS E SEGURANÇA ==========
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // ========== AUTENTICAÇÃO ==========
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 604800,
        },
      },
    ],

    // ========== ESTATÍSTICAS DETALHADAS ==========
    stats: {
      donationsSent: { type: Number, default: 0, min: 0 },
      donationsCount: { type: Number, default: 0, min: 0 },
      totalDonated: { type: Number, default: 0, min: 0 },
      donationsReceived: { type: Number, default: 0, min: 0 },
      receivedCount: { type: Number, default: 0, min: 0 },
      totalReceived: { type: Number, default: 0, min: 0 },
      lastDonationAt: Date,
      lastDonationDate: Date,
      lastReceivedAt: Date,
      lastReceivedDate: Date,
      joinedDate: {
        type: Date,
        default: Date.now,
      },
      longestDonationStreak: { type: Number, default: 0 },
      currentDonationStreak: { type: Number, default: 0 },
    },

    // ========== CONFIGURAÇÕES DO USUÁRIO ==========
    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        donations: { type: Boolean, default: true },
        achievements: { type: Boolean, default: true },
      },
      privacy: {
        showProfile: { type: Boolean, default: true },
        showStats: { type: Boolean, default: true },
        showRanking: { type: Boolean, default: true },
      },
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "auto",
      },
    },

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

    // ========== AUDITORIA E SEGURANÇA ==========
    loginCount: { type: Number, default: 0 },
    ipAddress: String,
    userAgent: String,

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
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.verificationToken;
        delete ret.resetPasswordToken;
        delete ret.refreshTokens;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ========== ÍNDICES PARA OTIMIZAÇÃO ==========
userSchema.index({ name: "text", username: "text", institution: "text" });
userSchema.index({ email: 1 });
userSchema.index({ coins: -1 });
userSchema.index({ score: -1 });
userSchema.index({ status: 1 });
userSchema.index({ username: 1 });
userSchema.index({ totalDonated: -1 });
userSchema.index({ xp: -1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// ========== VIRTUALS ==========
userSchema.virtual("firstName").get(function () {
  return this.name ? this.name.split(" ")[0] : "";
});

userSchema.virtual("profilePhotoUrl").get(function () {
  if (this.profilePhoto && this.profilePhoto.path) {
    if (this.profilePhoto.storage === "gcs") {
      return this.profilePhoto.path;
    }

    if (this.profilePhoto.path.startsWith("/uploads/")) {
      return this.profilePhoto.path;
    }

    return `/uploads/profiles/${this.profilePhoto.filename}`;
  }

  return null;
});

// ✅ Progresso baseado no totalDonated para o próximo level
userSchema.virtual("levelProgress").get(function () {
  const levelInfo = this.calculateLevelInfo();
  if (!levelInfo || levelInfo.max === Infinity) return 100;

  const range = levelInfo.max - levelInfo.min + 1;
  const current = this.totalDonated - levelInfo.min;
  return Math.min(100, Math.max(0, (current / range) * 100));
});

// ✅ Moedas necessárias para o próximo nível
userSchema.virtual("coinsToNextLevel").get(function () {
  const levelInfo = this.calculateLevelInfo();
  if (!levelInfo || levelInfo.max === Infinity) return 0;
  return Math.max(0, levelInfo.max + 1 - this.totalDonated);
});

// ========== MIDDLEWARE ==========
userSchema.pre("save", function (next) {
  if (this.profilePhoto && this.profilePhoto.filename) {
    if (this.profilePhoto.storage === "gcs") {
      console.log(`✅ Foto no GCS, pulando validação local`);
      return next();
    }

    if (!this.profilePhotoExists()) {
      this.profilePhoto = {
        filename: null,
        path: null,
        uploadDate: null,
        storage: null,
        bucket: null,
      };
    }
  }

  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    console.error("Erro ao criptografar senha:", error);
    next(error);
  }
});

userSchema.pre("save", function (next) {
  if (this.profilePhoto && this.profilePhoto.filename) {
    if (!this.profilePhotoExists()) {
      console.log(
        `Foto ${this.profilePhoto.filename} não encontrada, limpando dados`
      );
      this.profilePhoto = {
        filename: null,
        path: null,
        uploadDate: null,
      };
    }
  }

  next();
});

// ✅ Atualizar level baseado APENAS em totalDonated
userSchema.pre("save", function (next) {
  try {
    this.coins = Math.max(0, this.coins || 0);
    this.totalDonated = Math.max(0, this.totalDonated || 0);
    this.totalReceived = Math.max(0, this.totalReceived || 0);
    this.totalDonations = Math.max(0, this.totalDonations || 0);
    this.xp = Math.max(0, this.xp || 0);
    this.score = Math.max(0, this.score || 0);

    // Sincronizar estatísticas
    this.stats.totalDonated = this.totalDonated;
    this.stats.totalReceived = this.totalReceived;
    this.stats.donationsCount = this.stats.donationsSent;
    this.stats.receivedCount = this.stats.donationsReceived;
    this.stats.lastDonationDate = this.stats.lastDonationAt;
    this.stats.lastReceivedDate = this.stats.lastReceivedAt;
    this.totalDonations = this.totalDonated;

    // ✅ Atualizar level baseado APENAS em totalDonated
    if (this.isModified("totalDonated") || this.isNew) {
      this.level = this.calculateLevel();
    }

    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// ========== MÉTODOS DE INSTÂNCIA ==========

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Erro ao comparar senhas");
  }
};

userSchema.methods.removeOldProfilePhoto = async function () {
  if (this.profilePhoto && this.profilePhoto.filename) {
    try {
      if (this.profilePhoto.storage === "gcs") {
        const gcsService = require("../services/gcsService");
        await gcsService.deleteImage(this.profilePhoto.filename);
        console.log(
          `🗑️ Foto antiga removida do GCS: ${this.profilePhoto.filename}`
        );
        return;
      }

      const fs = require("fs");
      const path = require("path");
      const oldPath = path.join(
        __dirname,
        "../uploads/profiles",
        this.profilePhoto.filename
      );

      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        console.log(`🗑️ Foto antiga removida: ${this.profilePhoto.filename}`);
      }
    } catch (error) {
      console.error("Erro ao remover foto antiga:", error);
    }
  }
};

userSchema.methods.migratePhotoToGCS = async function () {
  if (this.profilePhoto && this.profilePhoto.storage === "local") {
    try {
      const fs = require("fs");
      const path = require("path");
      const gcsService = require("../services/gcsService");

      const localPath = path.join(
        __dirname,
        "../uploads/profiles",
        this.profilePhoto.filename
      );

      if (!fs.existsSync(localPath)) {
        console.log(
          `⚠️ Arquivo local não encontrado para migração: ${this.profilePhoto.filename}`
        );
        return false;
      }

      const imageBuffer = fs.readFileSync(localPath);
      const uploadResult = await gcsService.uploadImage(
        imageBuffer,
        this.profilePhoto.filename,
        "image/webp"
      );

      if (uploadResult.success) {
        this.profilePhoto.path = uploadResult.url;
        this.profilePhoto.storage = "gcs";
        this.profilePhoto.bucket = uploadResult.bucket;

        await this.save();
        fs.unlinkSync(localPath);

        console.log(`✅ Foto migrada para GCS: ${this.profilePhoto.filename}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Erro ao migrar foto para GCS:", error);
      return false;
    }
  }
  return false;
};

userSchema.methods.getProfilePhotoFullUrl = function (baseUrl) {
  if (this.profilePhoto && this.profilePhoto.filename) {
    const filename = this.profilePhoto.filename;
    const basePath = `/uploads/profiles/${filename}`;

    if (baseUrl) {
      const cleanBaseUrl = baseUrl.replace(/\/$/, "");
      return `${cleanBaseUrl}${basePath}`;
    }

    return basePath;
  }
  return null;
};

userSchema.methods.profilePhotoExists = function () {
  if (!this.profilePhoto || !this.profilePhoto.filename) {
    return false;
  }

  if (this.profilePhoto.storage === "gcs") {
    return true;
  }

  const fs = require("fs");
  const path = require("path");

  try {
    const photoPath = path.join(
      __dirname,
      "../uploads/profiles",
      this.profilePhoto.filename
    );
    return fs.existsSync(photoPath);
  } catch (error) {
    console.error("Erro ao verificar existência da foto:", error);
    return false;
  }
};

// ✅ NOVA FUNÇÃO: Calcular informações do level baseado em totalDonated
userSchema.methods.calculateLevelInfo = function () {
  const levels = {
    1: { min: 0, max: 199, name: "Iniciante", color: "#8B5CF6", icon: "🌱" },
    2: { min: 200, max: 499, name: "Explorador", color: "#06B6D4", icon: "🔍" },
    3: {
      min: 500,
      max: 999,
      name: "Aventureiro",
      color: "#10B981",
      icon: "🎒",
    },
    4: {
      min: 1000,
      max: 4999,
      name: "Benfeitor",
      color: "#F59E0B",
      icon: "🤝",
    },
    5: { min: 5000, max: 9999, name: "Generoso", color: "#EF4444", icon: "❤️" },
    6: {
      min: 10000,
      max: 49999,
      name: "Filantropo",
      color: "#EC4899",
      icon: "🏆",
    },
    7: {
      min: 50000,
      max: 99999,
      name: "Magnata",
      color: "#8B5CF6",
      icon: "💎",
    },
    8: {
      min: 100000,
      max: 499999,
      name: "Lenda",
      color: "#06B6D4",
      icon: "⭐",
    },
    9: { min: 500000, max: 999999, name: "Mito", color: "#F97316", icon: "🔥" },
    10: {
      min: 1000000,
      max: Infinity,
      name: "Divino",
      color: "#FFD700",
      icon: "👑",
    },
  };

  for (let level = 1; level <= 10; level++) {
    const levelInfo = levels[level];
    if (
      this.totalDonated >= levelInfo.min &&
      this.totalDonated <= levelInfo.max
    ) {
      return { level, ...levelInfo };
    }
  }

  return { level: 1, ...levels[1] };
};

// ✅ ATUALIZADO: Calcular level baseado APENAS em totalDonated
userSchema.methods.calculateLevel = function () {
  const donated = this.totalDonated || 0;

  if (donated >= 1000000) return "Divino";
  if (donated >= 500000) return "Mito";
  if (donated >= 100000) return "Lenda";
  if (donated >= 50000) return "Magnata";
  if (donated >= 10000) return "Filantropo";
  if (donated >= 5000) return "Generoso";
  if (donated >= 1000) return "Benfeitor";
  if (donated >= 500) return "Aventureiro";
  if (donated >= 200) return "Explorador";

  return "Iniciante";
};

// ✅ MANTIDO: XP separado (não afeta level)
userSchema.methods.addExperience = function (xpAmount) {
  this.xp += xpAmount;
  return {
    xpGained: xpAmount,
    totalXp: this.xp,
  };
};

// ✅ ATUALIZADO: Processar doações e atualizar level
userSchema.methods.updateCoins = async function (amount, operation = "other") {
  if (!Number.isInteger(amount)) {
    throw new Error("Quantidade deve ser um número inteiro");
  }

  if (this.coins + amount < 0) {
    throw new Error("Saldo insuficiente para esta operação");
  }

  const oldLevel = this.level;
  this.coins += amount;

  let xpGained = 0;
  let levelUp = false;

  if (operation === "donation" && amount < 0) {
    const donatedAmount = Math.abs(amount);
    this.totalDonated += donatedAmount;
    this.totalDonations += donatedAmount;
    this.stats.donationsSent += 1;
    this.stats.totalDonated = this.totalDonated;
    this.stats.lastDonationAt = new Date();

    // XP por doação
    xpGained = donatedAmount;
    this.addExperience(xpGained);

    // Score por doação
    this.score += Math.floor(donatedAmount * 1.5);

    // ✅ Recalcular level baseado no novo totalDonated
    const newLevel = this.calculateLevel();
    levelUp = oldLevel !== newLevel;
    this.level = newLevel;
  } else if (operation === "received" && amount > 0) {
    this.totalReceived += amount;
    this.stats.donationsReceived += 1;
    this.stats.totalReceived = this.totalReceived;
    this.stats.lastReceivedAt = new Date();

    xpGained = Math.floor(amount * 0.5);
    this.addExperience(xpGained);

    this.score += Math.floor(amount * 0.8);
  }

  await this.save();

  return {
    success: true,
    newBalance: this.coins,
    xpGained: xpGained,
    levelUp: levelUp,
    oldLevel: oldLevel,
    newLevel: this.level,
  };
};

userSchema.methods.hasEnoughCoins = function (amount) {
  return this.coins >= amount;
};

userSchema.methods.canDonate = function (amount) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if (this.status !== "active" || !this.isActive) return false;
  if (this.coins < amount) return false;

  const maxAmount = this.settings.maxDonationAmount || 10000;
  if (amount > maxAmount) return false;

  return true;
};

userSchema.methods.processDonation = async function (amount, toUserId) {
  return await this.updateCoins(-amount, "donation");
};

userSchema.methods.receiveDonation = async function (amount, fromUserId) {
  return await this.updateCoins(amount, "received");
};

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

userSchema.methods.isBlocked = function (userId) {
  return this.blockedUsers.some(
    (blocked) => blocked.user.toString() === userId.toString()
  );
};

userSchema.methods.validateIntegrity = function () {
  const issues = [];

  if (this.coins < 0) issues.push("Saldo negativo");
  if (this.totalDonated < 0) issues.push("Total doado negativo");
  if (this.totalReceived < 0) issues.push("Total recebido negativo");
  if (this.xp < 0) issues.push("XP negativo");
  if (this.score < 0) issues.push("Score negativo");

  return {
    isValid: issues.length === 0,
    issues: issues,
  };
};

userSchema.methods.getPublicData = function () {
  return {
    id: this._id,
    fullName: this.fullName || this.name,
    name: this.name,
    username: this.username,
    email: this.email,
    avatar: this.avatar,
    profilePhotoUrl: this.profilePhotoUrl,
    institution: this.institution,
    coins: this.coins,
    balance: this.coins,
    level: this.level,
    xp: this.xp,
    maxXp: this.maxXp,
    score: this.score,
    totalDonated: this.totalDonated,
    totalReceived: this.totalReceived,
    totalDonations: this.totalDonations,
    stats: this.stats,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// ========== MÉTODOS ESTÁTICOS ==========

userSchema.statics.getRanking = function (limit = 100, skip = 0) {
  return this.find({ status: "active", isActive: true })
    .sort({ totalDonated: -1, score: -1, coins: -1, name: 1 })
    .select(
      "name username fullName avatar profilePhotoUrl institution coins level xp score totalDonated totalReceived totalDonations stats createdAt"
    )
    .limit(Math.min(limit, 1000))
    .skip(Math.max(0, skip));
};

userSchema.statics.getUserRank = async function (userId) {
  const user = await this.findById(userId);
  if (!user) return null;

  const rank = await this.countDocuments({
    isActive: true,
    status: "active",
    $or: [
      { totalDonated: { $gt: user.totalDonated } },
      { totalDonated: user.totalDonated, score: { $gt: user.score } },
      {
        totalDonated: user.totalDonated,
        score: user.score,
        coins: { $gt: user.coins },
      },
    ],
  });

  return rank + 1;
};

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
      { isActive: true },
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
      "name fullName username avatar profilePhotoUrl institution coins level xp score stats totalDonated totalReceived totalDonations"
    )
    .sort({ totalDonated: -1, score: -1, coins: -1, name: 1 })
    .limit(Math.min(limit, 100))
    .skip(Math.max(0, skip));
};

userSchema.statics.fixDataIntegrity = async function () {
  try {
    const users = await this.find({});
    let fixedCount = 0;

    for (const user of users) {
      let needsUpdate = false;

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
      if (user.xp < 0) {
        user.xp = 0;
        needsUpdate = true;
      }
      if (user.score < 0) {
        user.score = 0;
        needsUpdate = true;
      }

      if (user.stats.totalDonated !== user.totalDonated) {
        user.stats.totalDonated = user.totalDonated;
        needsUpdate = true;
      }
      if (user.stats.totalReceived !== user.totalReceived) {
        user.stats.totalReceived = user.totalReceived;
        needsUpdate = true;
      }

      if (user.totalDonations !== user.totalDonated) {
        user.totalDonations = user.totalDonated;
        needsUpdate = true;
      }

      // ✅ Recalcular level baseado em totalDonated
      const correctLevel = user.calculateLevel();
      if (user.level !== correctLevel) {
        user.level = correctLevel;
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
