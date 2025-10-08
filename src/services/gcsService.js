// src/services/gcsService.js
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const sharp = require("sharp");

// Inicializar cliente do Google Cloud Storage
let storageOptions = {
  projectId: process.env.GCS_PROJECT_ID,
};

// 1. Tenta carregar o conteúdo JSON COMPLETO da variável de ambiente (Método Render/Produção)
if (process.env.GCP_CREDENTIALS_JSON) {
  try {
    // Faz o parse do conteúdo JSON da variável de ambiente
    storageOptions.credentials = JSON.parse(process.env.GCP_CREDENTIALS_JSON);
    console.log("✅ GCS Auth: Autenticação via JSON de Variável de Ambiente.");
  } catch (e) {
    // Mensagem de erro CRÍTICA se o JSON estiver mal formatado
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
        cacheControl: "public, max-age=31536000", // Cache de 1 ano
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

      blobStream.on("finish", async () => {
        try {
          // Tornar arquivo público
          await blob.makePublic();
          console.log(`✅ Upload GCS concluído: ${filename}`);
          resolve();
        } catch (error) {
          reject(error);
        }
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

    return exists;
  } catch (error) {
    console.error("Erro ao verificar existência do arquivo:", error);
    return false;
  }
}

/**
 * Obter URL pública de um arquivo
 * @param {string} filename - Nome do arquivo
 * @returns {string}
 */
function getPublicUrl(filename) {
  if (!filename) return null;
  return `https://storage.googleapis.com/${bucketName}/profiles/${filename}`;
}

/**
 * Listar todas as imagens de perfil
 * @returns {Promise<Array>}
 */
async function listProfileImages() {
  try {
    const [files] = await bucket.getFiles({
      prefix: "profiles/",
    });

    return files.map((file) => ({
      name: file.name,
      url: getPublicUrl(file.name.replace("profiles/", "")),
      created: file.metadata.timeCreated,
      size: file.metadata.size,
    }));
  } catch (error) {
    console.error("Erro ao listar imagens:", error);
    return [];
  }
}

/**
 * Limpar imagens antigas (mais de 30 dias sem uso)
 * @param {number} daysOld - Dias para considerar como antiga
 * @returns {Promise<number>} Quantidade de arquivos removidos
 */
async function cleanupOldImages(daysOld = 30) {
  try {
    console.log(`🧹 Iniciando limpeza de imagens antigas (>${daysOld} dias)`);

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
        removedCount++;
        console.log(`🗑️ Removido: ${file.name}`);
      }
    }

    console.log(`✅ Limpeza concluída: ${removedCount} arquivos removidos`);
    return removedCount;
  } catch (error) {
    console.error("Erro na limpeza de imagens:", error);
    return 0;
  }
}

/**
 * Verificar saúde da conexão com GCS
 * @returns {Promise<Object>}
 */
async function checkHealth() {
  try {
    const [exists] = await bucket.exists();

    if (!exists) {
      return {
        healthy: false,
        error: "Bucket não encontrado",
      };
    }

    const [metadata] = await bucket.getMetadata();

    return {
      healthy: true,
      bucket: bucketName,
      location: metadata.location,
      storageClass: metadata.storageClass,
      projectId: process.env.GCS_PROJECT_ID,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  fileExists,
  getPublicUrl,
  listProfileImages,
  cleanupOldImages,
  checkHealth,
  bucket,
  bucketName,
};
