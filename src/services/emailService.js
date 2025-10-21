// src/services/emailService.js
const sgMail = require("@sendgrid/mail");
const nodemailer = require("nodemailer");

// ========== CONFIGURAÇÃO ==========

// Configurar SendGrid se disponível
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log("✅ SendGrid configurado");
}

// Fallback: Gmail (para desenvolvimento local)
const createGmailTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
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

// ========== VERIFICAÇÃO ==========

const isEmailConfigured = () => {
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const hasGmail = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

  return hasSendGrid || hasGmail;
};

const getEmailProvider = () => {
  if (process.env.SENDGRID_API_KEY) {
    return "sendgrid";
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return "gmail";
  }
  return null;
};

// ========== ENVIO DE EMAIL ==========

const sendEmailViaSendGrid = async (mailOptions) => {
  const msg = {
    to: mailOptions.to,
    from: process.env.EMAIL_FROM || "noreply@altrum.com", // Email verificado no SendGrid
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
  };

  console.log("📧 Enviando via SendGrid para:", mailOptions.to);

  const result = await sgMail.send(msg);

  console.log("✅ Email enviado via SendGrid:", {
    statusCode: result[0].statusCode,
    to: mailOptions.to,
  });

  return {
    success: true,
    messageId: result[0].headers["x-message-id"],
    provider: "sendgrid",
  };
};

const sendEmailViaGmail = async (mailOptions) => {
  console.log("📧 Enviando via Gmail para:", mailOptions.to);

  const transporter = createGmailTransporter();
  const info = await transporter.sendMail(mailOptions);

  console.log("✅ Email enviado via Gmail:", {
    messageId: info.messageId,
    accepted: info.accepted,
  });

  return {
    success: true,
    messageId: info.messageId,
    provider: "gmail",
  };
};

const sendEmail = async (mailOptions, retries = 1) => {
  if (!isEmailConfigured()) {
    console.error("❌ Nenhum provedor de email configurado");
    throw new Error("Email não configurado no servidor");
  }

  const provider = getEmailProvider();
  console.log(`📬 Provedor de email: ${provider}`);

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (provider === "sendgrid") {
        return await sendEmailViaSendGrid(mailOptions);
      } else if (provider === "gmail") {
        return await sendEmailViaGmail(mailOptions);
      }
    } catch (error) {
      lastError = error;
      console.error(
        `❌ Tentativa ${attempt}/${retries} falhou:`,
        error.message
      );

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  console.error("❌ Todas as tentativas de envio falharam:", lastError);
  throw lastError;
};

// ========== TEMPLATES ==========

const sendPasswordResetCode = async (user, code) => {
  const mailOptions = {
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

const sendPasswordChangedConfirmation = async (user) => {
  const mailOptions = {
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
    text: `
Olá, ${user.name}!

Sua senha foi alterada com sucesso!

Data: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
Método: Recuperação por email

Não foi você? Entre em contato imediatamente com nosso suporte.

Por segurança, você precisará fazer login novamente em todos os dispositivos.

© ${new Date().getFullYear()} Altrum Coins
    `.trim(),
  };

  return await sendEmail(mailOptions);
};

module.exports = {
  sendPasswordResetCode,
  sendPasswordChangedConfirmation,
  isEmailConfigured,
  getEmailProvider,
};
