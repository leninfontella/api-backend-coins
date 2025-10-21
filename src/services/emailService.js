// src/services/emailService.js
const nodemailer = require("nodemailer");

// Configurar transportador com timeout e configurações otimizadas
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587, // Porta TLS (melhor compatibilidade)
    secure: false, // true para 465, false para outras portas
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // Aceitar certificados auto-assinados
      ciphers: "SSLv3",
    },
    connectionTimeout: 10000, // 10 segundos
    greetingTimeout: 10000,
    socketTimeout: 15000,
    debug: process.env.NODE_ENV === "development", // Logs detalhados
    logger: process.env.NODE_ENV === "development", // Logger ativo
  });
};

// Fallback: usar porta 465 (SSL)
const createSecureTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

// Verificar se email está configurado
const isEmailConfigured = () => {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
};

// Enviar email com retry automático
const sendEmail = async (mailOptions, retries = 2) => {
  if (!isEmailConfigured()) {
    console.error("❌ Credenciais de email não configuradas no .env");
    throw new Error("Email não configurado no servidor");
  }

  let lastError;
  const transporters = [createTransporter(), createSecureTransporter()];

  // Tentar com cada transportador
  for (const transporter of transporters) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(
          `📧 Tentativa ${attempt}/${retries} - Porta: ${transporter.options.port}`
        );

        const info = await transporter.sendMail(mailOptions);

        console.log("✅ Email enviado com sucesso:", {
          messageId: info.messageId,
          accepted: info.accepted,
          response: info.response,
        });

        return {
          success: true,
          messageId: info.messageId,
        };
      } catch (error) {
        lastError = error;
        console.error(
          `❌ Tentativa ${attempt} falhou (porta ${transporter.options.port}):`,
          error.message
        );

        // Aguardar antes de tentar novamente
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  // Se todas as tentativas falharem
  console.error("❌ Todas as tentativas de envio falharam:", lastError);
  throw lastError;
};

// Template: Código de Recuperação
const sendPasswordResetCode = async (user, code) => {
  const mailOptions = {
    from: `"Altrum Coins" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Código de Recuperação de Senha - Altrum",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6; 
            color: #333; 
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px 30px; 
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
          }
          .content { 
            padding: 40px 30px;
          }
          .code-box { 
            background: #f8f9fa;
            padding: 30px; 
            text-align: center; 
            border: 2px dashed #667eea; 
            border-radius: 12px; 
            margin: 30px 0;
          }
          .code { 
            font-size: 42px; 
            font-weight: bold; 
            color: #667eea; 
            letter-spacing: 12px; 
            font-family: 'Courier New', monospace;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
          }
          .warning { 
            background: #fff3cd; 
            border-left: 4px solid #ffc107; 
            padding: 15px; 
            margin: 20px 0; 
            border-radius: 4px;
          }
          .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer { 
            background: #f8f9fa;
            text-align: center; 
            color: #666; 
            font-size: 13px; 
            padding: 20px;
            border-top: 1px solid #e0e0e0;
          }
          ol {
            padding-left: 20px;
          }
          li {
            margin: 8px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Recuperação de Senha</h1>
          </div>
          <div class="content">
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta Altrum.</p>
            
            <div class="code-box">
              <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">Seu código de verificação é:</p>
              <div class="code">${code}</div>
            </div>

            <div class="warning">
              <strong>⏱️ Este código expira em 15 minutos</strong>
            </div>

            <div class="info-box">
              <p style="margin: 0 0 10px 0;"><strong>📋 Como usar:</strong></p>
              <ol style="margin: 0; padding-left: 20px;">
                <li>Acesse a página de recuperação de senha</li>
                <li>Insira o código acima</li>
                <li>Crie sua nova senha segura</li>
              </ol>
            </div>

            <div class="warning">
              <strong>⚠️ Não solicitou esta alteração?</strong><br>
              Ignore este email. Sua senha permanecerá inalterada e segura.
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Se tiver problemas, entre em contato com nosso suporte.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} Altrum Coins - Sistema de Doações</p>
            <p style="margin: 5px 0; color: #999;">Este é um email automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Olá, ${user.name}!

Recebemos uma solicitação para redefinir a senha da sua conta Altrum.

Seu código de verificação é: ${code}

Este código expira em 15 minutos.

Como usar:
1. Acesse a página de recuperação de senha
2. Insira o código acima
3. Crie sua nova senha segura

Não solicitou esta alteração? Ignore este email.

© ${new Date().getFullYear()} Altrum Coins
    `.trim(),
  };

  return await sendEmail(mailOptions);
};

// Template: Confirmação de Senha Alterada
const sendPasswordChangedConfirmation = async (user) => {
  const mailOptions = {
    from: `"Altrum Coins" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Senha Alterada com Sucesso - Altrum",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6; 
            color: #333; 
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%); 
            color: white; 
            padding: 40px 30px; 
            text-align: center;
          }
          .content { 
            padding: 40px 30px;
          }
          .success { 
            background: #d4edda; 
            border-left: 4px solid #28a745; 
            padding: 15px; 
            margin: 20px 0; 
            border-radius: 4px;
          }
          .warning { 
            background: #fff3cd; 
            border-left: 4px solid #ffc107; 
            padding: 15px; 
            margin: 20px 0; 
            border-radius: 4px;
          }
          .footer { 
            background: #f8f9fa;
            text-align: center; 
            color: #666; 
            font-size: 13px; 
            padding: 20px;
            border-top: 1px solid #e0e0e0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Senha Alterada</h1>
          </div>
          <div class="content">
            <p>Olá, <strong>${user.name}</strong>!</p>
            
            <div class="success">
              <strong>✓ Sua senha foi alterada com sucesso!</strong>
            </div>

            <p><strong>Detalhes da alteração:</strong></p>
            <ul>
              <li>Data: ${new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}</li>
              <li>Método: Recuperação por email</li>
            </ul>

            <div class="warning">
              <strong>⚠️ Não foi você?</strong><br>
              Se você não realizou esta alteração, entre em contato <strong>imediatamente</strong> com nosso suporte.
            </div>

            <p>Por segurança, você precisará fazer login novamente em todos os dispositivos.</p>
          </div>
          <div class="footer">
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} Altrum Coins</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  return await sendEmail(mailOptions);
};

module.exports = {
  sendPasswordResetCode,
  sendPasswordChangedConfirmation,
  isEmailConfigured,
};
