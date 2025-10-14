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
      // match: [
      //   /^(\+55\s?)?(\(?[1-9]{2}\)?\s?)?9?[0-9]{4}[-\s]?[0-9]{4}$/,
      //   "Telefone inválido",
      // ],
    },

    // ========== FOTO DE PERFIL ==========
    profilePhoto: {
      filename: { type: String, default: null },
      path: { type: String, default: null },
      uploadDate: { type: Date, default: null },
      // 🆕 NOVOS CAMPOS PARA GCS
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
      default: 100, // Valor inicial do Claude
      min: [0, "Saldo não pode ser negativo"],
      max: [10000000, "Saldo máximo excedido"],
      validate: {
        validator: Number.isInteger,
        message: "Saldo deve ser um número inteiro",
      },
    },

    // Sistema de levels expandido
    level: {
      type: String,
      enum: [
        "Iniciante",
        "Explorador",
        "Aventureiro",
        "Contribuidor",
        "Benfeitor",
        "Generoso",
        "Expert",
        "Filantropo",
        "Magnata",
        "Mestre",
        "Lenda",
        "Mito",
        "Divino",
      ],
      default: "Iniciante",
    },

    // Experiência e progressão
    xp: {
      type: Number,
      default: 0,
      min: [0, "XP não pode ser negativo"],
    },
    maxXp: {
      type: Number,
      default: 1000,
    },

    // Métricas totais
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

    // Compatibilidade com o código do Claude
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
          expires: 604800, // 7 dias
        },
      },
    ],

    // ========== ESTATÍSTICAS DETALHADAS ==========
    stats: {
      donationsSent: { type: Number, default: 0, min: 0 },
      donationsCount: { type: Number, default: 0, min: 0 }, // Alias
      totalDonated: { type: Number, default: 0, min: 0 },
      donationsReceived: { type: Number, default: 0, min: 0 },
      receivedCount: { type: Number, default: 0, min: 0 }, // Alias
      totalReceived: { type: Number, default: 0, min: 0 },
      lastDonationAt: Date,
      lastDonationDate: Date, // Alias
      lastReceivedAt: Date,
      lastReceivedDate: Date, // Alias
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

// Virtual para URL completa da foto - VERSÃO CORRIGIDA

userSchema.virtual("profilePhotoUrl").get(function () {
  // 🔧 CRÍTICO: Nunca retornar avatar/emoji aqui
  if (this.profilePhoto && this.profilePhoto.path) {
    // Se for GCS, retorna a URL diretamente (já é pública)
    if (this.profilePhoto.storage === "gcs") {
      return this.profilePhoto.path; // ✅ URL completa do GCS
    }

    // Se for local, constrói a URL relativa
    if (this.profilePhoto.path.startsWith("/uploads/")) {
      return this.profilePhoto.path;
    }

    return `/uploads/profiles/${this.profilePhoto.filename}`;
  }

  // 🔧 CORREÇÃO CRÍTICA: Retornar NULL em vez de avatar
  // O avatar deve ser usado apenas no frontend como fallback
  return null;
});

userSchema.virtual("levelProgress").get(function () {
  const level = this.calculateLevelInfo();
  if (!level || level.maxXp === Infinity) return 100;

  const progress =
    ((this.xp - level.minXp) / (level.maxXp - level.minXp)) * 100;
  return Math.min(Math.max(progress, 0), 100);
});

userSchema.virtual("nextLevelXp").get(function () {
  const level = this.calculateLevelInfo();
  return level && level.maxXp !== Infinity ? level.maxXp : null;
});

// ========== MIDDLEWARE ==========
userSchema.pre("save", function (next) {
  // Validação apenas para fotos LOCAIS
  if (this.profilePhoto && this.profilePhoto.filename) {
    // ✅ Se for GCS, NÃO validar localmente
    if (this.profilePhoto.storage === "gcs") {
      console.log(`✅ Foto no GCS, pulando validação local`);
      return next();
    }

    // Validar apenas fotos locais antigas
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

// Middleware para criptografar senha antes de salvar
userSchema.pre("save", async function (next) {
  // Apenas roda se o campo password foi modificado (ou é novo)
  if (!this.isModified("password")) {
    return next();
  }

  try {
    // 10 é o custo de salting recomendado
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    console.error("Erro ao criptografar senha:", error);
    next(error);
  }
});

// Middleware adicional para limpar dados de foto inválidos
userSchema.pre("save", function (next) {
  // Se há dados de foto mas o arquivo não existe, limpar os dados
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

userSchema.pre("save", function (next) {
  try {
    // Garantir que valores não sejam negativos
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

    // Sincronizar totalDonations com totalDonated
    this.totalDonations = this.totalDonated;

    // Atualizar level se necessário
    if (
      this.isModified("coins") ||
      this.isModified("totalDonated") ||
      this.isModified("xp") ||
      this.isNew
    ) {
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

// Método para comparar senha
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Erro ao comparar senhas");
  }
};

// Método para remover foto anterior
userSchema.methods.removeOldProfilePhoto = async function () {
  if (this.profilePhoto && this.profilePhoto.filename) {
    try {
      // 🆕 Se for GCS, deletar do GCS
      if (this.profilePhoto.storage === "gcs") {
        const gcsService = require("../services/gcsService");
        await gcsService.deleteImage(this.profilePhoto.filename);
        console.log(
          `🗑️  Foto antiga removida do GCS: ${this.profilePhoto.filename}`
        );
        return;
      }

      // Se for local, deletar do sistema de arquivos
      const fs = require("fs");
      const path = require("path");
      const oldPath = path.join(
        __dirname,
        "../uploads/profiles",
        this.profilePhoto.filename
      );

      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        console.log(`🗑️  Foto antiga removida: ${this.profilePhoto.filename}`);
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
          `⚠️  Arquivo local não encontrado para migração: ${this.profilePhoto.filename}`
        );
        return false;
      }

      // Ler arquivo local
      const imageBuffer = fs.readFileSync(localPath);

      // Fazer upload para GCS
      const uploadResult = await gcsService.uploadImage(
        imageBuffer,
        this.profilePhoto.filename,
        "image/webp"
      );

      if (uploadResult.success) {
        // Atualizar dados no banco
        this.profilePhoto.path = uploadResult.url;
        this.profilePhoto.storage = "gcs";
        this.profilePhoto.bucket = uploadResult.bucket;

        await this.save();

        // Deletar arquivo local após sucesso
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

// Método adicional para obter URL da foto com domínio completo
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

// Método para verificar se a foto existe no sistema de arquivos
userSchema.methods.profilePhotoExists = function () {
  if (!this.profilePhoto || !this.profilePhoto.filename) {
    return false;
  }

  // 🔧 CRÍTICO: Se estiver no GCS, assumir que existe (não validar localmente)
  if (this.profilePhoto.storage === "gcs") {
    return true; // ✅ GCS tem sua própria validação
  }

  // Validar apenas arquivos locais
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

// Método para calcular informações do nível
userSchema.methods.calculateLevelInfo = function () {
  const levels = [
    { name: "Iniciante", minXp: 0, maxXp: 199 },
    { name: "Explorador", minXp: 200, maxXp: 499 },
    { name: "Aventureiro", minXp: 500, maxXp: 999 },
    { name: "Benfeitor", minXp: 1000, maxXp: 4999 },
    { name: "Generoso", minXp: 5000, maxXp: 9999 },
    { name: "Filantropo", minXp: 10000, maxXp: 49999 },
    { name: "Magnata", minXp: 50000, maxXp: 99999 },
    { name: "Lenda", minXp: 100000, maxXp: 499999 },
    { name: "Mito", minXp: 500000, maxXp: 999999 },
    { name: "Divino", minXp: 1000000, maxXp: Infinity },
  ];

  return levels.find(
    (level) => this.xp >= level.minXp && this.xp <= level.maxXp
  );
};

// Método para calcular level baseado em múltiplos fatores
userSchema.methods.calculateLevel = function () {
  const donated = this.totalDonated || 0;
  const coins = this.coins || 0;
  const xp = this.xp || 0;

  // Sistema híbrido: XP + wealth total
  const totalWealth = coins + donated;
  const levelInfo = this.calculateLevelInfo();

  // Se XP define um nível mais alto que wealth, usar XP
  if (levelInfo && levelInfo.name !== "Iniciante") {
    return levelInfo.name;
  }

  // Senão, usar sistema baseado em wealth
  if (totalWealth >= 1000000) return "Divino";
  if (totalWealth >= 500000) return "Mito";
  if (totalWealth >= 100000) return "Lenda";
  if (totalWealth >= 50000) return "Magnata";
  if (totalWealth >= 25000) return "Mestre";
  if (totalWealth >= 10000) return "Filantropo";
  if (totalWealth >= 5000) return "Generoso";
  if (totalWealth >= 2000) return "Benfeitor";
  if (totalWealth >= 1000) return "Aventureiro";
  if (totalWealth >= 500) return "Explorador";

  return "Iniciante";
};

// Método para adicionar XP e verificar level up
userSchema.methods.addExperience = function (xpAmount) {
  const oldLevel = this.level;
  this.xp += xpAmount;

  const newLevelInfo = this.calculateLevelInfo();
  const newLevel = this.calculateLevel();

  if (newLevelInfo && newLevelInfo.maxXp !== Infinity) {
    this.maxXp = newLevelInfo.maxXp;
  }

  this.level = newLevel;

  return {
    levelUp: oldLevel !== newLevel,
    oldLevel: oldLevel,
    newLevel: newLevel,
    xpGained: xpAmount,
  };
};

// Método atualizado para processar doações
userSchema.methods.updateCoins = async function (amount, operation = "other") {
  if (!Number.isInteger(amount)) {
    throw new Error("Quantidade deve ser um número inteiro");
  }

  if (this.coins + amount < 0) {
    throw new Error("Saldo insuficiente para esta operação");
  }

  this.coins += amount;

  let xpGained = 0;
  let levelResult = { levelUp: false };

  if (operation === "donation" && amount < 0) {
    const donatedAmount = Math.abs(amount);
    this.totalDonated += donatedAmount;
    this.totalDonations += donatedAmount; // Sincronização
    this.stats.donationsSent += 1;
    this.stats.totalDonated = this.totalDonated;
    this.stats.lastDonationAt = new Date();

    // XP por doação: 1 XP por moeda doada
    xpGained = donatedAmount;
    levelResult = this.addExperience(xpGained);

    // Score por doação
    this.score += Math.floor(donatedAmount * 1.5);
  } else if (operation === "received" && amount > 0) {
    this.totalReceived += amount;
    this.stats.donationsReceived += 1;
    this.stats.totalReceived = this.totalReceived;
    this.stats.lastReceivedAt = new Date();

    // XP menor para quem recebe: 0.5 XP por moeda
    xpGained = Math.floor(amount * 0.5);
    levelResult = this.addExperience(xpGained);

    // Score por recebimento
    this.score += Math.floor(amount * 0.8);
  }

  await this.save();

  return {
    success: true,
    newBalance: this.coins,
    xpGained: xpGained,
    levelUp: levelResult.levelUp,
    oldLevel: levelResult.oldLevel,
    newLevel: levelResult.newLevel || this.level,
  };
};

// Método para verificar se tem saldo suficiente
userSchema.methods.hasEnoughCoins = function (amount) {
  return this.coins >= amount;
};

// Método para verificar se pode doar
userSchema.methods.canDonate = function (amount) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if (this.status !== "active" || !this.isActive) return false;
  if (this.coins < amount) return false;

  const maxAmount = this.settings.maxDonationAmount || 10000;
  if (amount > maxAmount) return false;

  return true;
};

// Método para processar doação (compatibilidade)
userSchema.methods.processDonation = async function (amount, toUserId) {
  return await this.updateCoins(-amount, "donation");
};

// Método para receber doação (compatibilidade)
userSchema.methods.receiveDonation = async function (amount, fromUserId) {
  return await this.updateCoins(amount, "received");
};

// Método para obter total de doações do dia
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

// Método para validar integridade dos dados
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

// Método para obter dados públicos
userSchema.methods.getPublicData = function () {
  return {
    id: this._id,
    fullName: this.fullName || this.name,
    name: this.name,
    username: this.username,
    email: this.email,
    avatar: this.avatar, // 👤 Emoji para fallback no frontend
    profilePhotoUrl: this.profilePhotoUrl, // ✅ NULL ou URL válida do GCS
    institution: this.institution,
    coins: this.coins,
    balance: this.coins, // Alias
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

// Ranking de usuários
userSchema.statics.getRanking = function (limit = 100, skip = 0) {
  return this.find({ status: "active", isActive: true })
    .sort({ score: -1, totalDonated: -1, coins: -1, name: 1 })
    .select(
      "name username fullName avatar profilePhotoUrl institution coins level xp score totalDonated totalReceived totalDonations stats createdAt"
    )
    .limit(Math.min(limit, 1000))
    .skip(Math.max(0, skip));
};

// Método para obter posição no ranking
userSchema.statics.getUserRank = async function (userId) {
  const user = await this.findById(userId);
  if (!user) return null;

  const rank = await this.countDocuments({
    isActive: true,
    status: "active",
    $or: [
      { score: { $gt: user.score } },
      { score: user.score, totalDonated: { $gt: user.totalDonated } },
      {
        score: user.score,
        totalDonated: user.totalDonated,
        coins: { $gt: user.coins },
      },
    ],
  });

  return rank + 1;
};

// Buscar usuários
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
    .sort({ score: -1, coins: -1, totalDonated: -1, name: 1 })
    .limit(Math.min(limit, 100))
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
      if (user.xp < 0) {
        user.xp = 0;
        needsUpdate = true;
      }
      if (user.score < 0) {
        user.score = 0;
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

      // Sincronizar totalDonations
      if (user.totalDonations !== user.totalDonated) {
        user.totalDonations = user.totalDonated;
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
