const User = require("../models/User");
const path = require("path");
const fs = require("fs");

const profileController = {
  // Atualizar perfil com foto
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

      // Se há uma nova foto, remover a anterior
      if (req.processedImage) {
        user.removeOldProfilePhoto();

        user.profilePhoto = {
          filename: req.processedImage.filename,
          path: req.processedImage.path,
          uploadDate: new Date(),
        };
      }

      // Atualizar dados básicos
      if (name) user.name = name;
      if (email) user.email = email;
      if (phone) user.phone = phone;

      // O comando abaixo garante que o Mongoose não valide o 'level'
      // ao salvar, pois ele não deve ser alterado aqui.
      // O 'validateModifiedOnly' pode ser usado no modelo para validação mais seletiva.
      await user.save();

      // Corrigido: Retorna o objeto de usuário atualizado para o frontend
      res.json({
        success: true,
        message: "Perfil atualizado com sucesso!",
        user: user.toObject(),
      });
    } catch (error) {
      console.error("Erro ao atualizar o perfil:", error);
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

      // Salvar nova foto no banco
      user.profilePhoto = {
        filename: req.processedImage.filename,
        path: req.processedImage.path,
        uploadDate: new Date(),
      };

      await user.save();

      // Retornar a URL completa da imagem para o frontend
      const profilePhotoUrl = `/uploads/profiles/${user.profilePhoto.filename}`;

      res.status(200).json({
        success: true,
        message: "Foto de perfil atualizada com sucesso!",
        profilePhoto: {
          url: profilePhotoUrl,
          filename: user.profilePhoto.filename,
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
};

module.exports = profileController;
