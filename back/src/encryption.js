const crypto = require('crypto');

function getKey() {
  const value = process.env.DATA_ENCRYPTION_KEY || '';
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('Configure DATA_ENCRYPTION_KEY com 32 bytes codificados em Base64.');
  return key;
}

function encryptBuffer(value) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(value)), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
}

function decryptBuffer(value) {
  const payload = JSON.parse(value);
  if (payload.version !== 1) throw new Error('Formato de dado cifrado não suportado.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
}

function encryptJson(value) {
  return encryptBuffer(Buffer.from(JSON.stringify(value), 'utf8'));
}

function decryptJson(value) {
  return JSON.parse(decryptBuffer(value).toString('utf8'));
}

function hashCpf(value) {
  return crypto.createHmac('sha256', getKey()).update(value).digest('hex');
}

module.exports = { decryptBuffer, decryptJson, encryptBuffer, encryptJson, hashCpf };
