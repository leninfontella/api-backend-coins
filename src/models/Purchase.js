const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["completed", "pending", "cancelled", "processing"],
      default: "completed",
      index: true,
    },
    deliveryStatus: {
      type: String,
      enum: ["pending", "contacted", "in_transit", "delivered"],
      default: "pending",
    },
    deliveryInfo: {
      contactedAt: Date,
      deliveredAt: Date,
      notes: String,
    },
    metadata: {
      category: String,
      description: String,
      icon: String,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices compostos para queries otimizadas
purchaseSchema.index({ user: 1, createdAt: -1 });
purchaseSchema.index({ user: 1, status: 1 });
purchaseSchema.index({ createdAt: -1 });

// Virtual para formatação de data
purchaseSchema.virtual("formattedDate").get(function () {
  return this.createdAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

// Método para obter estatísticas de um usuário
purchaseSchema.statics.getUserStats = async function (userId) {
  const stats = await this.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId), status: "completed" } },
    {
      $group: {
        _id: null,
        totalPurchases: { $sum: 1 },
        totalSpent: { $sum: "$price" },
        avgPurchase: { $avg: "$price" },
      },
    },
  ]);

  return stats[0] || { totalPurchases: 0, totalSpent: 0, avgPurchase: 0 };
};

module.exports = mongoose.model("Purchase", purchaseSchema);
