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

    // ========== SISTEMA DE MOEDAS - NOVOS CAMPOS ==========
    coins: {
      type: Number,
      default: 100, // Saldo inicial de 100 moedas
      min: [0, "Saldo não pode ser negativo"],
    },

    // Campos para estatísticas (opcional - para futuro)
    level: {
      type: String,
      enum: [
        "Doador Iniciante",
        "Doador Bronze",
        "Doador Prata",
        "Doador Ouro",
        "Doador Platina",
      ],
      default: "Doador Iniciante",
    },

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
  },
  { timestamps: true }
);

// Middleware para hash da senha (mantido original)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar senha (mantido original)
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ========== NOVOS MÉTODOS PARA SISTEMA DE MOEDAS ==========

// Método para atualizar saldo e estatísticas
userSchema.methods.updateCoins = async function (amount, operation = "other") {
  // Atualizar saldo
  this.coins += amount;

  // Atualizar estatísticas baseado na operação
  if (operation === "donation" && amount < 0) {
    this.totalDonated += Math.abs(amount);
  } else if (operation === "received" && amount > 0) {
    this.totalReceived += amount;
  }

  // Atualizar level baseado no total doado
  this.updateLevel();

  return await this.save();
};

// Método para atualizar level baseado nas doações
userSchema.methods.updateLevel = function () {
  if (this.totalDonated >= 5000) {
    this.level = "Doador Platina";
  } else if (this.totalDonated >= 2000) {
    this.level = "Doador Ouro";
  } else if (this.totalDonated >= 1000) {
    this.level = "Doador Prata";
  } else if (this.totalDonated >= 500) {
    this.level = "Doador Bronze";
  } else {
    this.level = "Doador Iniciante";
  }
};

// Método para verificar se tem saldo suficiente
userSchema.methods.hasEnoughCoins = function (amount) {
  return this.coins >= amount;
};

// Método para obter dados públicos (sem senha)
userSchema.methods.getPublicData = function () {
  return {
    id: this._id,
    fullName: this.fullName || this.name,
    name: this.name,
    email: this.email,
    coins: this.coins,
    level: this.level,
    totalDonated: this.totalDonated,
    totalReceived: this.totalReceived,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("User", userSchema);
