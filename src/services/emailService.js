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
    subject: "🔐 Código de Recuperação - Altrum Coins",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body { 
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6; 
            color: #ffffff; 
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          }
          
          .email-wrapper {
            width: 100%;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            padding: 40px 20px;
          }
          
          .container { 
            max-width: 600px; 
            margin: 0 auto;
            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 212, 255, 0.2);
            border: 2px solid rgba(0, 212, 255, 0.3);
          }
          
          .header { 
            background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
            padding: 50px 40px;
            text-align: center;
            position: relative;
            overflow: hidden;
          }
          
          .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            animation: shimmer 3s infinite;
          }
          
          @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          
          .header-icon {
            font-size: 56px;
            margin-bottom: 15px;
            filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
          }
          
          .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 800;
            color: #0a0a0a;
            text-shadow: 0 2px 4px rgba(255, 255, 255, 0.1);
            letter-spacing: -0.5px;
          }
          
          .content { 
            padding: 50px 40px;
            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
          }
          
          .greeting {
            font-size: 18px;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 10px;
          }
          
          .greeting strong {
            color: #00d4ff;
            font-weight: 700;
          }
          
          .intro-text {
            font-size: 16px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 35px;
            line-height: 1.6;
          }
          
          .code-box { 
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            padding: 40px;
            text-align: center;
            border: 3px solid #00d4ff;
            border-radius: 20px;
            margin: 35px 0;
            position: relative;
            box-shadow: 0 10px 40px rgba(0, 212, 255, 0.3), 
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
          
          .code-box::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, transparent, #00d4ff, #00ff88, #00d4ff, transparent);
            animation: glow 2s ease-in-out infinite;
          }
          
          @keyframes glow {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          
          .code-label {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.6);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 15px;
            font-weight: 600;
          }
          
          .code { 
            font-size: 48px;
            font-weight: 900;
            color: #00d4ff;
            letter-spacing: 16px;
            font-family: 'Courier New', monospace;
            text-shadow: 0 0 20px rgba(0, 212, 255, 0.6),
                         0 0 40px rgba(0, 212, 255, 0.3);
            padding: 10px 0;
          }
          
          .alert-box {
            background: linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 153, 204, 0.15) 100%);
            border: 2px solid rgba(0, 212, 255, 0.4);
            border-radius: 16px;
            padding: 20px;
            margin: 25px 0;
            display: flex;
            align-items: center;
            gap: 15px;
          }
          
          .alert-icon {
            font-size: 24px;
            flex-shrink: 0;
          }
          
          .alert-content {
            flex: 1;
          }
          
          .alert-title {
            font-size: 16px;
            font-weight: 700;
            color: #00d4ff;
            margin-bottom: 5px;
          }
          
          .alert-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            line-height: 1.5;
          }
          
          .info-box {
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border: 2px solid rgba(0, 212, 255, 0.2);
            border-radius: 16px;
            padding: 25px;
            margin: 25px 0;
          }
          
          .info-title {
            font-size: 15px;
            font-weight: 700;
            color: #00d4ff;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .steps {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .steps li {
            padding: 12px 0;
            padding-left: 35px;
            position: relative;
            font-size: 15px;
            color: rgba(255, 255, 255, 0.8);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }
          
          .steps li:last-child {
            border-bottom: none;
          }
          
          .steps li::before {
            content: attr(data-step);
            position: absolute;
            left: 0;
            top: 12px;
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #00d4ff, #0099cc);
            color: #0a0a0a;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
          }
          
          .warning-box {
            background: linear-gradient(135deg, rgba(255, 100, 100, 0.15) 0%, rgba(200, 50, 50, 0.15) 100%);
            border: 2px solid rgba(255, 100, 100, 0.4);
            border-radius: 16px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .warning-title {
            font-size: 16px;
            font-weight: 700;
            color: #ff6464;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .warning-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            line-height: 1.6;
          }
          
          .footer-note {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.5);
            text-align: center;
            margin-top: 35px;
            padding-top: 25px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .footer { 
            background: linear-gradient(135deg, #0f0f0f 0%, #0a0a0a 100%);
            text-align: center;
            padding: 30px 40px;
            border-top: 2px solid rgba(0, 212, 255, 0.2);
          }
          
          .footer-logo {
            font-size: 28px;
            font-weight: 900;
            background: linear-gradient(135deg, #00d4ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 15px;
          }
          
          .footer-text {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.4);
            margin: 8px 0;
          }
          
          .footer-year {
            color: #00d4ff;
            font-weight: 600;
          }
          
          /* Responsivo */
          @media only screen and (max-width: 600px) {
            .email-wrapper {
              padding: 20px 10px;
            }
            
            .content {
              padding: 35px 25px;
            }
            
            .header {
              padding: 40px 25px;
            }
            
            .header h1 {
              font-size: 26px;
            }
            
            .code {
              font-size: 36px;
              letter-spacing: 10px;
            }
            
            .code-box {
              padding: 30px 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="header-icon">🔐</div>
              <h1>Recuperação de Senha</h1>
            </div>
            
            <div class="content">
              <p class="greeting">Olá, <strong>${user.name}</strong>!</p>
              <p class="intro-text">
                Recebemos uma solicitação para redefinir a senha da sua conta Altrum Coins. 
                Use o código abaixo para continuar com a recuperação.
              </p>
              
              <div class="code-box">
                <div class="code-label">Seu Código de Verificação</div>
                <div class="code">${code}</div>
              </div>

              <div class="alert-box">
                <div class="alert-icon">⏱️</div>
                <div class="alert-content">
                  <div class="alert-title">Atenção: Código Temporário</div>
                  <div class="alert-text">Este código expira em <strong>15 minutos</strong>. Use-o rapidamente para garantir sua segurança.</div>
                </div>
              </div>

              <div class="info-box">
                <div class="info-title">📋 Como usar o código</div>
                <ol class="steps">
                  <li data-step="1">Acesse a página de recuperação de senha</li>
                  <li data-step="2">Insira o código de verificação acima</li>
                  <li data-step="3">Crie sua nova senha segura</li>
                </ol>
              </div>

              <div class="warning-box">
                <div class="warning-title">⚠️ Não solicitou esta alteração?</div>
                <div class="warning-text">
                  Se você não solicitou a recuperação de senha, ignore este email. 
                  Sua senha permanecerá inalterada e sua conta continuará segura.
                </div>
              </div>

              <p class="footer-note">
                Em caso de dúvidas ou problemas, entre em contato com nosso suporte.
              </p>
            </div>
            
            <div class="footer">
              <div class="footer-logo">ALTRUM COINS</div>
              <p class="footer-text">
                © <span class="footer-year">${new Date().getFullYear()}</span> Altrum Coins - Sistema de Doações
              </p>
              <p class="footer-text">Este é um email automático, não responda.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
🔐 RECUPERAÇÃO DE SENHA - ALTRUM COINS

Olá, ${user.name}!

Recebemos uma solicitação para redefinir a senha da sua conta Altrum.

═══════════════════════════════════
SEU CÓDIGO DE VERIFICAÇÃO
═══════════════════════════════════

${code}

⏱️ ATENÇÃO: Este código expira em 15 minutos

═══════════════════════════════════
COMO USAR
═══════════════════════════════════

1. Acesse a página de recuperação de senha
2. Insira o código de verificação acima
3. Crie sua nova senha segura

⚠️ NÃO SOLICITOU ESTA ALTERAÇÃO?
Ignore este email. Sua senha permanecerá inalterada.

───────────────────────────────────

© ${new Date().getFullYear()} Altrum Coins - Sistema de Doações
Este é um email automático, não responda.
    `.trim(),
  };

  return await sendEmail(mailOptions);
};

const sendPasswordChangedConfirmation = async (user) => {
  const mailOptions = {
    to: user.email,
    subject: "✅ Senha Alterada com Sucesso - Altrum Coins",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body { 
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6; 
            color: #ffffff; 
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          }
          
          .email-wrapper {
            width: 100%;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            padding: 40px 20px;
          }
          
          .container { 
            max-width: 600px; 
            margin: 0 auto;
            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 255, 136, 0.2);
            border: 2px solid rgba(0, 255, 136, 0.3);
          }
          
          .header { 
            background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%);
            padding: 50px 40px;
            text-align: center;
            position: relative;
            overflow: hidden;
          }
          
          .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            animation: shimmer 3s infinite;
          }
          
          @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          
          .header-icon {
            font-size: 64px;
            margin-bottom: 15px;
            filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
            animation: success-pulse 2s ease-in-out infinite;
          }
          
          @keyframes success-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          
          .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 800;
            color: #0a0a0a;
            text-shadow: 0 2px 4px rgba(255, 255, 255, 0.1);
            letter-spacing: -0.5px;
          }
          
          .content { 
            padding: 50px 40px;
            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
          }
          
          .greeting {
            font-size: 18px;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 10px;
          }
          
          .greeting strong {
            color: #00ff88;
            font-weight: 700;
          }
          
          .success-box {
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.2) 0%, rgba(0, 204, 102, 0.2) 100%);
            border: 3px solid rgba(0, 255, 136, 0.5);
            border-radius: 20px;
            padding: 25px;
            margin: 30px 0;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 255, 136, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
          
          .success-icon {
            font-size: 48px;
            margin-bottom: 15px;
          }
          
          .success-title {
            font-size: 22px;
            font-weight: 800;
            color: #00ff88;
            margin-bottom: 8px;
            text-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
          }
          
          .success-text {
            font-size: 15px;
            color: rgba(255, 255, 255, 0.7);
          }
          
          .details-box {
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border: 2px solid rgba(0, 212, 255, 0.2);
            border-radius: 16px;
            padding: 25px;
            margin: 25px 0;
          }
          
          .details-title {
            font-size: 16px;
            font-weight: 700;
            color: #00d4ff;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .detail-item {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }
          
          .detail-item:last-child {
            border-bottom: none;
          }
          
          .detail-label {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.5);
          }
          
          .detail-value {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 600;
          }
          
          .warning-box {
            background: linear-gradient(135deg, rgba(255, 100, 100, 0.15) 0%, rgba(200, 50, 50, 0.15) 100%);
            border: 2px solid rgba(255, 100, 100, 0.4);
            border-radius: 16px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .warning-title {
            font-size: 16px;
            font-weight: 700;
            color: #ff6464;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .warning-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            line-height: 1.6;
          }
          
          .info-box {
            background: linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 153, 204, 0.1) 100%);
            border: 2px solid rgba(0, 212, 255, 0.3);
            border-radius: 16px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .info-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            display: flex;
            align-items: center;
            gap: 10px;
          }
          
          .info-icon {
            font-size: 20px;
            flex-shrink: 0;
          }
          
          .footer { 
            background: linear-gradient(135deg, #0f0f0f 0%, #0a0a0a 100%);
            text-align: center;
            padding: 30px 40px;
            border-top: 2px solid rgba(0, 255, 136, 0.2);
          }
          
          .footer-logo {
            font-size: 28px;
            font-weight: 900;
            background: linear-gradient(135deg, #00d4ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 15px;
          }
          
          .footer-text {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.4);
            margin: 8px 0;
          }
          
          .footer-year {
            color: #00ff88;
            font-weight: 600;
          }
          
          /* Responsivo */
          @media only screen and (max-width: 600px) {
            .email-wrapper {
              padding: 20px 10px;
            }
            
            .content {
              padding: 35px 25px;
            }
            
            .header {
              padding: 40px 25px;
            }
            
            .header h1 {
              font-size: 26px;
            }
            
            .success-title {
              font-size: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="header-icon">✅</div>
              <h1>Senha Alterada</h1>
            </div>
            
            <div class="content">
              <p class="greeting">Olá, <strong>${user.name}</strong>!</p>
              
              <div class="success-box">
                <div class="success-icon">🎉</div>
                <div class="success-title">Alteração Concluída!</div>
                <div class="success-text">
                  Sua senha foi atualizada com sucesso. Agora você pode fazer login com sua nova senha.
                </div>
              </div>

              <div class="details-box">
                <div class="details-title">📊 Detalhes da Alteração</div>
                <div class="detail-item">
                  <span class="detail-label">Data e Hora</span>
                  <span class="detail-value">${new Date().toLocaleString(
                    "pt-BR",
                    {
                      timeZone: "America/Sao_Paulo",
                    }
                  )}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Método</span>
                  <span class="detail-value">Recuperação por Email</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Status</span>
                  <span class="detail-value" style="color: #00ff88;">✓ Confirmado</span>
                </div>
              </div>

              <div class="warning-box">
                <div class="warning-title">⚠️ Não foi você?</div>
                <div class="warning-text">
                  Se você <strong>não realizou</strong> esta alteração, entre em contato 
                  <strong>imediatamente</strong> com nosso suporte. Sua segurança é nossa prioridade.
                </div>
              </div>

              <div class="info-box">
                <div class="info-text">
                  <span class="info-icon">🔒</span>
                  <span>Por segurança, você precisará fazer login novamente em todos os seus dispositivos.</span>
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-logo">ALTRUM COINS</div>
              <p class="footer-text">
                © <span class="footer-year">${new Date().getFullYear()}</span> Altrum Coins - Sistema de Doações
              </p>
              <p class="footer-text">Este é um email automático, não responda.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
✅ SENHA ALTERADA COM SUCESSO - ALTRUM COINS

Olá, ${user.name}!

🎉 Sua senha foi alterada com sucesso!

═══════════════════════════════════
DETALHES DA ALTERAÇÃO
═══════════════════════════════════

Data e Hora: ${new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    })}
Método: Recuperação por Email
Status: ✓ Confirmado

⚠️ NÃO FOI VOCÊ?
Se você não realizou esta alteração, entre em contato 
IMEDIATAMENTE com nosso suporte.

🔒 IMPORTANTE
Por segurança, você precisará fazer login novamente 
em todos os seus dispositivos.

───────────────────────────────────

© ${new Date().getFullYear()} Altrum Coins - Sistema de Doações
Este é um email automático, não responda.
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
