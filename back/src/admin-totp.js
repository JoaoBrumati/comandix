const crypto = require('crypto');

const periodSeconds = 30;
const codeDigits = 6;

function encodeBase32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  const result = [];
  for (const character of value.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Segredo TOTP inválido.');
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      result.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}

function createTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function generateTotp(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24)
    | ((digest[offset + 1] & 255) << 16)
    | ((digest[offset + 2] & 255) << 8)
    | (digest[offset + 3] & 255);
  return String(binary % (10 ** codeDigits)).padStart(codeDigits, '0');
}

function verifyTotp(secret, code, timestamp = Date.now(), lastUsedCounter = -1) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const currentCounter = Math.floor(timestamp / 1000 / periodSeconds);
  for (const counter of [currentCounter, currentCounter - 1, currentCounter + 1]) {
    if (counter <= lastUsedCounter || counter < 0) continue;
    const expected = Buffer.from(generateTotp(secret, counter));
    const submitted = Buffer.from(code);
    if (crypto.timingSafeEqual(expected, submitted)) return counter;
  }
  return null;
}

function createAuthenticatorUri(secret, label, issuer = 'Comandix') {
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(codeDigits),
    period: String(periodSeconds)
  });
  return `otpauth://totp/${encodedLabel}?${parameters.toString()}`;
}

function createRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(8).toString('hex').toUpperCase());
}

function hashRecoveryCode(code) {
  const normalized = String(code || '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{16}$/.test(normalized)) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = {
  createAuthenticatorUri,
  createRecoveryCodes,
  createTotpSecret,
  generateTotp,
  hashRecoveryCode,
  verifyTotp
};
