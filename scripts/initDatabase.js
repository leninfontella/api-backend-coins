// scripts/initDatabase.js
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Donation = require("../src/models/Donation");
const Notification = require("../src/models/Notification");

async function initDatabase() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/donation_system"
    );
    console.log("✅ Conectado ao MongoDB");

    // Criar índices
    console.log("🔄 Criando índices...");
    await Promise.all([
      User.createIndexes(),
      Donation.createIndexes(),
      Notification.createIndexes(),
    ]);
    console.log("✅ Índices criados com sucesso");

    // Criar usuários de exemplo (apenas se não existirem)
    const userCount = await User.countDocuments();

    if (userCount === 0) {
      console.log("🔄 Criando usuários de exemplo...");

      const sampleUsers = [
        {
          name: "Ana Silva",
          username: "ana_silva",
          email: "ana@example.com",
          password: "$2b$10$hashedpassword", // Use bcrypt na prática
          avatar: "👩‍💼",
          institution: "Hospital Municipal",
          coins: 1250,
          status: "active",
        },
        {
          name: "João Santos",
          username: "joao_santos",
          email: "joao@example.com",
          password: "$2b$10$hashedpassword",
          avatar: "👨‍⚕️",
          institution: "Cruz Vermelha",
          coins: 3480,
          status: "active",
        },
        {
          name: "Maria Oliveira",
          username: "maria_oliveira",
          email: "maria@example.com",
          password: "$2b$10$hashedpassword",
          avatar: "👩‍⚕️",
          institution: "Banco de Sangue Central",
          coins: 2100,
          status: "active",
        },
        {
          name: "Carlos Pereira",
          username: "carlos_pereira",
          email: "carlos@example.com",
          password: "$2b$10$hashedpassword",
          avatar: "👨‍⚕️",
          institution: "Hospital das Clínicas",
          coins: 850,
          status: "active",
        },
        {
          name: "Lucia Costa",
          username: "lucia_costa",
          email: "lucia@example.com",
          password: "$2b$10$hashedpassword",
          avatar: "👩‍⚕️",
          institution: "Centro de Doação",
          coins: 5200,
          status: "active",
        },
      ];

      await User.insertMany(sampleUsers);
      console.log("✅ Usuários de exemplo criados");

      // Criar algumas doações de exemplo
      console.log("🔄 Criando doações de exemplo...");

      const users = await User.find().limit(5);
      const sampleDonations = [
        {
          donor: users[0]._id,
          recipient: users[1]._id,
          amount: 100,
          message: "Obrigada por tudo que faz! 💙",
          status: "completed",
        },
        {
          donor: users[1]._id,
          recipient: users[2]._id,
          amount: 250,
          message: "Parabéns pelo excelente trabalho!",
          status: "completed",
        },
        {
          donor: users[4]._id,
          recipient: users[0]._id,
          amount: 500,
          message: "Você merece! Continue assim!",
          status: "completed",
        },
        {
          donor: users[2]._id,
          recipient: users[3]._id,
          amount: 75,
          message: "Um pequeno reconhecimento 😊",
          status: "completed",
        },
      ];

      for (const donationData of sampleDonations) {
        const donation = new Donation(donationData);
        await donation.save();

        // Atualizar saldos dos usuários
        await User.findByIdAndUpdate(donationData.donor, {
          $inc: { coins: -donationData.amount },
        });
        await User.findByIdAndUpdate(donationData.recipient, {
          $inc: { coins: donationData.amount },
        });
      }

      console.log("✅ Doações de exemplo criadas");
    } else {
      console.log("ℹ️ Usuários já existem no banco de dados");
    }

    // Verificar estrutura do banco
    console.log("🔄 Verificando estrutura do banco...");
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      "📊 Coleções disponíveis:",
      collections.map((c) => c.name)
    );

    const stats = {
      users: await User.countDocuments(),
      donations: await Donation.countDocuments(),
      notifications: await Notification.countDocuments(),
    };

    console.log("📈 Estatísticas do banco:");
    console.log(`   • Usuários: ${stats.users}`);
    console.log(`   • Doações: ${stats.donations}`);
    console.log(`   • Notificações: ${stats.notifications}`);

    console.log("🎉 Inicialização do banco de dados concluída!");
  } catch (error) {
    console.error("❌ Erro na inicialização:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Desconectado do MongoDB");
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log("✨ Setup completo!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Falha no setup:", error);
      process.exit(1);
    });
}

module.exports = { initDatabase };
