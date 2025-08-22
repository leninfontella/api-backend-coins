// scripts/fixUserStats.js
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Donation = require("../src/models/Donation");

async function fixUserStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("🔄 Corrigindo estatísticas de usuários...");

    // Zera os campos antes de recalcular
    await User.updateMany(
      {},
      {
        $set: {
          totalDonated: 0,
          totalReceived: 0,
          "stats.donationsSent": 0,
          "stats.donationsReceived": 0,
          "stats.totalDonated": 0,
          "stats.totalReceived": 0,
        },
      }
    );

    // Buscar todas as doações completas
    const donations = await Donation.find({ status: "completed" });

    let updates = {};

    for (const donation of donations) {
      // Incrementar doador
      if (!updates[donation.donor]) {
        updates[donation.donor] = {
          $inc: {
            totalDonated: 0,
            "stats.totalDonated": 0,
            "stats.donationsSent": 0,
          },
        };
      }
      updates[donation.donor].$inc.totalDonated += donation.amount;
      updates[donation.donor].$inc["stats.totalDonated"] += donation.amount;
      updates[donation.donor].$inc["stats.donationsSent"] += 1;

      // Incrementar receptor
      if (!updates[donation.recipient]) {
        updates[donation.recipient] = {
          $inc: {
            totalReceived: 0,
            "stats.totalReceived": 0,
            "stats.donationsReceived": 0,
          },
        };
      }
      updates[donation.recipient].$inc.totalReceived += donation.amount;
      updates[donation.recipient].$inc["stats.totalReceived"] +=
        donation.amount;
      updates[donation.recipient].$inc["stats.donationsReceived"] += 1;
    }

    // Executar updates em lote
    const ops = Object.entries(updates).map(([userId, update]) =>
      User.findByIdAndUpdate(userId, update)
    );

    await Promise.all(ops);

    console.log(`✅ Estatísticas corrigidas para ${ops.length} usuários.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao corrigir estatísticas:", err);
    process.exit(1);
  }
}

fixUserStats();
