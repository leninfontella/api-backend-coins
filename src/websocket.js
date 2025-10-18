// src/websocket.js
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: "/ws" });
    this.clients = new Map(); // Map<userId, WebSocket>

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));

    console.log("✅ WebSocket Server inicializado");
  }

  handleConnection(ws, req) {
    console.log("🔌 Nova conexão WebSocket");

    let userId = null;
    let isAuthenticated = false;

    // Handler para mensagens recebidas
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "auth") {
          // Autenticar o usuário
          const token = message.token;

          if (!token) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Token não fornecido",
              })
            );
            ws.close();
            return;
          }

          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id;
            isAuthenticated = true;

            // Armazenar conexão autenticada
            this.clients.set(userId, ws);

            ws.send(
              JSON.stringify({
                type: "authenticated",
                message: "Conectado com sucesso",
                userId: userId,
              })
            );

            console.log(`✅ Usuário ${userId} autenticado no WebSocket`);
          } catch (error) {
            console.error("❌ Erro ao verificar token:", error);
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Token inválido",
              })
            );
            ws.close();
          }
        } else if (message.type === "ping") {
          // Responder ao ping para manter conexão viva
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (error) {
        console.error("❌ Erro ao processar mensagem:", error);
      }
    });

    // Handler para fechamento de conexão
    ws.on("close", () => {
      if (userId) {
        this.clients.delete(userId);
        console.log(`🔌 Usuário ${userId} desconectado do WebSocket`);
      }
    });

    // Handler para erros
    ws.on("error", (error) => {
      console.error("❌ Erro no WebSocket:", error);
      if (userId) {
        this.clients.delete(userId);
      }
    });
  }

  // Notificar usuário sobre doação recebida
  notifyDonationReceived(recipientId, donationData) {
    const client = this.clients.get(recipientId.toString());

    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(
          JSON.stringify({
            type: "donation_received",
            data: donationData,
          })
        );

        console.log(
          `✅ Notificação de doação enviada para usuário ${recipientId}`
        );
        return true;
      } catch (error) {
        console.error("❌ Erro ao enviar notificação:", error);
        return false;
      }
    }

    console.log(`⚠️ Usuário ${recipientId} não está conectado ao WebSocket`);
    return false;
  }

  /**
   * Notificar usuário sobre subida de nível
   * @param {String} userId - ID do usuário
   * @param {Object} levelData - Dados do novo nível
   */
  notifyLevelUp(userId, levelData) {
    const client = this.clients.get(userId.toString());

    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(
          JSON.stringify({
            type: "level_up",
            data: levelData,
          })
        );

        console.log(
          `🎖️ Notificação de Level Up enviada para usuário ${userId}`
        );
        return true;
      } catch (error) {
        console.error("❌ Erro ao enviar notificação de level up:", error);
        return false;
      }
    }

    console.log(
      `⚠️ Usuário ${userId} não está conectado - Level Up não notificado em tempo real`
    );
    return false;
  }

  // Broadcast para múltiplos usuários
  broadcast(userIds, data) {
    let sent = 0;

    userIds.forEach((userId) => {
      const client = this.clients.get(userId.toString());

      if (client && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(data));
          sent++;
        } catch (error) {
          console.error(`❌ Erro ao enviar para ${userId}:`, error);
        }
      }
    });

    return sent;
  }

  // Obter estatísticas de conexões
  getStats() {
    return {
      totalConnections: this.clients.size,
      connectedUsers: Array.from(this.clients.keys()),
    };
  }
}

module.exports = WebSocketServer;
