require("dotenv").config();
const http = require("http");
const app = require("./app");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

// Conectar ao banco de dados
connectDB();

const PORT = process.env.PORT || 5000;

// Criar servidor HTTP (necessário para Socket.IO)
const server = http.createServer(app);

// Configurar Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "http://127.0.0.1:3000",
      "https://altrums.vercel.app",
      "http://127.0.0.1:5501",
    ],
    credentials: true,
    methods: ["GET", "POST"],
  },
});

// Armazenar conexões de usuários
const userSockets = new Map();

// Event listeners do Socket.IO
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  // Quando usuário autentica, associar socket ao userId
  socket.on("authenticate", (userId) => {
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    console.log(`✅ Usuário autenticado: ${userId} -> ${socket.id}`);

    // Confirmar autenticação para o cliente
    socket.emit("authenticated", { userId, socketId: socket.id });
  });

  // Evento de teste/ping
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: new Date().toISOString() });
  });

  // Desconexão
  socket.on("disconnect", () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
      console.log(`❌ Usuário desconectado: ${socket.userId}`);
    } else {
      console.log(`❌ Cliente desconectado: ${socket.id}`);
    }
  });
});

// Disponibilizar io e userSockets para as rotas via app.set()
app.set("io", io);
app.set("userSockets", userSockets);

// Iniciar servidor (mudou de app.listen para server.listen)
server.listen(PORT, () => {
  console.log(`🚀 Server rodando na porta ${PORT}`);
  console.log(`🔌 WebSocket habilitado`);
  console.log(`📡 Socket.IO configurado`);
});

// Exportar para uso em testes ou outros módulos
module.exports = { server, io, userSockets };
