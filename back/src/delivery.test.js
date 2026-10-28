const assert = require('node:assert/strict');
const test = require('node:test');
const { quoteDelivery } = require('./delivery');

test('quoteDelivery accepts a formatted store CEP', async t => {
  const previousStoreCep = process.env.STORE_CEP;
  const previousFetch = global.fetch;
  process.env.STORE_CEP = '12345-678';
  global.fetch = async url => {
    const cep = new URL(url).pathname.split('/').pop();
    const isStore = cep === '12345678';
    const response = {
      cep,
      lat: isStore ? '-23.5505' : '-23.5550',
      lng: isStore ? '-46.6333' : '-46.6380'
    };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  t.after(() => {
    if (previousStoreCep === undefined) delete process.env.STORE_CEP;
    else process.env.STORE_CEP = previousStoreCep;
    global.fetch = previousFetch;
  });

  const quote = await quoteDelivery('87654321');
  assert.equal(quote.fee, 5);
  assert.ok(quote.distanceKm > 0);
});
