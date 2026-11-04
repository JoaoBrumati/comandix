const assert = require('node:assert/strict');
const test = require('node:test');
const { quoteDelivery, lookupCep } = require('./delivery');
const cepHandler = require('../../api/cep/[cep]');

test('lookupCep falls back to ViaCEP when the other providers reject the CEP', async t => {
  const previousFetch = global.fetch;
  global.fetch = async url => {
    const target = String(url);
    if (target.includes('viacep')) {
      return new Response(JSON.stringify({
        cep: '08271-010',
        logradouro: 'Rua das Flores',
        bairro: 'Vila Nova',
        localidade: 'São Paulo',
        uf: 'SP'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ code: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  t.after(() => { global.fetch = previousFetch; });

  const data = await lookupCep('08271010');
  assert.equal(data.cep, '08271010');
  assert.equal(data.address, 'Rua das Flores');
  assert.equal(data.city, 'São Paulo');
  assert.equal(data.state, 'SP');
});

test('Vercel CEP handler returns the address for the requested CEP', async t => {
  const previousFetch = global.fetch;
  global.fetch = async url => {
    assert.equal(String(url), 'https://viacep.com.br/ws/08727010/json/');
    return new Response(JSON.stringify({
      cep: '08727-010',
      logradouro: 'Rua Maria Auxiliadora Andrade Costa',
      bairro: 'Cidade Jardim',
      localidade: 'Mogi das Cruzes',
      uf: 'SP'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  t.after(() => { global.fetch = previousFetch; });

  const response = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {}
  };

  await cepHandler({
    method: 'GET',
    query: { cep: '08727010' },
    url: '/api/cep/08727010'
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    cep: '08727010',
    street: 'Rua Maria Auxiliadora Andrade Costa',
    neighborhood: 'Cidade Jardim',
    city: 'Mogi das Cruzes',
    state: 'SP'
  });
});

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
