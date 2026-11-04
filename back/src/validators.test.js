const assert = require('node:assert/strict');
const test = require('node:test');
const { orderSchema } = require('./validators');

const order = phone => ({
  customer: {
    name: 'Maria Silva',
    phone,
    cep: '01001000',
    street: 'Rua A',
    number: '10',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    residenceType: 'Casa'
  },
  items: [{ productId: 1, quantity: 1 }],
  payment: { method: 'cash' }
});

test('normalizes Brazilian phone numbers with formatting and country code', () => {
  for (const [input, expected] of [
    ['(11) 99999-9999', '11999999999'],
    ['+55 (11) 99999-9999', '11999999999'],
    ['+55 11 3333-4444', '1133334444'],
    ['(55) 99999-9999', '55999999999']
  ]) {
    const result = orderSchema.safeParse(order(input));
    assert.equal(result.success, true, `expected ${input} to be accepted`);
    assert.equal(result.data.customer.phone, expected);
  }
});

test('rejects Brazilian phone numbers without a valid DDD and subscriber length', () => {
  assert.equal(orderSchema.safeParse(order('123456789')).success, false);
  assert.equal(orderSchema.safeParse(order('+55 123456789012')).success, false);
});

test('accepts each Mercado Pago payment option separately', () => {
  for (const paymentType of ['credit_card', 'debit_card', 'pix']) {
    const result = orderSchema.safeParse({
      ...order('11999999999'),
      payment: { method: 'mercadopago', paymentType }
    });
    assert.equal(result.success, true, `expected ${paymentType} to be accepted`);
  }
});

test('rejects unsupported Mercado Pago payment options', () => {
  const result = orderSchema.safeParse({
    ...order('11999999999'),
    payment: { method: 'mercadopago', paymentType: 'cash' }
  });
  assert.equal(result.success, false);
});

test('accepts up to four distinct combo choices', () => {
  const parsed = orderSchema.safeParse({
    ...order('11999999999'),
    items: [{ productId: 7, quantity: 1, options: [10, 11, 12, 13] }]
  });
  assert.equal(parsed.success, true);
});

test('rejects repeated or excessive combo choices', () => {
  for (const options of [[10, 10], [10, 11, 12, 13, 14]]) {
    const parsed = orderSchema.safeParse({
      ...order('11999999999'),
      items: [{ productId: 7, quantity: 1, options }]
    });
    assert.equal(parsed.success, false);
  }
});
