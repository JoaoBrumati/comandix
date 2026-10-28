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
