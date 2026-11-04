const assert = require('node:assert/strict');
const test = require('node:test');
const { createExpressHandler } = require('./vercel-handler');

test('waits for Express initialization before forwarding Vercel requests', async () => {
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  let forwarded = false;
  const app = (request, response) => {
    forwarded = true;
    return { request, response };
  };
  app.ready = ready;
  const request = { url: '/api/admin/session' };
  const response = {};
  const resultPromise = createExpressHandler(app)(request, response);

  assert.equal(forwarded, false);
  resolveReady();
  assert.deepEqual(await resultPromise, { request, response });
  assert.equal(forwarded, true);
});

test('propagates Express initialization errors instead of fabricating a response', async () => {
  const error = new Error('initialization failed');
  let forwarded = false;
  const app = () => { forwarded = true; };
  app.ready = Promise.reject(error);

  await assert.rejects(createExpressHandler(app)({}, {}), error);
  assert.equal(forwarded, false);
});
