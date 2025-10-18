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
      if (donor.isBlocked && donor.isBlocked(recipientId)) {
        throw new Error("Não é possível realizar doação para este usuário");
      }

      if (recipient.isBlocked && recipient.isBlocked(donorId)) {
        throw new Error("Não é possível realizar doação para este usuário");
      }

      // Verificar saldo
      if (donor.coins < amount) {
        throw new Error("Saldo insuficiente");
      }

      // Verificar limite diário
      const dailyTotal = await this.getDailyDonationTotal(donorId);
      const dailyLimit = donor.settings?.dailyDonationLimit || 50000;

      if (dailyTotal + amount > dailyLimit) {
        throw new Error(
          `Limite diário excedido. Limite: ${dailyLimit}, já usado: ${dailyTotal}`
        );
      }

      // Verificar limite por transação
      const maxAmount = donor.settings?.maxDonationAmount || 10000;
      if (amount > maxAmount) {
        throw new Error(`Valor excede limite por transação: ${maxAmount}`);
      }

      // Processar a transação
      const startTime = Date.now();

      // Atualizar saldos
      donor.coins -= amount;
      recipient.coins += amount;

      // Atualizar estatísticas
      if (!donor.totalDonated) donor.totalDonated = 0;
      if (!recipient.totalReceived) recipient.totalReceived = 0;

      donor.totalDonated += amount;
      recipient.totalReceived += amount;

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
        .populate("donor", "name fullName username avatar")
        .populate("recipient", "name fullName username avatar");

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
   * Buscar usuários para doação
   */
  static async searchUsers(query, currentUserId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    if (!query || query.trim().length < 2) {
      throw new Error("Query deve ter pelo menos 2 caracteres");
    }

    const sanitizedQuery = query
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\    const totalResults = await User");
    const searchRegex = new RegExp(sanitizedQuery, "i");

    // 🔧 CORREÇÃO: Incluir profilePhoto no select
    const users = await User.find({
      $and: [
        { _id: { $ne: currentUserId } },
        { status: "active" },
        {
          $or: [
            { name: searchRegex },
            { fullName: searchRegex },
            { username: searchRegex },
            { email: searchRegex },
          ],
        },
      ],
    })
      .select(
        "name fullName username email avatar coins level totalDonated totalReceived createdAt profilePhoto" // 🔧 NOVO
      )
      .limit(limit)
      .skip(skip)
      .sort({ name: 1 });

    const totalResults = await User.countDocuments({
      $and: [
        { _id: { $ne: currentUserId } },
        { status: "active" },
        {
          $or: [
            { name: searchRegex },
            { fullName: searchRegex },
            { username: searchRegex },
            { email: searchRegex },
          ],
        },
      ],
    });

    // 🔧 CORREÇÃO: Incluir profilePhotoUrl
    const formattedUsers = users.map((user) => ({
      id: user._id.toString(),
      name: user.fullName || user.name || "Usuário Anônimo",
      fullName: user.fullName || user.name,
      displayName: user.fullName || user.name,
      username: user.username || user.email || "sem-username",
      email: user.email,
      avatar: user.avatar || "👤",
      profilePhotoUrl: user.profilePhotoUrl, // 🔧 NOVO (virtual do modelo)
      coins: user.coins || 0,
      level: user.level || 1,
      levelText: `Nível ${user.level || 1}`,
      totalDonated: user.totalDonated || 0,
      totalReceived: user.totalReceived || 0,
      joinDate: user.createdAt
        ? user.createdAt.toISOString().split("T")[0]
        : null,
    }));

    return {
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total: totalResults,
        pages: Math.ceil(totalResults / limit),
        hasNext: skip + limit < totalResults,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Obter histórico de doações do usuário
   */
  async getUserDonationHistory(userId, options = {}) {
    const { type = "all", page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

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

    query.status = "completed";

    const donations = await Donation.find(query)
      .populate("donor", "name fullName username avatar profilePhoto")
      .populate("recipient", "name fullName username avatar profilePhoto")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Donation.countDocuments(query);

    // 🔧 CORREÇÃO: Processar donations tratando usuários excluídos
    const processedDonations = donations.map((donation) => {
      const donationObj = donation.toObject ? donation.toObject() : donation;

      // Verificar se usuários foram excluídos
      const isDonorDeleted =
        donation.donorDeleted ||
        !donation.donor ||
        donation.donor._id === "deleted";

      const isRecipientDeleted =
        donation.recipientDeleted ||
        !donation.recipient ||
        donation.recipient._id === "deleted";

      // Criar dados do donor com fallback
      const donorData = isDonorDeleted
        ? {
            _id: "deleted",
            name:
              donation.donorSnapshot?.fullName ||
              donation.donorSnapshot?.name ||
              "Usuário Excluído",
            fullName:
              donation.donorSnapshot?.fullName ||
              donation.donorSnapshot?.name ||
              "Usuário Excluído",
            username: donation.donorSnapshot?.username || null,
            avatar: donation.donorSnapshot?.avatar || "🔒",
            profilePhotoUrl: donation.donorSnapshot?.profilePhotoUrl || null,
          }
        : {
            _id: donation.donor._id,
            name: donation.donor.fullName || donation.donor.name,
            fullName: donation.donor.fullName || donation.donor.name,
            username: donation.donor.username,
            avatar: donation.donor.avatar || "👤",
            profilePhotoUrl: donation.donor.profilePhotoUrl,
          };

      // Criar dados do recipient com fallback
      const recipientData = isRecipientDeleted
        ? {
            _id: "deleted",
            name:
              donation.recipientSnapshot?.fullName ||
              donation.recipientSnapshot?.name ||
              "Usuário Excluído",
            fullName:
              donation.recipientSnapshot?.fullName ||
              donation.recipientSnapshot?.name ||
              "Usuário Excluído",
            username: donation.recipientSnapshot?.username || null,
            avatar: donation.recipientSnapshot?.avatar || "🔒",
            profilePhotoUrl:
              donation.recipientSnapshot?.profilePhotoUrl || null,
          }
        : {
            _id: donation.recipient._id,
            name: donation.recipient.fullName || donation.recipient.name,
            fullName: donation.recipient.fullName || donation.recipient.name,
            username: donation.recipient.username,
            avatar: donation.recipient.avatar || "👤",
            profilePhotoUrl: donation.recipient.profilePhotoUrl,
          };

      return {
        ...donationObj,
        donorDeleted: isDonorDeleted,
        recipientDeleted: isRecipientDeleted,
        donor: donorData,
        recipient: recipientData,
        donorInfo: {
          ...donationObj.donorInfo,
          name: donorData.name,
          fullName: donorData.fullName,
          avatar: donorData.avatar,
          username: donorData.username,
          profilePhotoUrl: donorData.profilePhotoUrl,
        },
        recipientInfo: {
          ...donationObj.recipientInfo,
          name: recipientData.name,
          fullName: recipientData.fullName,
          avatar: recipientData.avatar,
          username: recipientData.username,
          profilePhotoUrl: recipientData.profilePhotoUrl,
        },
      };
    });

    return {
      donations: processedDonations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Obter estatísticas de doação do usuário
   */
  async getUserDonationStats(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    // Estatísticas agregadas das doações
    const [sentStats, receivedStats, todayStats] = await Promise.all([
      Donation.aggregate([
        { $match: { donor: user._id, status: "completed" } },
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
        { $match: { recipient: user._id, status: "completed" } },
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
            $or: [{ donor: user._id }, { recipient: user._id }],
            status: "completed",
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Estatísticas por período
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    const [monthlyStats, weeklyStats] = await Promise.all([
      this.getDonationStatsForPeriod(userId, startOfMonth),
      this.getDonationStatsForPeriod(userId, startOfWeek),
    ]);

    return {
      userId: user._id,
      donationsSent: sentStats[0]?.count || 0,
      totalDonated: sentStats[0]?.total || 0,
      avgDonationSent: Math.round(sentStats[0]?.avg || 0),

      donationsReceived: receivedStats[0]?.count || 0,
      totalReceived: receivedStats[0]?.total || 0,
      avgDonationReceived: Math.round(receivedStats[0]?.avg || 0),

      todayActivity: todayStats[0]?.count || 0,
      totalTransactions:
        (sentStats[0]?.count || 0) + (receivedStats[0]?.count || 0),

      currentBalance: user.coins,
      level: user.level,
      joinDate: user.createdAt,

      // Estatísticas por período
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
   * Obter ranking de usuários
   */
  async getUserRanking(page = 1, limit = 100) {
    const skip = (page - 1) * limit;

    const users = await User.find({ status: "active" })
      .select(
        "name fullName username avatar coins level totalDonated totalReceived"
      )
      .sort({ coins: -1, totalDonated: -1, name: 1 })
      .limit(limit)
      .skip(skip);

    const total = await User.countDocuments({ status: "active" });

    const formattedUsers = users.map((user, index) => ({
      position: skip + index + 1,
      id: user._id,
      name: user.fullName || user.name,
      username: user.username,
      avatar: user.avatar || "👤",
      coins: user.coins,
      level: user.level,
      totalDonated: user.totalDonated || 0,
      totalReceived: user.totalReceived || 0,
    }));

    return {
      users: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Verificar se pode receber doação
   */
  async canReceiveDonation(recipientId, donorId) {
    const [recipient, donor] = await Promise.all([
      User.findById(recipientId),
      User.findById(donorId),
    ]);

    if (!recipient || !donor) {
      return {
        canDonate: false,
        reason: "Usuário não encontrado",
      };
    }

    if (recipient.status !== "active") {
      return {
        canDonate: false,
        reason: "Usuário destinatário não está ativo",
      };
    }

    if (donor.isBlocked && donor.isBlocked(recipientId)) {
      return {
        canDonate: false,
        reason: "Usuário bloqueado",
      };
    }

    if (recipient.isBlocked && recipient.isBlocked(donorId)) {
      return {
        canDonate: false,
        reason: "Você foi bloqueado por este usuário",
      };
    }

    if (recipient.settings?.donationPrivacy === "private") {
      return {
        canDonate: false,
        reason: "Usuário não aceita doações",
      };
    }

    return {
      canDonate: true,
      recipient: {
        id: recipient._id,
        name: recipient.fullName || recipient.name,
        avatar: recipient.avatar,
        level: recipient.level,
      },
    };
  }

  /**
   * Obter doações recentes (feed público)
   */
  async getRecentDonations(limit = 20, skip = 0) {
    const donations = await Donation.find({
      status: "completed",
      $expr: {
        $eq: [{ $ifNull: ["$donorInfo.privacy", "public"] }, "public"],
      },
    })
      .populate("donor", "name fullName username avatar settings profilePhoto")
      .populate("recipient", "name fullName username avatar profilePhoto")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    // 🔧 CORREÇÃO: Tratar usuários excluídos
    return donations.map((donation) => {
      // Verificar se usuários foram excluídos
      const isDonorDeleted =
        donation.donorDeleted ||
        !donation.donor ||
        donation.donor._id === "deleted";

      const isRecipientDeleted =
        donation.recipientDeleted ||
        !donation.recipient ||
        donation.recipient._id === "deleted";

      // Dados do donor com fallback
      const donorData = isDonorDeleted
        ? {
            _id: "deleted",
            name:
              donation.donorSnapshot?.fullName ||
              donation.donorSnapshot?.name ||
              "Usuário Excluído",
            username: donation.donorSnapshot?.username || null,
            avatar: donation.donorSnapshot?.avatar || "🔒",
            profilePhotoUrl: donation.donorSnapshot?.profilePhotoUrl || null,
          }
        : {
            _id: donation.donor._id,
            name: donation.donor.fullName || donation.donor.name,
            username: donation.donor.username,
            avatar: donation.donor.avatar || "👤",
            profilePhotoUrl: donation.donor.profilePhotoUrl,
          };

      // Dados do recipient com fallback
      const recipientData = isRecipientDeleted
        ? {
            _id: "deleted",
            name:
              donation.recipientSnapshot?.fullName ||
              donation.recipientSnapshot?.name ||
              "Usuário Excluído",
            username: donation.recipientSnapshot?.username || null,
            avatar: donation.recipientSnapshot?.avatar || "🔒",
            profilePhotoUrl:
              donation.recipientSnapshot?.profilePhotoUrl || null,
          }
        : {
            _id: donation.recipient._id,
            name: donation.recipient.fullName || donation.recipient.name,
            username: donation.recipient.username,
            avatar: donation.recipient.avatar || "👤",
            profilePhotoUrl: donation.recipient.profilePhotoUrl,
          };

      return {
        _id: donation._id,
        amount: donation.amount,
        message: donation.message,
        createdAt: donation.createdAt,
        donorDeleted: isDonorDeleted,
        recipientDeleted: isRecipientDeleted,
        donor: donorData,
        recipient: recipientData,
        donorInfo: donorData,
        recipientInfo: recipientData,
      };
    });
  }

  /**
   * Obter estatísticas globais
   */
  async getGlobalStats() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [totalStats, todayStats, userStats] = await Promise.all([
      Donation.aggregate([
        { $match: { status: "completed" } },
        {
          $group: {
            _id: null,
            totalDonations: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            avgAmount: { $avg: "$amount" },
          },
        },
      ]),
      Donation.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        },
        {
          $group: {
            _id: null,
            todayDonations: { $sum: 1 },
            todayAmount: { $sum: "$amount" },
          },
        },
      ]),
      User.aggregate([
        { $match: { status: "active" } },
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
      totalDonations: totalStats[0]?.totalDonations || 0,
      totalAmount: totalStats[0]?.totalAmount || 0,
      avgDonation: Math.round(totalStats[0]?.avgAmount || 0),
      todayDonations: todayStats[0]?.todayDonations || 0,
      todayAmount: todayStats[0]?.todayAmount || 0,
      totalUsers: userStats[0]?.totalUsers || 0,
      totalCoins: userStats[0]?.totalCoins || 0,
      avgCoins: Math.round(userStats[0]?.avgCoins || 0),
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
   * Top doadores do período
   */
  async getTopDonors(period = "month", limit = 10) {
    const startDate = this.getPeriodStartDate(period);

    return await Donation.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate },
          // 🔧 NOVO: Excluir doações de usuários deletados
          donorDeleted: { $ne: true },
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
            name: { $ifNull: ["$user.fullName", "$user.name"] },
            username: "$user.username",
            avatar: "$user.avatar",
            level: "$user.level",
            // 🔧 NOVO: Incluir profilePhoto para virtual
            profilePhoto: "$user.profilePhoto",
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
          // 🔧 NOVO: Excluir doações de usuários deletados
          recipientDeleted: { $ne: true },
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
            name: { $ifNull: ["$user.fullName", "$user.name"] },
            username: "$user.username",
            avatar: "$user.avatar",
            level: "$user.level",
            // 🔧 NOVO: Incluir profilePhoto
            profilePhoto: "$user.profilePhoto",
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
   * Obter total de doações diárias do usuário
   */
  async getDailyDonationTotal(userId) {
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date().setHours(23, 59, 59, 999));

    const result = await Donation.aggregate([
      {
        $match: {
          donor: new mongoose.Types.ObjectId(userId),
          status: "completed",
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    return result[0]?.total || 0;
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
}

module.exports = new DonationService();
