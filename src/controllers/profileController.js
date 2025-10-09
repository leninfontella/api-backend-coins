const User = require("../models/User");
const path = require("path");
const fs = require("fs");

// 🆕 IMPORT DO SERVIÇO GCS
const gcsService = require("../services/gcsService");

const profileController = {
  // Atualizar perfil completo (com validação de proprietário)
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { name, email, phone } = req.body;

      console.log("📥 Dados recebidos no backend:", { name, email, phone });

      // Buscar usuário atual
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

      console.log("👤 Usuário atual:", {
        name: user.name,
        email: user.email,
        phone: user.phone,
        hasPhoto: !!user.profilePhoto?.filename,
      });

      // 🔧 VALIDAÇÃO CRÍTICA: Verificar se o email pertence ao usuário atual
      if (email && email.toLowerCase() !== user.email.toLowerCase()) {
        // Verificar se o novo email já existe em outro usuário
        const existingUser = await User.findOne({
          email: email.toLowerCase(),
          _id: { $ne: userId },
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "Este email já está em uso por outro usuário",
          });
        }
      }

      // Se há uma nova foto, remover a anterior
      if (req.processedImage) {
        // 🆕 Remover do GCS em vez do sistema de arquivos local
        if (user.profilePhoto && user.profilePhoto.filename) {
          await gcsService.deleteImage(user.profilePhoto.filename);
          console.log(
            `🗑️  Foto antiga removida do GCS: ${user.profilePhoto.filename}`
          );
        }

        // 🆕 Salvar URL do GCS em vez de path local
        user.profilePhoto = {
          filename: req.processedImage.filename,
          path: req.processedImage.publicUrl, // URL pública do GCS
          uploadDate: new Date(),
          storage: "gcs", // 🆕 Indicador de storage
          bucket: req.processedImage.bucket, // 🆕 Nome do bucket
        };

        console.log("📸 Nova foto definida:", {
          filename: user.profilePhoto.filename,
          path: user.profilePhoto.path,
          storage: user.profilePhoto.storage,
        });
      }

      // 🔧 CORREÇÃO CRÍTICA: Atualizar campos individualmente
      let hasChanges = false;

      if (name && name.trim() && name.trim() !== user.name) {
        user.name = name.trim();
        hasChanges = true;
        console.log("✅ Nome atualizado:", user.name);
      }

      if (
        email &&
        email.trim() &&
        email.trim().toLowerCase() !== user.email.toLowerCase()
      ) {
        user.email = email.trim().toLowerCase();
        hasChanges = true;
        console.log("✅ Email atualizado:", user.email);
      }

      // 🔧 CORREÇÃO CRÍTICA: Atualizar telefone mesmo se vazio
      if (phone !== undefined) {
        const cleanPhone = phone.trim();
        if (cleanPhone !== user.phone) {
          user.phone = cleanPhone;
          hasChanges = true;
          console.log("✅ Telefone atualizado:", user.phone);
        }
      }

      // 🔧 CORREÇÃO CRÍTICA: Sempre salvar, mesmo sem mudanças de texto (pode ter foto)
      if (hasChanges || req.processedImage) {
        await user.save();
        console.log("💾 Usuário salvo no banco de dados");
      } else {
        console.log("⚠️  Nenhuma mudança detectada, não salvando");
      }

      // 🔧 CORREÇÃO: Preparar dados atualizados COMPLETOS do usuário para resposta
      const updatedUser = {
        id: user._id,
        name: user.name,
        fullName: user.fullName || user.name,
        email: user.email,
        phone: user.phone || "",
        profilePhotoUrl: user.profilePhotoUrl, // 🆕 Virtual que retorna URL do GCS
        avatar: user.avatar,
        institution: user.institution,
        coins: user.coins,
        balance: user.coins, // Alias
        level: user.level,
        xp: user.xp,
        maxXp: user.maxXp,
        score: user.score,
        totalDonated: user.totalDonated,
        totalReceived: user.totalReceived,
        totalDonations: user.totalDonations,
        stats: user.stats,
        preferences: user.preferences,
        settings: user.settings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      console.log("📤 Dados enviados para frontend:", {
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profilePhotoUrl: updatedUser.profilePhotoUrl,
        hasPhoto: !!updatedUser.profilePhotoUrl,
      });

      res.json({
        success: true,
        message: "Perfil atualizado com sucesso!",
        user: {
          ...updatedUser,
          // 🔧 CRÍTICO: Garantir que o frontend receba a URL pública correta
          profilePhotoUrl: req.processedImage
            ? req.processedImage.publicUrl
            : user.profilePhotoUrl, // 🔧 Usar virtual do modelo
        },
        profilePhoto: req.processedImage
          ? {
              url: req.processedImage.publicUrl, // ✅ URL pública correta do GCS
              filename: req.processedImage.filename,
              storage: "gcs",
            }
          : undefined,
      });
    } catch (error) {
      console.error("❌ Erro ao atualizar o perfil:", error);

      // 🆕 Se houve erro e uma imagem foi processada, remover do GCS
      if (req.processedImage && req.processedImage.filename) {
        try {
          await gcsService.deleteImage(req.processedImage.filename);
          console.log("🧹 Imagem removida do GCS após erro");
        } catch (deleteError) {
          console.error(
            "Erro ao remover imagem do GCS após falha:",
            deleteError
          );
        }
      }

      // Tratamento específico para erro de email duplicado
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Este email já está em uso por outro usuário",
        });
      }

      res.status(500).json({
        success: false,
        message: "Erro interno do servidor ao atualizar perfil.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // 🔧 MÉTODO: Upload apenas da foto (sem outros dados)
  async uploadProfilePhoto(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        // 🔧 Limpar imagem do GCS se usuário não existe
        if (req.processedImage && req.processedImage.filename) {
          await gcsService.deleteImage(req.processedImage.filename);
          console.log("🧹 Imagem removida do GCS (usuário não encontrado)");
        }

        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

      if (!req.processedImage) {
        return res.status(400).json({
          success: false,
          message: "Nenhuma imagem foi processada.",
        });
      }

      console.log("📸 Processando upload de foto para:", {
        userId: user._id,
        email: user.email,
        oldPhoto: user.profilePhoto?.filename,
        newPhoto: req.processedImage.filename,
      });

      // 🔧 Remover foto antiga do GCS
      if (user.profilePhoto && user.profilePhoto.filename) {
        await gcsService.deleteImage(user.profilePhoto.filename);
        console.log(
          `🗑️  Foto antiga removida do GCS: ${user.profilePhoto.filename}`
        );
      }

      // 🔧 CRÍTICO: Salvar nova foto ANTES de save()
      user.profilePhoto = {
        filename: req.processedImage.filename,
        path: req.processedImage.publicUrl, // URL pública do GCS
        uploadDate: new Date(),
        storage: "gcs",
        bucket: req.processedImage.bucket,
      };

      console.log("💾 Dados da foto antes do save():", {
        filename: user.profilePhoto.filename,
        path: user.profilePhoto.path,
        storage: user.profilePhoto.storage,
        bucket: user.profilePhoto.bucket,
      });

      await user.save();

      console.log("✅ Foto salva no banco com sucesso!");

      // 🔧 CRÍTICO: Preparar dados completos do usuário
      const userData = {
        id: user._id,
        name: user.name,
        fullName: user.fullName || user.name,
        email: user.email,
        phone: user.phone || "",
        profilePhotoUrl: user.profilePhoto.path, // 🔧 URL direta do GCS
        avatar: user.avatar, // Emoji para fallback
        institution: user.institution,
        coins: user.coins,
        balance: user.coins,
        level: user.level,
        xp: user.xp,
        maxXp: user.maxXp,
        score: user.score,
        totalDonated: user.totalDonated,
        totalReceived: user.totalReceived,
        totalDonations: user.totalDonations,
        stats: user.stats,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      console.log("📤 Resposta enviada:", {
        hasPhoto: !!userData.profilePhotoUrl,
        photoUrl: userData.profilePhotoUrl,
        photoStorage: "gcs",
      });

      // 🔧 CORREÇÃO: Retornar dados completos do usuário
      res.status(200).json({
        success: true,
        message: "Foto de perfil atualizada com sucesso!",
        profilePhoto: {
          url: user.profilePhoto.path, // URL do GCS
          filename: user.profilePhoto.filename,
          storage: "gcs",
          bucket: user.profilePhoto.bucket,
        },
        user: userData, // 🔧 Dados COMPLETOS do usuário
      });
    } catch (error) {
      console.error("❌ Erro no upload da foto:", error);

      // 🔧 Limpar imagem do GCS em caso de erro
      if (req.processedImage && req.processedImage.filename) {
        try {
          await gcsService.deleteImage(req.processedImage.filename);
          console.log("🧹 Imagem removida do GCS após erro");
        } catch (deleteError) {
          console.error("Erro ao remover imagem do GCS:", deleteError);
        }
      }

      res.status(500).json({
        success: false,
        message: "Erro ao fazer upload da foto",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Remover foto de perfil
  async removeProfilePhoto(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

      console.log("🗑️  Removendo foto de perfil:", {
        userId: user._id,
        email: user.email,
        currentPhoto: user.profilePhoto?.filename,
      });

      // 🆕 Remover arquivo do GCS
      if (user.profilePhoto && user.profilePhoto.filename) {
        await gcsService.deleteImage(user.profilePhoto.filename);
        console.log(`✅ Foto removida do GCS: ${user.profilePhoto.filename}`);
      }

      // Limpar dados no banco
      user.profilePhoto = {
        filename: null,
        path: null,
        uploadDate: null,
        storage: null,
        bucket: null,
      };

      await user.save();

      console.log("✅ Dados de foto limpos do banco");

      // 🔧 CORREÇÃO: Retornar dados completos do usuário
      const userData = {
        id: user._id,
        name: user.name,
        fullName: user.fullName || user.name,
        email: user.email,
        phone: user.phone || "",
        profilePhotoUrl: null, // 🔧 Agora é null
        avatar: user.avatar,
        institution: user.institution,
        coins: user.coins,
        balance: user.coins,
        level: user.level,
        xp: user.xp,
        maxXp: user.maxXp,
        score: user.score,
        totalDonated: user.totalDonated,
        totalReceived: user.totalReceived,
        totalDonations: user.totalDonations,
        stats: user.stats,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      res.json({
        success: true,
        message: "Foto de perfil removida com sucesso",
        user: userData, // 🔧 Dados COMPLETOS
      });
    } catch (error) {
      console.error("❌ Erro ao remover foto de perfil:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Obter dados do perfil
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId).select(
        "-password -refreshTokens -verificationToken -resetPasswordToken"
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

      // 🔧 CORREÇÃO: Preparar dados COMPLETOS do usuário
      const userData = {
        id: user._id,
        name: user.name,
        fullName: user.fullName || user.name,
        email: user.email,
        phone: user.phone || "",
        profilePhotoUrl: user.profilePhotoUrl, // 🔧 Virtual que retorna URL do GCS ou null
        avatar: user.avatar, // Emoji para fallback
        institution: user.institution,
        coins: user.coins,
        balance: user.coins, // Alias
        level: user.level,
        xp: user.xp,
        maxXp: user.maxXp,
        score: user.score,
        totalDonated: user.totalDonated,
        totalReceived: user.totalReceived,
        totalDonations: user.totalDonations,
        stats: user.stats,
        preferences: user.preferences,
        settings: user.settings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      console.log("📤 GET Profile - Dados enviados:", {
        userId: userData.id,
        email: userData.email,
        phone: userData.phone,
        profilePhotoUrl: userData.profilePhotoUrl,
        hasPhoto: !!userData.profilePhotoUrl,
        photoStorage: user.profilePhoto?.storage,
        photoFilename: user.profilePhoto?.filename,
      });

      res.json({
        success: true,
        data: {
          user: userData, // 🔧 Envolver em 'data' para consistência
        },
      });
    } catch (error) {
      console.error("❌ Erro ao obter perfil:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // 🆕 MÉTODO: Verificar saúde do sistema de storage
  async getStorageHealth(req, res) {
    try {
      const health = await gcsService.checkHealth();

      res.json({
        success: true,
        storage: {
          type: "Google Cloud Storage",
          ...health,
        },
      });
    } catch (error) {
      console.error("❌ Erro ao verificar saúde do storage:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao verificar saúde do storage",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // 🆕 MÉTODO: Listar imagens de perfil (admin/debug)
  async listProfileImages(req, res) {
    try {
      // 🔧 Verificar se usuário é admin (descomente e adicione sua lógica)
      // if (!req.user.isAdmin) {
      //   return res.status(403).json({
      //     success: false,
      //     message: "Acesso negado",
      //   });
      // }

      const images = await gcsService.listProfileImages();

      res.json({
        success: true,
        count: images.length,
        images: images,
      });
    } catch (error) {
      console.error("❌ Erro ao listar imagens:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao listar imagens",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = profileController;
