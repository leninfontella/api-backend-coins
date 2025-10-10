// photoConsistencyCheck.js - Script para verificar e corrigir fotos

const User = require("./models/User");
const gcsService = require("./services/gcsService");

/**
 * Verifica a consistência das fotos de perfil no banco
 */
async function checkPhotoConsistency() {
  try {
    console.log("🔍 Iniciando verificação de consistência de fotos...\n");

    const users = await User.find({});

    const stats = {
      total: users.length,
      withPhoto: 0,
      withoutPhoto: 0,
      gcsPhotos: 0,
      localPhotos: 0,
      invalidPhotos: 0,
      fixed: 0,
    };

    for (const user of users) {
      const hasPhoto = user.profilePhoto && user.profilePhoto.filename;

      if (hasPhoto) {
        stats.withPhoto++;

        // Verificar tipo de storage
        if (user.profilePhoto.storage === "gcs") {
          stats.gcsPhotos++;

          // Verificar se URL é válida
          if (
            !user.profilePhoto.path ||
            !user.profilePhoto.path.startsWith("http")
          ) {
            console.log(`⚠️  Usuário ${user.email}: URL inválida`);
            console.log(`   Filename: ${user.profilePhoto.filename}`);
            console.log(`   Path: ${user.profilePhoto.path}`);
            stats.invalidPhotos++;
          } else {
            console.log(`✅ Usuário ${user.email}: Foto GCS válida`);
            console.log(`   URL: ${user.profilePhoto.path}`);
          }
        } else if (user.profilePhoto.storage === "local") {
          stats.localPhotos++;
          console.log(
            `📂 Usuário ${user.email}: Foto local (migração necessária)`
          );
        } else {
          stats.invalidPhotos++;
          console.log(`❌ Usuário ${user.email}: Storage não definido`);
          console.log(`   Filename: ${user.profilePhoto.filename}`);
        }
      } else {
        stats.withoutPhoto++;
      }
    }

    console.log("\n📊 Estatísticas:");
    console.log(`   Total de usuários: ${stats.total}`);
    console.log(`   Com foto: ${stats.withPhoto}`);
    console.log(`   Sem foto: ${stats.withoutPhoto}`);
    console.log(`   Fotos no GCS: ${stats.gcsPhotos}`);
    console.log(`   Fotos locais: ${stats.localPhotos}`);
    console.log(`   Fotos inválidas: ${stats.invalidPhotos}`);

    return stats;
  } catch (error) {
    console.error("❌ Erro na verificação:", error);
    throw error;
  }
}

/**
 * Corrige URLs inválidas no banco
 */
async function fixInvalidUrls() {
  try {
    console.log("🔧 Corrigindo URLs inválidas...\n");

    const users = await User.find({
      "profilePhoto.storage": "gcs",
      $or: [
        { "profilePhoto.path": { $exists: false } },
        { "profilePhoto.path": null },
        { "profilePhoto.path": "" },
      ],
    });

    let fixed = 0;

    for (const user of users) {
      if (user.profilePhoto && user.profilePhoto.filename) {
        const bucket = user.profilePhoto.bucket || "altrum_coins";
        const correctUrl = `https://storage.googleapis.com/${bucket}/profiles/${user.profilePhoto.filename}`;

        console.log(`🔧 Corrigindo usuário ${user.email}`);
        console.log(`   De: ${user.profilePhoto.path}`);
        console.log(`   Para: ${correctUrl}`);

        user.profilePhoto.path = correctUrl;
        user.profilePhoto.storage = "gcs";
        user.profilePhoto.bucket = bucket;

        await user.save();
        fixed++;
      }
    }

    console.log(`\n✅ ${fixed} usuários corrigidos!`);
    return fixed;
  } catch (error) {
    console.error("❌ Erro ao corrigir URLs:", error);
    throw error;
  }
}

/**
 * Verifica se arquivos existem no GCS
 */
async function verifyGcsFiles() {
  try {
    console.log("🔍 Verificando existência de arquivos no GCS...\n");

    const users = await User.find({
      "profilePhoto.storage": "gcs",
      "profilePhoto.filename": { $exists: true, $ne: null },
    });

    let exists = 0;
    let missing = 0;

    for (const user of users) {
      const filename = user.profilePhoto.filename;
      const fileExists = await gcsService.fileExists(filename);

      if (fileExists) {
        exists++;
        console.log(`✅ ${user.email}: Arquivo existe no GCS`);
      } else {
        missing++;
        console.log(`❌ ${user.email}: Arquivo NÃO existe no GCS`);
        console.log(`   Filename: ${filename}`);
        console.log(`   Ação recomendada: Limpar dados da foto do banco`);
      }
    }

    console.log(`\n📊 Resultados:`);
    console.log(`   Existem: ${exists}`);
    console.log(`   Faltando: ${missing}`);

    return { exists, missing };
  } catch (error) {
    console.error("❌ Erro ao verificar arquivos:", error);
    throw error;
  }
}

/**
 * Limpa dados de fotos que não existem no GCS
 */
async function cleanOrphanedPhotos() {
  try {
    console.log("🧹 Limpando dados de fotos órfãs...\n");

    const users = await User.find({
      "profilePhoto.storage": "gcs",
      "profilePhoto.filename": { $exists: true, $ne: null },
    });

    let cleaned = 0;

    for (const user of users) {
      const filename = user.profilePhoto.filename;
      const fileExists = await gcsService.fileExists(filename);

      if (!fileExists) {
        console.log(`🧹 Limpando dados de foto para ${user.email}`);

        user.profilePhoto = {
          filename: null,
          path: null,
          uploadDate: null,
          storage: null,
          bucket: null,
        };

        await user.save();
        cleaned++;
      }
    }

    console.log(`\n✅ ${cleaned} registros limpos!`);
    return cleaned;
  } catch (error) {
    console.error("❌ Erro ao limpar dados:", error);
    throw error;
  }
}

/**
 * Menu interativo
 */
async function runDiagnostics() {
  console.log("=".repeat(60));
  console.log("🔍 DIAGNÓSTICO DE FOTOS DE PERFIL");
  console.log("=".repeat(60));

  try {
    // 1. Verificar consistência
    console.log("\n1️⃣ Verificando consistência...");
    await checkPhotoConsistency();

    // 2. Corrigir URLs
    console.log("\n2️⃣ Corrigindo URLs inválidas...");
    await fixInvalidUrls();

    // 3. Verificar arquivos no GCS
    console.log("\n3️⃣ Verificando arquivos no GCS...");
    await verifyGcsFiles();

    console.log("\n✅ Diagnóstico completo!");
    console.log(
      "\nExecute cleanOrphanedPhotos() se necessário limpar dados órfãos."
    );
  } catch (error) {
    console.error("❌ Erro no diagnóstico:", error);
  }
}

module.exports = {
  checkPhotoConsistency,
  fixInvalidUrls,
  verifyGcsFiles,
  cleanOrphanedPhotos,
  runDiagnostics,
};

// Executar se chamado diretamente
if (require.main === module) {
  const mongoose = require("mongoose");
  require("dotenv").config();

  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("✅ Conectado ao MongoDB");
      return runDiagnostics();
    })
    .then(() => {
      console.log("\n✅ Processo concluído!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Erro:", error);
      process.exit(1);
    });
}
