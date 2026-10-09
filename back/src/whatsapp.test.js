const assert = require('node:assert/strict');
const test = require('node:test');
const { buildOrderNotification } = require('./whatsapp');

const sampleOrder = {
  orderId: '12345678-1234-4234-8234-123456789abc',
  createdAt: '2026-10-09T10:29:00.000Z',
  subtotal: 85,
  deliveryFee: 5,
  total: 90,
  payment: { method: 'mercadopago' },
  customer: { name: 'Maria Silva', phone: '11999999999', address: 'Rua A, 10, Centro, São Paulo/SP' },
  items: [{ name: 'Combo trio', quantity: 1, unitPrice: 85, total: 85, addons: [] }]
};

test('builds the order confirmation with the customer and pricing details', () => {
  const notification = buildOrderNotification('new', sampleOrder, '60 min');
  assert.equal(notification.templateEnv, 'WHATSAPP_TEMPLATE_ORDER_CREATED');
  assert.equal(notification.parameters.length, 11);
  assert.equal(notification.parameters[0].text, '12345678');
  assert.match(notification.parameters[5].text, /Combo trio/);
  assert.match(notification.parameters[5].text, /Produto: R\$ 85,00/);
  assert.match(notification.parameters[5].text, /Subtotal: R\$ 85,00/);
  assert.equal(notification.parameters[7].text, 'R$ 5,00');
  assert.equal(notification.parameters[8].text, 'R$ 90,00');
  assert.equal(notification.parameters[9].text, 'Cartão ou PIX pelo Mercado Pago');
});

test('builds messages for production, delivery route, and completed states', () => {
  assert.equal(buildOrderNotification('preparing', sampleOrder).parameters.length, 2);
  assert.equal(buildOrderNotification('out_for_delivery', sampleOrder).parameters.length, 2);
  assert.equal(buildOrderNotification('completed', sampleOrder).parameters.length, 1);
});

test('does not create a notification for the ready state', () => {
  assert.equal(buildOrderNotification('ready', sampleOrder), null);
});