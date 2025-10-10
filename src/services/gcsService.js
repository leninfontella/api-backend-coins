// src/services/gcsService.js
const { Storage } = require("@google-cloud/storage");
const sharp = require("sharp");

// ========== CONFIGURAÇÃO E INICIALIZAÇÃO ==========

let storageOptions = {
  projectId: process.env.GCS_PROJECT_ID,
};

// 1. Tenta carregar o conteúdo JSON COMPLETO da variável de ambiente (Método Render/Produção)
if (process.env.GCP_CREDENTIALS_JSON) {
  try {
    storageOptions.credentials = JSON.parse(process.env.GCP_CREDENTIALS_JSON);
    console.log("✅ GCS Auth: Autenticação via JSON de Variável de Ambiente.");
  } catch (e) {
    console.error(
      "🚨 ERRO ao parsear GCP_CREDENTIALS_JSON. Verifique o formato:",
      e.message
    );
  }
} else if (process.env.GCS_KEYFILE_PATH) {
  // 2. Fallback: Tenta o caminho do arquivo (Método Dev Local)
  storageOptions.keyFilename = process.env.GCS_KEYFILE_PATH;
  console.log(
    "⚠️ GCS Auth: Autenticação via Arquivo de Chave Local (GCS_KEYFILE_PATH)."
  );
} else {
  // 3. Fallback: Tenta as Application Default Credentials (ADC)
  console.log("ℹ️ GCS Auth: Tentando Application Default Credentials (ADC).");
}

const storage = new Storage(storageOptions);
const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

// ========== FUNÇÕES DE UPLOAD E DELETE ==========

/**
 * Fazer upload de imagem para o GCS
 * @param {Buffer} imageBuffer - Buffer da imagem
 * @param {string} filename - Nome do arquivo
 * @param {string} mimetype - Tipo MIME da imagem
 * @returns {Promise<Object>} URL pública e metadados
 */
async function uploadImage(imageBuffer, filename, mimetype = "image/webp") {
  try {
    console.log(`📤 Iniciando upload para GCS: ${filename}`);

    // Processar imagem com Sharp
    const processedBuffer = await sharp(imageBuffer)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .webp({
        quality: 85,
        effort: 4,
      })
      .toBuffer();

    // Criar referência do arquivo no bucket
    const blob = bucket.file(`profiles/${filename}`);

    // Criar stream de upload
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: mimetype,
        cacheControl: "public, max-age=31536000",
        metadata: {
          uploadedAt: new Date().toISOString(),
          processedWithSharp: true,
        },
      },
    });

    // Fazer upload
    await new Promise((resolve, reject) => {
      blobStream.on("error", (error) => {
        console.error("❌ Erro no upload GCS:", error);
        reject(error);
      });

      blobStream.on("finish", () => {
        console.log(`✅ Upload GCS concluído: ${filename}`);
        resolve();
      });

      blobStream.end(processedBuffer);
    });

    // Gerar URL pública
    const publicUrl = `https://storage.googleapis.com/${bucketName}/profiles/${filename}`;

    return {
      success: true,
      url: publicUrl,
      filename: filename,
      size: processedBuffer.length,
      bucket: bucketName,
      path: `profiles/${filename}`,
    };
  } catch (error) {
    console.error("❌ Erro no serviço GCS:", error);
    throw new Error(`Falha no upload GCS: ${error.message}`);
  }
}

/**
 * Deletar imagem do GCS
 * @param {string} filename - Nome do arquivo
 * @returns {Promise<boolean>}
 */
async function deleteImage(filename) {
  try {
    if (!filename) return false;

    console.log(`🗑️ Deletando do GCS: ${filename}`);

    const file = bucket.file(`profiles/${filename}`);

    // Verificar se arquivo existe antes de deletar
    const [exists] = await file.exists();

    if (!exists) {
      console.log(`⚠️ Arquivo não encontrado no GCS: ${filename}`);
      return false;
    }

    await file.delete();
    console.log(`✅ Arquivo deletado do GCS: ${filename}`);

    return true;
  } catch (error) {
    console.error(`❌ Erro ao deletar do GCS: ${filename}`, error);
    return false;
  }
}

// ========== FUNÇÕES DE VERIFICAÇÃO E METADADOS ==========

/**
 * Verificar se arquivo existe no GCS
 * @param {string} filename - Nome do arquivo
 * @returns {Promise<boolean>}
 */
async function fileExists(filename) {
  try {
    if (!filename) return false;

    const file = bucket.file(`profiles/${filename}`);
    const [exists] = await file.exists();
    console.log(`🔍 Verificando existência: ${filename} = ${exists}`);

    return exists;
  } catch (error) {
    console.error(`❌ Erro ao verificar existência de ${filename}:`, error);
    return false;
  }
}

/**
 * Obter metadados de um arquivo
 * @param {string} filename - Nome do arquivo
 * @returns {Promise<object|null>}
 */
async function getFileMetadata(filename) {
  try {
    const file = bucket.file(`profiles/${filename}`);
    const [metadata] = await file.getMetadata();
    console.log(`📊 Metadados obtidos: ${filename}`);
    return metadata;
  } catch (error) {
    console.error(`❌ Erro ao obter metadados de ${filename}:`, error);
    return null;
  }
}

/**
 * Obter URL pública de um arquivo
 * @param {string} filename - Nome do arquivo
 * @returns {string|null}
 */
function getPublicUrl(filename) {
  if (!filename) return null;
  return `https://storage.googleapis.com/${bucketName}/profiles/${filename}`;
}

// ========== FUNÇÕES DE LISTAGEM E ESTATÍSTICAS ==========

/**
 * Listar todas as imagens de perfil
 * @returns {Promise<Array>}
 */
async function listProfileImages() {
  try {
    const [files] = await bucket.getFiles({
      prefix: "profiles/",
    });

    const imageList = files.map((file) => ({
      name: file.name,
      size: file.metadata.size,
      contentType: file.metadata.contentType,
      created: file.metadata.timeCreated,
      updated: file.metadata.updated,
      url: getPublicUrl(file.name.replace("profiles/", "")),
      publicUrl: `https://storage.googleapis.com/${bucketName}/${file.name}`,
    }));

    console.log(`📋 ${imageList.length} imagens listadas`);
    return imageList;
  } catch (error) {
    console.error("❌ Erro ao listar imagens:", error);
    return [];
  }
}

/**
 * Obter estatísticas do storage
 * @returns {Promise<object|null>}
 */
async function getStorageStats() {
  try {
    const [files] = await bucket.getFiles({
      prefix: "profiles/",
    });

    let totalSize = 0;
    let oldestDate = null;
    let newestDate = null;

    files.forEach((file) => {
      totalSize += parseInt(file.metadata.size);
      const created = new Date(file.metadata.timeCreated);

      if (!oldestDate || created < oldestDate) {
        oldestDate = created;
      }
      if (!newestDate || created > newestDate) {
        newestDate = created;
      }
    });

    return {
      totalFiles: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      oldestFile: oldestDate,
      newestFile: newestDate,
      bucket: bucketName,
    };
  } catch (error) {
    console.error("❌ Erro ao obter estatísticas:", error);
    return null;
  }
}

// ========== FUNÇÕES DE MANUTENÇÃO ==========

/**
 * Limpar imagens antigas (mais de X dias)
 * @param {number} daysOld - Número de dias
 * @returns {Promise<number>} Quantidade de arquivos removidos
 */
async function cleanupOldImages(daysOld = 30) {
  try {
    console.log(
      `🧹 Iniciando limpeza de imagens antigas (>${daysOld} dias)...`
    );

    const [files] = await bucket.getFiles({
      prefix: "profiles/",
    });

    const now = Date.now();
    const maxAge = daysOld * 24 * 60 * 60 * 1000;
    let removedCount = 0;

    for (const file of files) {
      const created = new Date(file.metadata.timeCreated).getTime();
      const age = now - created;

      if (age > maxAge) {
        await file.delete();
        console.log(`🗑️ Arquivo antigo removido: ${file.name}`);
        removedCount++;
      }
    }

    console.log(`✅ Limpeza concluída: ${removedCount} arquivos removidos`);
    return removedCount;
  } catch (error) {
    console.error("❌ Erro ao limpar imagens antigas:", error);
    return 0;
  }
}

// ========== FUNÇÕES DE HEALTH CHECK ==========

/**
 * Verificar saúde da conexão com GCS
 * @returns {Promise<Object>}
 */
async function checkHealth() {
  try {
    // Verificar se bucket existe
    const [exists] = await bucket.exists();

    if (!exists) {
      return {
        healthy: false,
        accessible: false,
        error: "Bucket não encontrado",
        bucket: bucketName,
        timestamp: new Date().toISOString(),
      };
    }

    // Obter metadados do bucket
    const [metadata] = await bucket.getMetadata();

    // Tentar listar 1 arquivo para verificar acesso
    const [files] = await bucket.getFiles({
      prefix: "profiles/",
      maxResults: 1,
    });

    return {
      healthy: true,
      accessible: true,
      bucket: bucketName,
      location: metadata.location,
      storageClass: metadata.storageClass,
      projectId: process.env.GCS_PROJECT_ID,
      sampleFilesFound: files.length,
      message: "GCS está funcionando corretamente",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      healthy: false,
      accessible: false,
      bucket: bucketName,
      error: error.message,
      message: "Erro ao acessar GCS",
      timestamp: new Date().toISOString(),
    };
  }
}

// ========== EXPORTAÇÃO ==========

module.exports = {
  // Upload e Delete
  uploadImage,
  deleteImage,

  // Verificação e Metadados
  fileExists,
  getFileMetadata,
  getPublicUrl,

  // Listagem e Estatísticas
  listProfileImages,
  getStorageStats,

  // Manutenção
  cleanupOldImages,

  // Health Check
  checkHealth,

  // Exports diretos (para uso avançado)
  bucket,
  bucketName,
};
