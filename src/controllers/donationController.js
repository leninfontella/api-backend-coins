// src/controllers/donationController.js
const donationService = require("../services/donationService");
const User = require("../models/User");
const Donation = require("../models/Donation");

class DonationController {
  /**
   * Criar nova doação
   */

  /**
   * Obter doações recebidas desde um timestamp
   */
  async getReceivedDonations(req, res) {
    try {
      const userId = req.user.id;
      const { since } = req.query;

      const filter = { recipient: userId };
      if (since) {
        filter.createdAt = { $gt: new Date(parseInt(since)) };
      }

      const donations = await Donation.find(filter)
        .populate("donor", "name username avatar")
        .sort({ createdAt: -1 })
        .limit(50);

      res.json({
        success: true,
        data: donations.map((d) => ({
          donorName: d.donor?.name || "Anônimo",
          amount: d.amount,
          message: d.message,
          timestamp: d.createdAt,
        })),
      });
    } catch (error) {
      console.error("Erro ao obter doações recebidas:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter doações recebidas",
      });
    }
  }

  async createDonation(req, res) {
    try {
      const donorId = req.user.id;
      const { recipientId, amount, message } = req.body;

      // 1. Validar dados de entrada
      const parsedAmount = parseInt(amount);

      if (parsedAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "O valor da doação deve ser maior que zero.",
        });
      }

      // 2. Obter os usuários do doador e do receptor
      const [donorUser, recipientUser] = await Promise.all([
        User.findById(donorId),
        User.findById(recipientId),
      ]);

      if (!donorUser || !recipientUser) {
        return res.status(404).json({
          success: false,
          message: "Doador ou destinatário não encontrado.",
        });
      }

      // 3. Verificar se o doador tem saldo suficiente usando o método do modelo User
      if (!donorUser.hasEnoughCoins(parsedAmount)) {
        return res.status(400).json({
          success: false,
          message: "Saldo insuficiente para a doação.",
        });
      }

      // 4. Criar a doação no banco de dados (o status é 'completed' pois a lógica de transação é tratada aqui)
      const newDonation = new Donation({
        donor: donorUser._id,
        recipient: recipientUser._id,
        amount: parsedAmount,
        message: message || "",
        status: "completed",
        donorInfo: {
          name: donorUser.name,
          username: donorUser.username,
          avatar: donorUser.avatar,
        },
        recipientInfo: {
          name: recipientUser.name,
          username: recipientUser.username,
          avatar: recipientUser.avatar,
        },
      });
      await newDonation.save();

      // 5. USAR OS MÉTODOS 'updateCoins' PARA ATUALIZAR OS USUÁRIOS
      // Isso garante que a lógica de negócio do modelo 'User' seja executada,
      // incluindo a atualização dos campos 'totalDonated' e 'totalReceived'
      await Promise.all([
        donorUser.updateCoins(-parsedAmount, "donation"),
        recipientUser.updateCoins(parsedAmount, "received"),
      ]);

      // 6. Retornar uma resposta de sucesso
      res.status(201).json({
        success: true,
        message: `Doação de ${parsedAmount} moedas realizada com sucesso!`,
        data: {
          donationId: newDonation._id,
          donorCoins: donorUser.coins,
          recipientCoins: recipientUser.coins,
        },
      });
    } catch (error) {
      console.error("Erro ao criar doação:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  }

  /**
   * Obter histórico de doações do usuário
   */
  async getUserDonations(req, res) {
    try {
      const userId = req.user.id;
      const { type = "all", page = 1, limit = 20 } = req.query;

      const result = await donationService.getUserDonationHistory(userId, {
        type,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Erro ao obter histórico:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter histórico de doações",
      });
    }
  }

  /**
   * Obter estatísticas de doação do usuário
   */
  async getUserStats(req, res) {
    try {
      const userId = req.params.userId || req.user.id;

      // Verificar se pode ver estatísticas do usuário
      if (userId !== req.user.id) {
        const user = await User.findById(userId);
        if (!user || user.settings.profileVisibility === "private") {
          return res.status(403).json({
            success: false,
            message: "Não autorizado a ver essas estatísticas",
          });
        }
      }

      const stats = await donationService.getUserDonationStats(userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Erro ao obter estatísticas",
      });
    }
  }

  /**
   * Buscar usuários
   */
  async searchUsersForDonation(req, res) {
    try {
      const { q: query, page = 1, limit = 20 } = req.query;
      const currentUserId = req.user.id;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Query deve ter pelo menos 2 caracteres",
        });
      }

      // 🔍 CORREÇÃO: Usar o donationService se existir
      const result = await donationService.searchUsers(
        query.trim(),
        currentUserId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
        }
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Erro ao buscar usuários para doação:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao buscar usuários",
      });
    }
  }

  /**
   * Obter ranking de usuários
   */
  async getRanking(req, res) {
    try {
      const { page = 1, limit = 100 } = req.query;

      const result = await donationService.getUserRanking(
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Erro ao obter ranking:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter ranking",
      });
    }
  }

  /**
   * Obter doação específica
   */
  async getDonation(req, res) {
    try {
      const { donationId } = req.params;
      const userId = req.user.id;

      const donation = await Donation.findById(donationId)
        .populate("donor", "name username avatar")
        .populate("recipient", "name username avatar");

      if (!donation) {
        return res.status(404).json({
          success: false,
          message: "Doação não encontrada",
        });
      }

      // Verificar se usuário pode ver esta doação
      const canView =
        donation.donor._id.toString() === userId ||
        donation.recipient._id.toString() === userId;

      if (!canView) {
        return res.status(403).json({
          success: false,
          message: "Não autorizado a ver esta doação",
        });
      }

      res.json({
        success: true,
        data: {
          donation,
        },
      });
    } catch (error) {
      console.error("Erro ao obter doação:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter doação",
      });
    }
  }

  /**
   * Cancelar doação
   */
  async cancelDonation(req, res) {
    try {
      const { donationId } = req.params;
      const userId = req.user.id;

      const donation = await donationService.cancelDonation(donationId, userId);

      res.json({
        success: true,
        message: "Doação cancelada com sucesso",
        data: {
          donation,
        },
      });
    } catch (error) {
      console.error("Erro ao cancelar doação:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Erro ao cancelar doação",
      });
    }
  }

  /**
   * Feed de doações recentes (público)
   */
  async getRecentDonations(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      const donations = await donationService.getRecentDonations(
        parseInt(limit),
        skip
      );

      res.json({
        success: true,
        data: {
          donations,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Erro ao obter doações recentes:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter doações recentes",
      });
    }
  }

  /**
   * Estatísticas globais do sistema
   */
  async getGlobalStats(req, res) {
    try {
      const stats = await donationService.getGlobalStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Erro ao obter estatísticas globais:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter estatísticas",
      });
    }
  }

  /**
   * Top doadores do período
   */
  async getTopDonors(req, res) {
    try {
      const { period = "month", limit = 10 } = req.query;

      const topDonors = await donationService.getTopDonors(
        period,
        parseInt(limit)
      );

      res.json({
        success: true,
        data: {
          period,
          topDonors,
        },
      });
    } catch (error) {
      console.error("Erro ao obter top doadores:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter ranking de doadores",
      });
    }
  }

  /**
   * Top receptores do período
   */
  async getTopRecipients(req, res) {
    try {
      const { period = "month", limit = 10 } = req.query;

      const topRecipients = await donationService.getTopRecipients(
        period,
        parseInt(limit)
      );

      res.json({
        success: true,
        data: {
          period,
          topRecipients,
        },
      });
    } catch (error) {
      console.error("Erro ao obter top receptores:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao obter ranking de receptores",
      });
    }
  }

  /**
   * Verificar se pode doar para usuário
   */
  async canDonate(req, res) {
    try {
      const { userId } = req.params;
      const donorId = req.user.id;

      const result = await donationService.canReceiveDonation(userId, donorId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Erro ao verificar doação:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao verificar possibilidade de doação",
      });
    }
  }
}

module.exports = new DonationController();
