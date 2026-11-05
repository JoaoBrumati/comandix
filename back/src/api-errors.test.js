const assert = require('node:assert/strict');
const test = require('node:test');
const { getApiErrorResponse } = require('./api-errors');

test('returns a clear migration hint for missing database tables or columns', () => {
  for (const code of ['P2021', 'P2022']) {
    const response = getApiErrorResponse({ code });

    assert.equal(response.status, 503);
    assert.match(response.body.error, /Aplique as migrations/);
    assert.doesNotMatch(response.body.error, /DATABASE_URL=.*@/);
  }
});

test('keeps malformed JSON and unexpected errors mapped to safe responses', () => {
  assert.deepEqual(getApiErrorResponse({ type: 'entity.parse.failed' }), {
    status: 400,
    body: { error: 'JSON inválido.' }
  });
  assert.deepEqual(getApiErrorResponse(new Error('sensitive database details')), {
    status: 500,
    body: { error: 'Erro interno do servidor.' }
  });
});
