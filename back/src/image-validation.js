const IMAGE_MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-jpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-webp': 'image/webp'
};

function normalizeImageMimeType(mimeType = '') {
  const normalized = String(mimeType).trim().toLowerCase();
  return IMAGE_MIME_ALIASES[normalized] || normalized;
}

function isJpeg(buffer = Buffer.alloc(0)) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer = Buffer.alloc(0)) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isWebp(buffer = Buffer.alloc(0)) {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function detectImageFormat(buffer = Buffer.alloc(0), mimeType = '') {
  const normalizedMimeType = normalizeImageMimeType(mimeType);
  const formatByMime = {
    'image/jpeg': isJpeg,
    'image/png': isPng,
    'image/webp': isWebp
  };

  if (normalizedMimeType && formatByMime[normalizedMimeType] && formatByMime[normalizedMimeType](buffer)) {
    return normalizedMimeType;
  }

  if (isJpeg(buffer)) return 'image/jpeg';
  if (isPng(buffer)) return 'image/png';
  if (isWebp(buffer)) return 'image/webp';
  return null;
}

function isAllowedImageMimeType(mimeType = '') {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(normalizeImageMimeType(mimeType));
}

module.exports = {
  normalizeImageMimeType,
  detectImageFormat,
  isAllowedImageMimeType
};
