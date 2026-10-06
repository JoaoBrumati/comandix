const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PASSWORD_HASH_PREFIX = '$scrypt$';
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const failedLoginAttempts = new Map();
const blockedIpStore = new Map();

function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('A senha não pode estar vazia.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex');
  return `${PASSWORD_HASH_PREFIX}${salt}$${hash}`;
}

function verifyPassword(candidate, storedHash) {
  if (typeof candidate !== 'string' || typeof storedHash !== 'string' || !storedHash.startsWith(PASSWORD_HASH_PREFIX)) {
    return false;
  }

  const encoded = storedHash.slice(PASSWORD_HASH_PREFIX.length);
  const [salt, hash] = encoded.split('$');
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(candidate, salt, 64, SCRYPT_OPTIONS);

  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function buildAdminCookie(sessionToken, isProduction = process.env.NODE_ENV === 'production') {
  return `comandix_admin=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${isProduction ? '; Secure' : ''}`;
}

function buildCsrfCookie(csrfToken, isProduction = process.env.NODE_ENV === 'production') {
  return `comandix_csrf=${encodeURIComponent(csrfToken)}; SameSite=Strict; Path=/; Max-Age=28800${isProduction ? '; Secure' : ''}`;
}

function clearAdminCookie() {
  return 'comandix_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

function clearCsrfCookie() {
  return 'comandix_csrf=; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

function cookieValue(request, name) {
  const entry = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function base32ToBuffer(secret) {
  const cleaned = String(secret || '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const character of cleaned) {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotpCode(secret, now = Date.now()) {
  const cleaned = String(secret || '').trim();
  if (!cleaned) return '000000';
  const counter = Math.floor(now / 30000);
  const key = base32ToBuffer(cleaned);
  const buffer = Buffer.alloc(8);
  let value = counter;
  for (let index = 7; index >= 0; index -= 1) {
    buffer[index] = value & 0xff;
    value = Math.floor(value / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function verifyTotpCode(secret, code, now = Date.now()) {
  const normalized = String(code || '').replace(/\D/g, '');
  if (!/\d{6}/.test(normalized)) return false;
  return [0, -30000, 30000].some(offset => generateTotpCode(secret, now + offset) === normalized);
}

function normalizeIp(value = '') {
  const raw = String(value || '').split(',')[0].trim();
  return raw.replace(/^::ffff:/, '');
}

function getClientIp(request) {
  const forwardedFor = request?.get ? request.get('x-forwarded-for') : '';
  if (forwardedFor) return normalizeIp(forwardedFor);
  return normalizeIp(request?.ip || request?.socket?.remoteAddress || 'unknown');
}

function recordFailedLogin(ip, options = {}) {
  const safeIp = normalizeIp(ip);
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  const blockMs = options.blockMs ?? 30 * 60 * 1000;
  const now = Date.now();
  const previous = failedLoginAttempts.get(safeIp) || [];
  const recent = previous.filter(timestamp => now - timestamp <= windowMs);
  recent.push(now);
  failedLoginAttempts.set(safeIp, recent);
  if (recent.length >= maxAttempts) {
    blockedIpStore.set(safeIp, now + blockMs);
    return 'blocked';
  }
  return 'recorded';
}

function isBlockedIp(ip, options = {}) {
  const safeIp = normalizeIp(ip);
  const now = Date.now();
  const blockUntil = blockedIpStore.get(safeIp);
  if (!blockUntil) return false;
  if (now >= blockUntil) {
    blockedIpStore.delete(safeIp);
    failedLoginAttempts.delete(safeIp);
    return false;
  }
  return true;
}

function clearFailedLogin(ip) {
  const safeIp = normalizeIp(ip);
  failedLoginAttempts.delete(safeIp);
  blockedIpStore.delete(safeIp);
}

function logAdminAuditEvent(eventName, request, details = {}) {
  const logDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const auditEntry = {
    timestamp: new Date().toISOString(),
    event: eventName,
    ip: normalizeIp(getClientIp(request)),
    method: request?.method || 'UNKNOWN',
    url: request?.originalUrl || request?.url || '',
    ...details
  };
  const line = `${JSON.stringify(auditEntry)}\n`;
  fs.appendFileSync(path.join(logDir, 'admin-audit.log'), line, 'utf8');
  return line.trim();
}

function findRecentAuditLogs(limit = 20) {
  const logPath = path.join(__dirname, '..', 'logs', 'admin-audit.log');
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-limit).map(line => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}

function isAllowedAdminIp(ip, allowedConfig = process.env.ADMIN_ALLOWED_IPS || '') {
  const safeAllowed = String(allowedConfig || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!safeAllowed.length) return true;
  const safeIp = normalizeIp(ip);
  return safeAllowed.includes(safeIp);
}

function buildSecurityAlertPayload(event, ip, details = {}) {
  return {
    event,
    ip: normalizeIp(ip),
    timestamp: new Date().toISOString(),
    message: `${event} detected from ${normalizeIp(ip)}`,
    ...details
  };
}

function validateProductionConfig(env = process.env) {
  const errors = [];
  const nodeEnv = env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    const publicBaseUrl = env.PUBLIC_BASE_URL || '';
    if (!publicBaseUrl) {
      errors.push('PUBLIC_BASE_URL obrigatório em produção.');
    } else {
      try {
        const parsed = new URL(publicBaseUrl);
        if (parsed.protocol !== 'https:') errors.push('HTTPS obrigatório em produção: PUBLIC_BASE_URL deve usar https://');
      } catch {
        errors.push('PUBLIC_BASE_URL inválida em produção.');
      }
    }

    const adminPasswordHash = env.ADMIN_PASSWORD_HASH || '';
    const adminPassword = env.ADMIN_PASSWORD || '';
    if (!adminPasswordHash && !adminPassword) {
      errors.push('ADMIN_PASSWORD_HASH ou ADMIN_PASSWORD obrigatório em produção.');
    }

    if (adminPassword && adminPassword.length < 12) {
      errors.push('ADMIN_PASSWORD deve ter pelo menos 12 caracteres em produção.');
    }

    if (adminPasswordHash && adminPasswordHash.length < 32) {
      errors.push('ADMIN_PASSWORD_HASH muito curta para produção.');
    }

    if (!env.DATABASE_URL) {
      errors.push('DATABASE_URL obrigatório em produção.');
    }

    if (!env.DATA_ENCRYPTION_KEY) {
      errors.push('DATA_ENCRYPTION_KEY obrigatório em produção.');
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  hashPassword,
  verifyPassword,
  buildAdminCookie,
  buildCsrfCookie,
  clearAdminCookie,
  clearCsrfCookie,
  cookieValue,
  generateCsrfToken,
  generateTotpCode,
  verifyTotpCode,
  normalizeIp,
  getClientIp,
  recordFailedLogin,
  isBlockedIp,
  clearFailedLogin,
  logAdminAuditEvent,
  findRecentAuditLogs,
  isAllowedAdminIp,
  buildSecurityAlertPayload,
  validateProductionConfig
};
