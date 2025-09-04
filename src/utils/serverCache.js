/**
 * Cache em memória para imagens do servidor
 * Evita ler do disco a cada requisição
 */
class ServerImageCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100; // Máximo 100 imagens em cache
    this.maxAge = 3600000; // 1 hora em millisegundos

    // Limpeza automática a cada 30 minutos
    setInterval(() => this.cleanup(), 1800000);

    console.log("🚀 ServerImageCache inicializado");
  }

  /**
   * Gera chave única para a imagem
   */
  generateKey(imagePath) {
    return `profile_${imagePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  /**
   * Busca imagem no cache
   */
  get(imagePath) {
    const key = this.generateKey(imagePath);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Verifica se expirou
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      console.log(`⏰ Cache expirado: ${imagePath}`);
      return null;
    }

    console.log(`✅ Cache HIT: ${imagePath}`);
    return cached;
  }

  /**
   * Salva imagem no cache
   */
  set(imagePath, buffer, contentType, fileSize) {
    // Remove cache mais antigo se necessário
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      const removed = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      console.log(
        `🗑️  Cache removido por limite: ${firstKey} (${removed.fileSize} bytes)`
      );
    }

    const key = this.generateKey(imagePath);
    this.cache.set(key, {
      buffer: buffer,
      contentType: contentType,
      fileSize: fileSize || buffer.length,
      timestamp: Date.now(),
      imagePath: imagePath,
    });

    console.log(
      `💾 Cache armazenado: ${imagePath} (${fileSize || buffer.length} bytes)`
    );
  }

  /**
   * Remove imagem específica do cache
   */
  invalidate(imagePath) {
    const key = this.generateKey(imagePath);
    const deleted = this.cache.delete(key);

    if (deleted) {
      console.log(`🔄 Cache invalidado: ${imagePath}`);
    } else {
      console.log(`⚠️  Cache não encontrado para invalidar: ${imagePath}`);
    }

    return deleted;
  }

  /**
   * Invalida múltiplas imagens (por padrão)
   */
  invalidatePattern(pattern) {
    let removed = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.imagePath.includes(pattern)) {
        this.cache.delete(key);
        removed++;
        console.log(`🔄 Cache invalidado (padrão): ${value.imagePath}`);
      }
    }

    return removed;
  }

  /**
   * Limpeza automática de cache expirado
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    let freedBytes = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        freedBytes += value.fileSize;
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      const freedMB = (freedBytes / 1024 / 1024).toFixed(2);
      console.log(
        `🧹 Limpeza automática: ${removed} itens removidos (${freedMB}MB liberados)`
      );
    }
  }

  /**
   * Força limpeza completa do cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🧹 Cache completamente limpo: ${size} itens removidos`);
    return size;
  }

  /**
   * Estatísticas do cache
   */
  getStats() {
    const items = Array.from(this.cache.values());
    const totalSize = items.reduce((sum, item) => sum + item.fileSize, 0);
    const avgAge =
      items.length > 0
        ? items.reduce((sum, item) => sum + (Date.now() - item.timestamp), 0) /
          items.length /
          1000
        : 0;

    return {
      items: this.cache.size,
      maxSize: this.maxSize,
      totalBytes: totalSize,
      totalMB: (totalSize / 1024 / 1024).toFixed(2),
      avgAgeSeconds: Math.round(avgAge),
      oldestItem:
        items.length > 0
          ? Math.round(
              (Date.now() - Math.min(...items.map((i) => i.timestamp))) / 1000
            )
          : 0,
      newestItem:
        items.length > 0
          ? Math.round(
              (Date.now() - Math.max(...items.map((i) => i.timestamp))) / 1000
            )
          : 0,
      hitRate: (this.hitCount / (this.hitCount + this.missCount)) * 100 || 0,
    };
  }

  /**
   * Lista todas as imagens no cache
   */
  listCached() {
    return Array.from(this.cache.values()).map((item) => ({
      imagePath: item.imagePath,
      fileSize: item.fileSize,
      ageSeconds: Math.round((Date.now() - item.timestamp) / 1000),
      contentType: item.contentType,
    }));
  }
}

// Instância global
const serverCache = new ServerImageCache();

// Adicionar contadores para estatísticas
serverCache.hitCount = 0;
serverCache.missCount = 0;

// Override do get para contar hits/misses
const originalGet = serverCache.get.bind(serverCache);
serverCache.get = function (imagePath) {
  const result = originalGet(imagePath);
  if (result) {
    this.hitCount++;
  } else {
    this.missCount++;
  }
  return result;
};

module.exports = serverCache;
