require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const WebSocketServer = require("./websocket");

connectDB();

const PORT = process.env.PORT || 5000;

// Criar servidor HTTP
const server = http.createServer(app);

// Inicializar WebSocket Server
const wsServer = new WebSocketServer(server);

// Tornar wsServer disponível globalmente
app.set("wsServer", wsServer);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server HTTP rodando na porta ${PORT}`);
  console.log(`✅ WebSocket disponível em ws://localhost:${PORT}/ws`);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  server.close(() => process.exit(1));
});
