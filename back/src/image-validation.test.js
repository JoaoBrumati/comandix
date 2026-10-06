const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeImageMimeType, detectImageFormat } = require('./image-validation');

function makeJpeg() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
}

function makePng() {
  return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0]);
}

function makeWebp() {
  return Buffer.from('RIFF' + '\0\0\0\0' + 'WEBP' + '1234', 'ascii');
}

test('normalizeImageMimeType resolves common browser aliases', () => {
  assert.equal(normalizeImageMimeType('image/jpg'), 'image/jpeg');
  assert.equal(normalizeImageMimeType('image/x-png'), 'image/png');
  assert.equal(normalizeImageMimeType('image/x-webp'), 'image/webp');
  assert.equal(normalizeImageMimeType('image/pjpeg'), 'image/jpeg');
});

test('detectImageFormat accepts valid JPEG, PNG and WEBP files regardless of MIME alias', () => {
  assert.equal(detectImageFormat(makeJpeg(), 'image/jpg'), 'image/jpeg');
  assert.equal(detectImageFormat(makePng(), 'image/x-png'), 'image/png');
  assert.equal(detectImageFormat(makeWebp(), 'image/x-webp'), 'image/webp');
});

test('detectImageFormat rejects unsupported content', () => {
  assert.equal(detectImageFormat(Buffer.from('not-an-image'), 'application/octet-stream'), null);
});
