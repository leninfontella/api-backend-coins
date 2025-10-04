const User = require("../models/User");
const path = require("path");
const fs = require("fs");

const profileController = {
  // Atualizar perfil completo (com validação de proprietário)
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { name, email, phone } = req.body;

      // Buscar usuário atual
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

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
        user.removeOldProfilePhoto();

        user.profilePhoto = {
          filename: req.processedImage.filename,
          path: req.processedImage.path,
          uploadDate: new Date(),
        };
      }

      // Atualizar apenas dados básicos validados
      if (name && name.trim()) user.name = name.trim();
      if (email && email.trim()) user.email = email.trim().toLowerCase();
      if (phone !== undefined) user.phone = phone.trim();

      await user.save();

      // Preparar dados atualizados do usuário para resposta
      const updatedUser = {
        id: user._id,
        name: user.name,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profilePhotoUrl: user.profilePhotoUrl,
        avatar: user.avatar,
        institution: user.institution,
        coins: user.coins,
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
        message: "Perfil atualizado com sucesso!",
        user: updatedUser,
        profilePhoto: req.processedImage
          ? {
              url: user.profilePhotoUrl,
              filename: user.profilePhoto.filename,
            }
          : undefined,
      });
    } catch (error) {
      console.error("Erro ao atualizar o perfil:", error);

      // Se houve erro e uma imagem foi processada, remover o arquivo
      if (req.processedImage) {
        const filepath = path.join(
          __dirname,
          "../uploads/profiles",
          req.processedImage.filename
        );
        fs.unlink(filepath, (err) => {
          if (err) console.log("Erro ao remover arquivo após falha:", err);
        });
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

  // 🔧 NOVO MÉTODO: Upload apenas da foto (sem outros dados)
  async uploadProfilePhoto(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        // Remover arquivo se usuário não existe
        if (req.processedImage) {
          const filepath = path.join(
            __dirname,
            "../uploads/profiles",
            req.processedImage.filename
          );
          fs.unlink(filepath, (err) => {
            if (err) console.log("Erro ao remover arquivo:", err);
          });
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

      // Remover foto antiga
      user.removeOldProfilePhoto();

      // Salvar nova foto no banco (APENAS A FOTO, sem tocar em outros campos)
      user.profilePhoto = {
        filename: req.processedImage.filename,
        path: req.processedImage.path,
        uploadDate: new Date(),
      };

      await user.save();

      res.status(200).json({
        success: true,
        message: "Foto de perfil atualizada com sucesso!",
        profilePhoto: {
          url: user.profilePhotoUrl,
          filename: user.profilePhoto.filename,
        },
        user: {
          id: user._id,
          profilePhotoUrl: user.profilePhotoUrl,
        },
      });
    } catch (error) {
      console.error("Erro no upload da foto:", error);

      // Remover arquivo em caso de erro
      if (req.processedImage) {
        const filepath = path.join(
          __dirname,
          "../uploads/profiles",
          req.processedImage.filename
        );
        fs.unlink(filepath, (err) => {
          if (err) console.log("Erro ao remover arquivo:", err);
        });
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

      // Remover arquivo físico
      user.removeOldProfilePhoto();

      // Limpar dados no banco
      user.profilePhoto = {
        filename: null,
        path: null,
        uploadDate: null,
      };

      await user.save();

      res.json({
        success: true,
        message: "Foto de perfil removida com sucesso",
        user: {
          id: user._id,
          profilePhotoUrl: null,
        },
      });
    } catch (error) {
      console.error("Erro ao remover foto de perfil:", error);
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

      const userData = {
        id: user._id,
        name: user.name,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profilePhotoUrl: user.profilePhotoUrl,
        avatar: user.avatar,
        institution: user.institution,
        coins: user.coins,
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

      res.json({
        success: true,
        user: userData,
      });
    } catch (error) {
      console.error("Erro ao obter perfil:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = profileController;
