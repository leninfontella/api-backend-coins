// scripts/migrateUsers.js
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function migrateUsers() {
  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({});

  for (let user of users) {
    // Adicionar campos padrão se não existirem
    if (!user.username) {
      user.username = user.name.toLowerCase().replace(/\s+/g, "_");
    }
    if (!user.stats) {
      user.stats = {
        donationsSent: 0,
        totalDonated: user.totalDonated || 0,
        donationsReceived: 0,
        totalReceived: user.totalReceived || 0,
      };
    }
    if (!user.settings) {
      user.settings = {}; // Valores padrão serão aplicados
    }

    await user.save();
  }

  console.log(`Migrados ${users.length} usuários`);
  await mongoose.disconnect();
}
