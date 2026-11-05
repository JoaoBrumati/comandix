const assert = require('node:assert/strict');
const test = require('node:test');
const { sendAdminLoginCode } = require('./admin-email');

test('sends an expiring access code with the configured SMTP account', async () => {
  const env = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer@example.com',
    SMTP_PASSWORD: 'smtp-secret',
    SMTP_FROM: 'Comandix <mailer@example.com>',
    SMTP_SECURE: 'false'
  };
  let transportOptions;
  let message;

  await sendAdminLoginCode('admin@example.com', '123456', env, options => {
    transportOptions = options;
    return { sendMail: async mail => { message = mail; } };
  });

  assert.deepEqual(transportOptions, {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: { user: 'mailer@example.com', pass: 'smtp-secret' }
  });
  assert.equal(message.from, 'Comandix <mailer@example.com>');
  assert.equal(message.to, 'admin@example.com');
  assert.match(message.text, /123456/);
  assert.match(message.text, /10 minutos/);
});

test('reports incomplete SMTP configuration rather than silently skipping the code email', async () => {
  await assert.rejects(
    sendAdminLoginCode('admin@example.com', '123456', {}),
    /Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD/
  );
});
