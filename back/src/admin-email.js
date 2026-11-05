const nodemailer = require('nodemailer');

async function sendAdminLoginCode(email, code, env = process.env, createTransport = nodemailer.createTransport) {
  const host = env.SMTP_HOST || '';
  const user = env.SMTP_USER || '';
  const password = env.SMTP_PASSWORD || '';
  const from = env.SMTP_FROM || user;
  const port = Number(env.SMTP_PORT || 587);
  if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD e SMTP_FROM para enviar códigos de acesso.');
  }

  const transporter = createTransport({
    host,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: { user, pass: password }
  });
  await transporter.sendMail({
    from,
    to: email,
    subject: 'Seu código de acesso ao Comandix',
    text: `Seu código de segurança é ${code}. Ele expira em 10 minutos e só pode ser usado uma vez. Se você não solicitou este acesso, ignore esta mensagem.`
  });
}

module.exports = { sendAdminLoginCode };
