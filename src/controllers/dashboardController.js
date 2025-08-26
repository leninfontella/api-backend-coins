const User = require("../models/User");
const Donation = require("../models/Donation");
const mongoose = require("mongoose");

// Obter dados do dashboard do usuário
exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentMonth = new Date();
    const startOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      0
    );

    // 1. Buscar dados básicos do usuário
    const user = await User.findById(userId).select(
      "name email coins totalDonated monthlyGoal"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // 2. Buscar doações do usuário (doadas e recebidas) no mês atual
    const [donationsGiven, donationsReceived, lastDonation, interactionStats] =
      await Promise.all([
        // Doações feitas pelo usuário no mês
        Donation.aggregate([
          {
            $match: {
              donor: new mongoose.Types.ObjectId(userId), // <-- CORREÇÃO AQUI
              createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalCount: { $sum: 1 },
            },
          },
        ]),

        // Doações recebidas pelo usuário no mês
        Donation.aggregate([
          {
            $match: {
              recipient: new mongoose.Types.ObjectId(userId), // <-- CORREÇÃO AQUI
              createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalCount: { $sum: 1 },
            },
          },
        ]),

        // Última doação feita pelo usuário
        Donation.findOne({
          donor: userId, // <-- CORREÇÃO AQUI
        })
          .sort({ createdAt: -1 })
          .populate("recipient", "name")
          .select("amount createdAt recipient"),

        // Estatísticas de interação - usuário que mais recebeu doações deste usuário
        Donation.aggregate([
          {
            $match: {
              donor: new mongoose.Types.ObjectId(userId), // <-- CORREÇÃO AQUI
              createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            },
          },
          {
            $group: {
              _id: "$recipient", // <-- CORREÇÃO AQUI
              interactionCount: { $sum: 1 },
              totalAmount: { $sum: "$amount" },
            },
          },
          {
            $sort: { interactionCount: -1 },
          },
          {
            $limit: 1,
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
              userName: "$userInfo.name",
            },
          },
        ]),
      ]);

    // 3. Processar dados das doações
    const monthlyDonated = donationsGiven[0]?.totalAmount || 0;
    const donatedCount = donationsGiven[0]?.totalCount || 0;
    const monthlyReceived = donationsReceived[0]?.totalAmount || 0;
    const receivedCount = donationsReceived[0]?.totalCount || 0;

    // 4. Processar dados da última doação
    let lastDonationData = {
      amount: 0,
      date: "Nenhuma doação ainda",
      toUser: null,
    };

    if (lastDonation) {
      const timeDiff = Date.now() - lastDonation.createdAt.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      let timeAgo;
      if (daysDiff === 0) {
        const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
        if (hoursDiff === 0) {
          const minutesDiff = Math.floor(timeDiff / (1000 * 60));
          timeAgo =
            minutesDiff <= 1 ? "agora mesmo" : `há ${minutesDiff} minutos`;
        } else {
          timeAgo = hoursDiff === 1 ? "há 1 hora" : `há ${hoursDiff} horas`;
        }
      } else if (daysDiff === 1) {
        timeAgo = "ontem";
      } else {
        timeAgo = `há ${daysDiff} dias`;
      }

      lastDonationData = {
        amount: lastDonation.amount,
        date: timeAgo,
        toUser: lastDonation.toUser?.name || "Usuário removido",
      };
    }

    // 5. Processar dados de interação
    let topInteractionData = {
      userName: "Nenhuma interação ainda",
      interactionCount: 0,
      totalAmount: 0,
    };

    if (interactionStats.length > 0) {
      topInteractionData = {
        userName: interactionStats[0].userName,
        interactionCount: interactionStats[0].interactionCount,
        totalAmount: interactionStats[0].totalAmount,
      };
    }

    // 6. Buscar meta atual do usuário
    const userGoal = user.monthlyGoal; // respeita default=500 do schema

    // 7. Montar resposta
    const dashboardData = {
      user: {
        name: user.name,
        email: user.email,
        coins: user.coins,
        totalDonated: user.totalDonated || 0,
      },
      monthlyStats: {
        donated: {
          amount: monthlyDonated,
          count: donatedCount,
        },
        received: {
          amount: monthlyReceived,
          count: receivedCount,
        },
      },
      lastDonation: lastDonationData,
      topInteraction: topInteractionData,
      goal: {
        target: userGoal,
        current: monthlyDonated,
        progress: Math.min((monthlyDonated / userGoal) * 100, 100),
      },
      period: {
        month: currentMonth.getMonth() + 1,
        year: currentMonth.getFullYear(),
        startDate: startOfMonth,
        endDate: endOfMonth,
      },
    };

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    console.error("Erro ao buscar dados do dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar dados do dashboard",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Atualizar meta mensal do usuário
exports.updateMonthlyGoal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { goalAmount } = req.body;

    // Validação
    if (!goalAmount || goalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Meta deve ser um valor positivo",
      });
    }

    if (goalAmount > 10000) {
      return res.status(400).json({
        success: false,
        message: "Meta muito alta. Máximo permitido: 10.000 moedas",
      });
    }

    // Atualizar usuário
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { monthlyGoal: goalAmount },
      { new: true }
    ).select("monthlyGoal name");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    res.json({
      success: true,
      message: "Meta atualizada com sucesso",
      data: {
        monthlyGoal: updatedUser.monthlyGoal,
        userName: updatedUser.name,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar meta:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao atualizar meta",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Buscar estatísticas detalhadas de interações
exports.getDetailedInteractions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = "month", limit = 5 } = req.query;

    let startDate;
    const currentDate = new Date();

    switch (period) {
      case "week":
        startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          1
        );
        break;
      case "year":
        startDate = new Date(currentDate.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          1
        );
    }

    const interactionStats = await Donation.aggregate([
      {
        $match: {
          fromUser: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate, $lte: currentDate },
        },
      },
      {
        $group: {
          _id: "$toUser",
          interactionCount: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          lastInteraction: { $max: "$createdAt" },
        },
      },
      {
        $sort: { interactionCount: -1 },
      },
      {
        $limit: parseInt(limit),
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
          userEmail: "$userInfo.email",
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        period,
        interactions: interactionStats,
        total: interactionStats.length,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar interações detalhadas:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor ao buscar interações",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
