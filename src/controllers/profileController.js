const User = require("../models/User");
const path = require("path");
const fs = require("fs");

// FUNÇÃO AUXILIAR: Gerar URL completa com timestamp para mobile
const getPhotoUrlWithCacheBusting = (photoPath, req) => {
  if (!photoPath) return null;

  const baseURL = process.env.API_URL || `${req.protocol}://${req.get("host")}`;
  const fullUrl = `${baseURL}${photoPath}`;

  // Cache busting agressivo para mobile
  const timestamp = Date.now();
  const cacheBuster = Math.random().toString(36).substring(7);

  return `${fullUrl}?t=${timestamp}&v=${cacheBuster}&mobile=1`;
};

const profileController = {
  // Atualizar perfil completo (com validação de proprietário)
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { name, email, phone } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado",
        });
      }

      // Validação de email
      if (email && email.toLowerCase() !== user.email.toLowerCase()) {
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

      // Se há nova foto, remover a anterior
      if (req.processedImage) {
        user.removeOldProfilePhoto();

        user.profilePhoto = {
          filename: req.processedImage.filename,
          path: req.processedImage.path,
          uploadDate: new Date(),
        };
      }

      // Atualizar dados básicos
      if (name && name.trim()) user.name = name.trim();
      if (email && email.trim()) user.email = email.trim().toLowerCase();
      if (phone !== undefined) user.phone = phone.trim();

      await user.save();

      // CRÍTICO: Preparar resposta com cache busting
      const timestamp = Date.now();
      const cacheBuster = Math.random().toString(36).substring(7);

      const updatedUser = {
        id: user._id,
        name: user.name,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profilePhotoUrl: user.profilePhotoUrl
          ? getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req)
          : null,
        avatar: user.profilePhotoUrl
          ? getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req)
          : null,
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
        // CRÍTICO: Adicionar timestamp e cacheBuster
        photoTimestamp: timestamp,
        cacheBuster: cacheBuster,
      };

      res.json({
        success: true,
        message: "Perfil atualizado com sucesso!",
        user: updatedUser,
        profilePhoto: req.processedImage
          ? {
              url: getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req),
              filename: user.profilePhoto.filename,
              timestamp: timestamp,
              cacheBuster: cacheBuster,
            }
          : undefined,
      });
    } catch (error) {
      console.error("Erro ao atualizar o perfil:", error);

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

  // Upload apenas da foto
  async uploadProfilePhoto(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
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

      // Salvar nova foto
      user.profilePhoto = {
        filename: req.processedImage.filename,
        path: req.processedImage.path,
        uploadDate: new Date(),
      };

      await user.save();

      // CRÍTICO: Resposta com cache busting
      const timestamp = Date.now();
      const cacheBuster = Math.random().toString(36).substring(7);

      res.status(200).json({
        success: true,
        message: "Foto de perfil atualizada com sucesso!",
        profilePhoto: {
          url: getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req),
          filename: user.profilePhoto.filename,
          timestamp: timestamp,
          cacheBuster: cacheBuster,
        },
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          profilePhotoUrl: getPhotoUrlWithCacheBusting(
            user.profilePhotoUrl,
            req
          ),
          avatar: getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req),
          photoTimestamp: timestamp,
          cacheBuster: cacheBuster,
        },
      });
    } catch (error) {
      console.error("Erro no upload da foto:", error);

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

      user.removeOldProfilePhoto();

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
          name: user.name,
          email: user.email,
          profilePhotoUrl: null,
          avatar: null,
          photoTimestamp: Date.now(),
          cacheBuster: Math.random().toString(36).substring(7),
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

      // CRÍTICO: Adicionar cache busting na resposta
      const timestamp = Date.now();
      const cacheBuster = Math.random().toString(36).substring(7);

      const userData = {
        id: user._id,
        name: user.name,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profilePhotoUrl: user.profilePhotoUrl
          ? getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req)
          : null,
        avatar: user.profilePhotoUrl
          ? getPhotoUrlWithCacheBusting(user.profilePhotoUrl, req)
          : null,
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
        // CRÍTICO: Adicionar para mobile
        photoTimestamp: timestamp,
        cacheBuster: cacheBuster,
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
