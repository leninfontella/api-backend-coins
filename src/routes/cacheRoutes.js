const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const serverCache = require("../utils/serverCache");
const { getUploadHealth } = require("../middleware/upload");

// Aplicar middleware de autenticação
router.use(authMiddleware);

// 📊 GET /api/cache/stats - Estatísticas detalhadas do cache
router.get("/stats", (req, res) => {
  try {
    const stats = serverCache.getStats();
    const uploadHealth = getUploadHealth();

    res.json({
      success: true,
      data: {
        cache: {
          ...stats,
          efficiency:
            stats.hitRate > 50
              ? "Boa"
              : stats.hitRate > 20
              ? "Regular"
              : "Baixa",
          status: stats.items > 0 ? "Ativo" : "Vazio",
        },
        upload: uploadHealth,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Erro ao obter estatísticas:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao obter estatísticas do cache",
      error: error.message,
    });
  }
});

// 📋 GET /api/cache/list - Listar todas as imagens em cache
router.get("/list", (req, res) => {
  try {
    const cachedImages = serverCache.listCached();

    res.json({
      success: true,
      data: {
        total: cachedImages.length,
        images: cachedImages.map((img) => ({
          ...img,
          sizeMB: (img.fileSize / 1024 / 1024).toFixed(2),
        })),
        totalSize: cachedImages.reduce((sum, img) => sum + img.fileSize, 0),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao listar cache:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao listar imagens em cache",
      error: error.message,
    });
  }
});

// 🧹 POST /api/cache/clear - Limpar todo o cache
router.post("/clear", (req, res) => {
  try {
    const cleared = serverCache.clear();

    console.log(`🧹 Cache limpo manualmente por usuário: ${req.user.id}`);

    res.json({
      success: true,
      message: `Cache completamente limpo`,
      data: {
        itemsRemoved: cleared,
        clearedBy: req.user.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao limpar cache:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao limpar cache",
      error: error.message,
    });
  }
});

// 🔄 POST /api/cache/invalidate - Invalidar cache específico
router.post("/invalidate", (req, res) => {
  try {
    const { imagePath, pattern } = req.body;

    if (!imagePath && !pattern) {
      return res.status(400).json({
        success: false,
        message: "imagePath ou pattern é obrigatório",
      });
    }

    let removed = 0;

    if (pattern) {
      removed = serverCache.invalidatePattern(pattern);
      console.log(
        `🔄 Cache invalidado por padrão "${pattern}": ${removed} itens`
      );
    } else {
      const invalidated = serverCache.invalidate(imagePath);
      removed = invalidated ? 1 : 0;
      console.log(`🔄 Cache invalidado para "${imagePath}": ${invalidated}`);
    }

    res.json({
      success: true,
      message: `Cache invalidado: ${removed} item(ns)`,
      data: {
        imagePath: imagePath || null,
        pattern: pattern || null,
        itemsInvalidated: removed,
        invalidatedBy: req.user.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao invalidar cache:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao invalidar cache",
      error: error.message,
    });
  }
});

// 🔄 POST /api/cache/cleanup - Forçar limpeza de cache expirado
router.post("/cleanup", (req, res) => {
  try {
    const initialSize = serverCache.getStats().items;
    serverCache.cleanup();
    const finalSize = serverCache.getStats().items;
    const removed = initialSize - finalSize;

    console.log(
      `🧹 Limpeza forçada por usuário ${req.user.id}: ${removed} itens removidos`
    );

    res.json({
      success: true,
      message: `Limpeza de cache executada`,
      data: {
        itemsBefore: initialSize,
        itemsAfter: finalSize,
        itemsRemoved: removed,
        cleanedBy: req.user.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro na limpeza de cache:", error);
    res.status(500).json({
      success: false,
      message: "Erro na limpeza de cache",
      error: error.message,
    });
  }
});

// ⚡ GET /api/cache/health - Verificação de saúde do sistema de cache
router.get("/health", (req, res) => {
  try {
    const cacheStats = serverCache.getStats();
    const uploadHealth = getUploadHealth();

    const health = {
      cache: {
        status: cacheStats.items >= 0 ? "OK" : "ERROR",
        items: cacheStats.items,
        hitRate: cacheStats.hitRate,
        memoryUsage: cacheStats.totalMB + "MB",
      },
      upload: uploadHealth,
      overall:
        uploadHealth.healthy && cacheStats.items >= 0 ? "HEALTHY" : "DEGRADED",
    };

    res.json({
      success: true,
      health: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro na verificação de saúde:", error);
    res.status(500).json({
      success: false,
      health: {
        overall: "ERROR",
        error: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// 📈 GET /api/cache/metrics - Métricas para monitoramento
router.get("/metrics", (req, res) => {
  try {
    const stats = serverCache.getStats();
    const uploadHealth = getUploadHealth();
    const memUsage = process.memoryUsage();

    // Formato simples para ferramentas de monitoramento
    const metrics = {
      cache_items: stats.items,
      cache_hit_rate: stats.hitRate,
      cache_memory_mb: parseFloat(stats.totalMB),
      cache_oldest_item_seconds: stats.oldestItem,
      upload_directory_healthy: uploadHealth.healthy ? 1 : 0,
      upload_total_files: uploadHealth.totalFiles || 0,
      server_memory_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      server_uptime_seconds: Math.round(process.uptime()),
    };

    res.json({
      success: true,
      metrics: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao obter métricas:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao obter métricas",
      error: error.message,
    });
  }
});

module.exports = router;
