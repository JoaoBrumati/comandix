const assert = require('node:assert/strict');
const test = require('node:test');
const { createAuthenticatorUri, createRecoveryCodes, createTotpSecret, generateTotp, hashRecoveryCode, verifyTotp } = require('./admin-totp');

test('creates Microsoft Authenticator-compatible TOTP setup details', () => {
  const secret = createTotpSecret();
  const uri = new URL(createAuthenticatorUri(secret, 'admin@example.com'));

  assert.equal(uri.protocol, 'otpauth:');
  assert.equal(uri.hostname, 'totp');
  assert.equal(uri.searchParams.get('secret'), secret);
  assert.equal(uri.searchParams.get('issuer'), 'Comandix');
  assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
  assert.equal(uri.searchParams.get('digits'), '6');
  assert.equal(uri.searchParams.get('period'), '30');
});

test('accepts a current or neighboring TOTP only once', () => {
  const secret = createTotpSecret();
  const timestamp = 1_800_000_000_000;
  const counter = Math.floor(timestamp / 30_000);
  const code = generateTotp(secret, counter);

  assert.equal(verifyTotp(secret, code, timestamp), counter);
  assert.equal(verifyTotp(secret, code, timestamp, counter), null);
  assert.equal(verifyTotp(secret, 'invalid', timestamp), null);
});

test('matches the RFC 6238 SHA-1 test vector used by authenticator apps', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  assert.equal(generateTotp(secret, 1), '287082');
});

test('generates unique single-use recovery codes and hashes normalized input', () => {
  const codes = createRecoveryCodes();
  const hashes = codes.map(hashRecoveryCode);

  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(code => /^[A-F0-9]{16}$/.test(code)));
  assert.equal(hashRecoveryCode(codes[0].match(/.{4}/g).join('-')), hashes[0]);
  assert.equal(hashRecoveryCode('123456'), '');
});
