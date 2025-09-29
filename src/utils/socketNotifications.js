/**
 * Sistema de notificações em tempo real via Socket.IO
 */

/**
 * Notificar usuário sobre doação recebida
 * @param {Object} io - Instância do Socket.IO
 * @param {Map} userSockets - Mapa de userId -> socketId
 * @param {String} recipientId - ID do usuário que recebeu a doação
 * @param {Object} donationData - Dados da doação
 */
function notifyDonationReceived(io, userSockets, recipientId, donationData) {
  const socketId = userSockets.get(recipientId.toString());

  if (socketId) {
    io.to(socketId).emit("donationReceived", {
      donorName: donationData.donorName,
      amount: donationData.amount,
      message: donationData.message || "",
      timestamp: new Date().toISOString(),
    });

    console.log(
      `📨 Notificação enviada para ${recipientId}: ${donationData.amount} moedas de ${donationData.donorName}`
    );
    return true;
  } else {
    console.log(`⚠️ Usuário ${recipientId} não está conectado via WebSocket`);
    return false;
  }
}

/**
 * Notificar múltiplos usuários
 */
function notifyMultipleUsers(io, userSockets, userIds, eventName, data) {
  let notifiedCount = 0;

  userIds.forEach((userId) => {
    const socketId = userSockets.get(userId.toString());
    if (socketId) {
      io.to(socketId).emit(eventName, data);
      notifiedCount++;
    }
  });

  console.log(`📨 ${notifiedCount}/${userIds.length} usuários notificados`);
  return notifiedCount;
}

/**
 * Broadcast para todos os usuários conectados
 */
function broadcastToAll(io, eventName, data) {
  io.emit(eventName, data);
  console.log(`📢 Broadcast enviado: ${eventName}`);
}

module.exports = {
  notifyDonationReceived,
  notifyMultipleUsers,
  broadcastToAll,
};
