const assert = require('node:assert/strict');
const test = require('node:test');
const { buildOrderNotification, formatPhone, sendOrderNotification } = require('./whatsapp');

const sampleOrder = {
  orderId: '12345678-1234-4234-8234-123456789abc',
  createdAt: '2026-10-09T10:29:00.000Z',
  subtotal: 85,
  deliveryFee: 5,
  total: 90,
  payment: { method: 'mercadopago', paymentType: 'credit_card' },
  customer: { name: 'Maria Silva', phone: '11999999999', address: 'Rua A, 10, Centro, São Paulo/SP' },
  items: [{ name: 'Combo trio', quantity: 1, unitPrice: 85, total: 85, options: ['Coxinha', 'Kibe'], addons: [] }]
};

test('builds the order confirmation with the customer and pricing details', () => {
  const notification = buildOrderNotification('new', sampleOrder, '60 min');
  assert.equal(notification.templateEnv, 'WHATSAPP_TEMPLATE_ORDER_CREATED');
  assert.equal(notification.parameters.length, 11);
  assert.equal(notification.parameters[0].text, '12345678');
  assert.match(notification.parameters[5].text, /Combo trio/);
  assert.match(notification.parameters[5].text, /Escolhas: Coxinha, Kibe/);
  assert.match(notification.parameters[5].text, /Produto: R\$ 85,00/);
  assert.match(notification.parameters[5].text, /Subtotal: R\$ 85,00/);
  assert.equal(notification.parameters[7].text, 'R$ 5,00');
  assert.equal(notification.parameters[8].text, 'R$ 90,00');
  assert.equal(notification.parameters[9].text, 'Cartão de crédito pelo Mercado Pago');
});

test('describes the selected Mercado Pago method or cash change in order notifications', () => {
  for (const [paymentType, expected] of [
    ['debit_card', 'Cartão de débito pelo Mercado Pago'],
    ['pix', 'PIX pelo Mercado Pago']
  ]) {
    const notification = buildOrderNotification('new', {
      ...sampleOrder,
      payment: { method: 'mercadopago', paymentType }
    });
    assert.equal(notification.parameters[9].text, expected);
  }

  const cashNotification = buildOrderNotification('new', {
    ...sampleOrder,
    payment: { method: 'cash', changeFor: 100 }
  });
  assert.equal(cashNotification.parameters[9].text, 'Dinheiro na entrega (troco para R$ 100,00)');
});

test('builds messages for production, delivery route, and completed states', () => {
  assert.equal(buildOrderNotification('preparing', sampleOrder).parameters.length, 2);
  assert.equal(buildOrderNotification('out_for_delivery', sampleOrder).parameters.length, 2);
  assert.equal(buildOrderNotification('completed', sampleOrder).parameters.length, 1);
});

test('does not create a notification for the ready state', () => {
  assert.equal(buildOrderNotification('ready', sampleOrder), null);
});

test('formats Brazilian phone numbers for WhatsApp', () => {
  assert.equal(formatPhone('(11) 99999-9999'), '5511999999999');
  assert.equal(formatPhone('+55 11 99999-9999'), '5511999999999');
});

test('does not call WhatsApp without customer consent', async () => {
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('fetch should not be called'); };
  try {
    const result = await sendOrderNotification('new', {
      ...sampleOrder,
      customer: { ...sampleOrder.customer, whatsappOptIn: false }
    });
    assert.deepEqual(result, { sent: false, reason: 'customer_not_opted_in' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('sends the WhatsApp template directly to the Meta API', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION,
    template: process.env.WHATSAPP_TEMPLATE_ORDER_CREATED
  };
  let request;
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
  process.env.WHATSAPP_API_VERSION = 'v23.0';
  process.env.WHATSAPP_TEMPLATE_ORDER_CREATED = 'pedido_confirmado';
  global.fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true };
  };

  try {
    const result = await sendOrderNotification('new', {
      ...sampleOrder,
      customer: { ...sampleOrder.customer, whatsappOptIn: true }
    });
    const payload = JSON.parse(request.body);
    assert.deepEqual(result, { sent: true });
    assert.equal(request.url, 'https://graph.facebook.com/v23.0/123456789/messages');
    assert.equal(request.headers.Authorization, `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`);
    assert.equal(payload.messaging_product, 'whatsapp');
    assert.equal(payload.to, '5511999999999');
    assert.equal(payload.template.name, 'pedido_confirmado');
    assert.equal(payload.template.components[0].parameters.length, 11);
  } finally {
    global.fetch = originalFetch;
    if (originalEnv.accessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalEnv.accessToken;
    if (originalEnv.phoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalEnv.phoneNumberId;
    if (originalEnv.apiVersion === undefined) delete process.env.WHATSAPP_API_VERSION;
    else process.env.WHATSAPP_API_VERSION = originalEnv.apiVersion;
    if (originalEnv.template === undefined) delete process.env.WHATSAPP_TEMPLATE_ORDER_CREATED;
    else process.env.WHATSAPP_TEMPLATE_ORDER_CREATED = originalEnv.template;
  }
});

test('logs Meta error details without exposing credentials or customer phone', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    template: process.env.WHATSAPP_TEMPLATE_ORDER_CREATED
  };
  const originalConsoleError = console.error;
  let loggedError = '';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
  process.env.WHATSAPP_TEMPLATE_ORDER_CREATED = 'pedido_confirmado';
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        type: 'OAuthException',
        code: 100,
        message: 'Invalid token test-access-token for 5511999999999'
      }
    })
  });
  console.error = message => { loggedError = message; };

  try {
    const result = await sendOrderNotification('new', {
      ...sampleOrder,
      customer: { ...sampleOrder.customer, whatsappOptIn: true }
    });
    assert.deepEqual(result, { sent: false, reason: 'provider_error' });
    assert.match(loggedError, /HTTP 400/);
    assert.match(loggedError, /OAuthException/);
    assert.match(loggedError, /código 100/);
    assert.doesNotMatch(loggedError, /test-access-token|5511999999999/);
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalEnv.accessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalEnv.accessToken;
    if (originalEnv.phoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalEnv.phoneNumberId;
    if (originalEnv.template === undefined) delete process.env.WHATSAPP_TEMPLATE_ORDER_CREATED;
    else process.env.WHATSAPP_TEMPLATE_ORDER_CREATED = originalEnv.template;
  }
});
