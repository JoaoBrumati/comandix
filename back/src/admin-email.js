const nodemailer = require('nodemailer');

function getAdminEmailErrorMessage(error) {
  if (error.code === 'EAUTH' || error.responseCode === 535 || error.responseCode === 530) {
    return 'A Microsoft recusou a autenticação SMTP. Confira SMTP_USER e SMTP_PASSWORD e verifique com o administrador do Microsoft 365 se o SMTP AUTH está habilitado para a caixa postal.';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(error.code)) {
    return 'Não foi possível conectar ao servidor SMTP. Confira SMTP_HOST, SMTP_PORT e SMTP_SECURE.';
  }
  if (error.code === 'EENVELOPE' || (Number(error.responseCode) >= 500 && Number(error.responseCode) < 600)) {
    return 'O servidor SMTP recusou o remetente ou o destinatário. Confira ADMIN_EMAIL e, se definido, SMTP_FROM.';
  }
  if (error.code === 'SMTP_CONFIG') {
    return error.message;
  }
  return 'Não foi possível enviar o código pelo SMTP. Confira as variáveis SMTP da Vercel e os logs da função para identificar a causa.';
}

async function sendAdminLoginCode(email, code, env = process.env, createTransport = nodemailer.createTransport) {
  const host = env.SMTP_HOST || '';
  const user = env.SMTP_USER || '';
  const password = env.SMTP_PASSWORD || '';
  const from = env.SMTP_FROM || user;
  const port = Number(env.SMTP_PORT || 587);
  if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASSWORD. SMTP_FROM é opcional.');
    error.code = 'SMTP_CONFIG';
    throw error;
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

module.exports = { getAdminEmailErrorMessage, sendAdminLoginCode };
