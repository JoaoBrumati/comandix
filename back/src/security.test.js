const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, buildAdminCookie, buildCsrfCookie, recordFailedLogin, isBlockedIp, logAdminAuditEvent, generateTotpCode, verifyTotpCode, isAllowedAdminIp, buildSecurityAlertPayload, validateProductionConfig } = require('./security');

test('hashPassword creates a verifiable password hash', async () => {
  const password = 'SenhaForte!123';
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('outra-senha', hash), false);
});

test('buildAdminCookie includes secure cookie attributes', () => {
  const cookie = buildAdminCookie('token123');

  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api\/admin/i);
  assert.match(cookie, /Max-Age=28800/i);
});

test('buildCsrfCookie exposes a CSRF token for the admin UI', () => {
  const cookie = buildCsrfCookie('csrf-token-123');

  assert.match(cookie, /anotaai_csrf=/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\//i);
});

test('recordFailedLogin blocks repeated admin failures by IP', () => {
  const ip = '203.0.113.10';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordFailedLogin(ip, { windowMs: 60_000, maxAttempts: 5, blockMs: 60_000 });
  }

  assert.equal(isBlockedIp(ip, { windowMs: 60_000, maxAttempts: 5, blockMs: 60_000 }), true);
  assert.equal(recordFailedLogin(ip, { windowMs: 60_000, maxAttempts: 5, blockMs: 60_000 }), 'blocked');
});

test('logAdminAuditEvent writes an audit record for admin actions', () => {
  const output = logAdminAuditEvent('admin_login_success', { ip: '127.0.0.1', originalUrl: '/api/admin/login' }, { username: 'admin' });

  assert.ok(output.includes('admin_login_success'));
  assert.ok(output.includes('127.0.0.1'));
});

test('generateTotpCode and verifyTotpCode work together for 2FA', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const code = generateTotpCode(secret);

  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, '000000'), false);
});

test('isAllowedAdminIp respects whitelist configuration', () => {
  assert.equal(isAllowedAdminIp('203.0.113.10', '203.0.113.10,10.0.0.1'), true);
  assert.equal(isAllowedAdminIp('198.51.100.55', '203.0.113.10,10.0.0.1'), false);
  assert.equal(isAllowedAdminIp('198.51.100.55', ''), true);
});

test('buildSecurityAlertPayload creates a safe alert payload', () => {
  const payload = buildSecurityAlertPayload('admin_login_failed', '203.0.113.10');

  assert.equal(payload.event, 'admin_login_failed');
  assert.equal(payload.ip, '203.0.113.10');
  assert.ok(payload.message.includes('failed'));
});

test('validateProductionConfig blocks insecure production settings', () => {
  const env = {
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'http://example.com',
    ADMIN_PASSWORD_HASH: 'short',
    ADMIN_2FA_SECRET: ''
  };

  const result = validateProductionConfig(env);

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.some(error => error.includes('HTTPS')));
});
