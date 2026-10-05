const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { buildPreferencePayload, createCheckoutPreference, verifyWebhookSignature } = require('./payments');

test('builds a Mercado Pago preference with authoritative item and delivery amounts', () => {
  const payload = buildPreferencePayload({
    orderId: '12345678-1234-4234-8234-123456789abc',
    baseUrl: 'https://store.example',
    deliveryFee: 5,
    items: [{ productId: 7, name: 'Hamburguer', quantity: 2, unitPrice: 12.5, addons: ['Suco'] }]
  });

  assert.equal(payload.items[0].unit_price, 12.5);
  assert.equal(payload.items[0].quantity, 2);
  assert.equal(payload.items[1].title, 'Taxa de entrega');
  assert.equal(payload.items[1].unit_price, 5);
  assert.equal(payload.external_reference, '12345678-1234-4234-8234-123456789abc');
  assert.match(payload.back_urls.success, /order_id=12345678/);
  assert.equal(payload.notification_url, 'https://store.example/api/payments/mercadopago/webhook');
});

test('accepts only the matching Mercado Pago webhook signature', () => {
  const secret = 'test-webhook-secret';
  const dataId = '987654321';
  const requestId = 'request-123';
  const timestamp = '1728000000';
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const digest = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const signature = `ts=${timestamp},v1=${digest}`;

  assert.equal(verifyWebhookSignature({ dataId, requestId, signature, secret }), true);
  assert.equal(verifyWebhookSignature({ dataId, requestId: 'other-request', signature, secret }), false);
});

test('does not start online payments while the provider is in mock mode', async () => {
  const previousProvider = process.env.PAYMENT_PROVIDER;
  process.env.PAYMENT_PROVIDER = 'mock';
  try {
    await assert.rejects(createCheckoutPreference({}), error => error.status === 503);
  } finally {
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
  }
});
