// src/services/donationService.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Donation = require("../models/Donation");
const Notification = require("../models/Notification");

class DonationService {
  /**
   * Processa uma doação com todas as validações
   */
  async processDonation(
    donorId,
    recipientId,
    amount,
    message = "",
    metadata = {}
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validações básicas
      if (donorId.toString() === recipientId.toString()) {
        throw new Error("Não é possível doar para si mesmo");
      }

      if (amount <= 0 || amount > 100000) {
        throw new Error("Valor inválido para doação");
      }

      // Buscar usuários
      const [donor, recipient] = await Promise.all([
        User.findById(donorId).session(session),
        User.findById(recipientId).session(session),
      ]);

      if (!donor || donor.status !== "active") {
        throw new Error("Doador não encontrado ou inativo");
      }

      if (!recipient || recipient.status !== "active") {
        throw new Error("Destinatário não encontrado ou inativo");
      }

      // Verificar se não está bloqueado
      if (donor.isBlocked(recipientId) || recipient.isBlocked(donorId)) {
        throw new Error("Não é possível realizar doação para este usuário");
      }

      // Verificar saldo
      if (!donor.canDonate(amount)) {
        throw new Error("Saldo insuficiente");
      }

      // Verificar limite diário
      const dailyTotal = await donor.getDailyDonationTotal();
      const dailyLimit = donor.settings.dailyDonationLimit || 50000;

      if (dailyTotal + amount > dailyLimit) {
        throw new Error(
          `Limite diário excedido. Limite: ${dailyLimit}, já usado: ${dailyTotal}`
        );
      }

      // Verificar limite por transação
      const maxAmount = donor.settings.maxDonationAmount || 10000;
      if (amount > maxAmount) {
        throw new Error(`Valor excede limite por transação: ${maxAmount}`);
      }

      // Processar a transação
      const startTime = Date.now();

      // Atualizar saldos
      donor.coins -= amount;
      recipient.coins += amount;

      // Salvar usuários
      await Promise.all([donor.save({ session }), recipient.save({ session })]);

      // Criar registro da doação
      const donation = new Donation({
        donor: donorId,
        recipient: recipientId,
        amount,
        message,
        status: "completed",
        metadata: {
          ...metadata,
          processingTime: Date.now() - startTime,
        },
      });

      await donation.save({ session });

      // Commit da transação
      await session.commitTransaction();

      // Buscar doação populada para retorno
      const populatedDonation = await Donation.findById(donation._id)
        .populate("donor", "name username avatar")
        .populate("recipient", "name username avatar");

      return {
        success: true,
        donation: populatedDonation,
        message: "Doação processada com sucesso",
      };
    } catch (error) {
      await session.abortTransaction();

      // Registrar doação falhada
      try {
        await new Donation({
          donor: donorId,
          recipient: recipientId,
          amount,
          message,
          status: "failed",
          metadata: {
            ...metadata,
            failureReason: error.message,
          },
        }).save();
      } catch (logError) {
        console.error("Erro ao registrar doação falhada:", logError);
      }

      return {
        success: false,
        error: error.message,
      };
    } finally {
      session.endSession();
    }
  }

  /**
   * Busca histórico de doações do usuário
   */
  async getUserDonationHistory(userId, options = {}) {
    const { type = "all", page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const donations = await Donation.getUserDonationHistory(userId, {
      type,
      limit: parseInt(limit),
      skip,
    });

    const total = await Donation.countDocuments(
      type === "all"
        ? { $or: [{ donor: userId }, { recipient: userId }] }
        : type === "sent"
        ? { donor: userId }
        : { recipient: userId }
    );

    return {
      donations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtém estatísticas de doação do usuário
   */
  async getUserDonationStats(userId) {
    const user = await User.findById(userId).select("stats coins level");
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    // Estatísticas detalhadas por período
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    const [monthlyStats, weeklyStats] = await Promise.all([
      this.getDonationStatsForPeriod(userId, startOfMonth),
      this.getDonationStatsForPeriod(userId, startOfWeek),
    ]);

    return {
      user: {
        coins: user.coins,
        level: user.level,
        ...user.stats.toObject(),
      },
      monthly: monthlyStats,
      weekly: weeklyStats,
    };
  }

  /**
   * Estatísticas de doação por período
   */
  async getDonationStatsForPeriod(userId, startDate) {
    const endDate = new Date();

    const [sent, received] = await Promise.all([
      Donation.aggregate([
        {
          $match: {
            donor: new mongoose.Types.ObjectId(userId),
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$amount" },
            avg: { $avg: "$amount" },
          },
        },
      ]),
      Donation.aggregate([
        {
          $match: {
            recipient: new mongoose.Types.ObjectId(userId),
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$amount" },
            avg: { $avg: "$amount" },
          },
        },
      ]),
    ]);

    return {
      sent: sent[0] || { count: 0, total: 0, avg: 0 },
      received: received[0] || { count: 0, total: 0, avg: 0 },
    };
  }

  /**
   * Ranking geral de usuários
   */
  async getUserRanking(page = 1, limit = 100) {
    const skip = (page - 1) * limit;

    const users = await User.getRanking(limit, skip);
    const total = await User.countDocuments({ status: "active" });

    // Adicionar posição no ranking
    const usersWithRank = users.map((user, index) => ({
      ...user.toObject(),
      rank: skip + index + 1,
    }));

    return {
      users: usersWithRank,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Buscar usuários
   */
  async searchUsers(query, currentUserId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const users = await User.searchUsers(query, currentUserId, { limit, skip });

    return {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * Cancelar doação pendente
   */
  async cancelDonation(donationId, userId) {
    const donation = await Donation.findById(donationId);

    if (!donation) {
      throw new Error("Doação não encontrada");
    }

    if (donation.donor.toString() !== userId.toString()) {
      throw new Error("Apenas o doador pode cancelar a doação");
    }

    if (donation.status !== "pending") {
      throw new Error("Apenas doações pendentes podem ser canceladas");
    }

    donation.status = "cancelled";
    await donation.save();

    return donation;
  }

  /**
   * Estatísticas globais do sistema
   */
  async getGlobalStats() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [todayStats, yesterdayStats, totalStats] = await Promise.all([
      Donation.getDailyStats(today),
      Donation.getDailyStats(yesterday),
      this.getTotalSystemStats(),
    ]);

    return {
      today: todayStats[0] || this.getEmptyStats(),
      yesterday: yesterdayStats[0] || this.getEmptyStats(),
      total: totalStats,
    };
  }

  /**
   * Estatísticas totais do sistema
   */
  async getTotalSystemStats() {
    const [donationStats, userStats] = await Promise.all([
      Donation.aggregate([
        {
          $match: { status: "completed" },
        },
        {
          $group: {
            _id: null,
            totalDonations: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            avgAmount: { $avg: "$amount" },
          },
        },
      ]),
      User.aggregate([
        {
          $match: { status: "active" },
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalCoins: { $sum: "$coins" },
            avgCoins: { $avg: "$coins" },
          },
        },
      ]),
    ]);

    return {
      ...(donationStats[0] || this.getEmptyStats()),
      ...(userStats[0] || { totalUsers: 0, totalCoins: 0, avgCoins: 0 }),
    };
  }

  /**
   * Retorna objeto de estatísticas vazio
   */
  getEmptyStats() {
    return {
      totalDonations: 0,
      totalAmount: 0,
      avgAmount: 0,
      uniqueDonors: 0,
      uniqueRecipients: 0,
    };
  }

  /**
   * Verificar se usuário pode receber doações
   */
  async canReceiveDonation(userId, donorId) {
    const user = await User.findById(userId);

    if (!user || user.status !== "active") {
      return { can: false, reason: "Usuário não encontrado ou inativo" };
    }

    if (user.settings.donationPrivacy === "private") {
      return { can: false, reason: "Usuário não aceita doações" };
    }

    if (user.isBlocked(donorId)) {
      return { can: false, reason: "Você foi bloqueado por este usuário" };
    }

    return { can: true };
  }

  /**
   * Obter doações recentes para feed
   */
  async getRecentDonations(limit = 20, skip = 0) {
    return await Donation.find({
      status: "completed",
      // Apenas doações públicas
      $expr: {
        $eq: [{ $ifNull: ["$donorInfo.privacy", "public"] }, "public"],
      },
    })
      .populate("donor", "name username avatar settings.donationPrivacy")
      .populate("recipient", "name username avatar")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select("-message"); // Remover mensagens por privacidade
  }

  /**
   * Top doadores do período
   */
  async getTopDonors(period = "month", limit = 10) {
    const startDate = this.getPeriodStartDate(period);

    return await Donation.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$donor",
          totalDonated: { $sum: "$amount" },
          donationCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $match: {
          "user.status": "active",
          "user.settings.donationPrivacy": { $ne: "private" },
        },
      },
      {
        $project: {
          _id: 0,
          user: {
            id: "$user._id",
            name: "$user.name",
            username: "$user.username",
            avatar: "$user.avatar",
            level: "$user.level",
          },
          totalDonated: 1,
          donationCount: 1,
        },
      },
      {
        $sort: { totalDonated: -1 },
      },
      {
        $limit: limit,
      },
    ]);
  }

  /**
   * Usuários mais ativos (que mais receberam)
   */
  async getTopRecipients(period = "month", limit = 10) {
    const startDate = this.getPeriodStartDate(period);

    return await Donation.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$recipient",
          totalReceived: { $sum: "$amount" },
          donationCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $match: {
          "user.status": "active",
        },
      },
      {
        $project: {
          _id: 0,
          user: {
            id: "$user._id",
            name: "$user.name",
            username: "$user.username",
            avatar: "$user.avatar",
            level: "$user.level",
          },
          totalReceived: 1,
          donationCount: 1,
        },
      },
      {
        $sort: { totalReceived: -1 },
      },
      {
        $limit: limit,
      },
    ]);
  }

  /**
   * Helper para obter data de início do período
   */
  getPeriodStartDate(period) {
    const now = new Date();

    switch (period) {
      case "day":
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case "week":
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return startOfWeek;
      case "month":
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case "year":
        return new Date(now.getFullYear(), 0, 1);
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  /**
   * Validar dados de doação
   */
  validateDonationData(donorId, recipientId, amount, message) {
    const errors = [];

    if (!donorId) {
      errors.push("ID do doador é obrigatório");
    }

    if (!recipientId) {
      errors.push("ID do destinatário é obrigatório");
    }

    if (donorId === recipientId) {
      errors.push("Não é possível doar para si mesmo");
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      errors.push("Valor da doação deve ser maior que zero");
    }

    if (amount > 100000) {
      errors.push("Valor da doação não pode exceder 100.000 moedas");
    }

    if (message && message.length > 500) {
      errors.push("Mensagem não pode exceder 500 caracteres");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new DonationService();
