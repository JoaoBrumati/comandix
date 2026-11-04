const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createExpressHandler } = require('./vercel-handler');

test('rewrites nested admin requests to a separate Vercel function', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  const adminRewrite = config.rewrites.find(rewrite => rewrite.source === '/api/admin/:path*');

  assert.deepEqual(adminRewrite, {
    source: '/api/admin/:path*',
    destination: '/api/admin-handler?__admin_path=:path*'
  });
  assert.notEqual(adminRewrite.destination.split('?')[0], '/api/admin');
});

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

test('restores nested admin paths and preserves their query string after a Vercel rewrite', async () => {
  let receivedUrl;
  const app = (request, _response) => { receivedUrl = request.url; };
  app.ready = Promise.resolve();
  const request = { url: '/api/admin?__admin_path=orders%2F123%2Fstatus&source=kanban' };
  const response = {};

  await createExpressHandler(app, {
    routePrefix: '/api/admin',
    routeQueryParam: '__admin_path'
  })(request, response);

  assert.equal(receivedUrl, '/api/admin/orders/123/status?source=kanban');
});

test('rejects invalid rewritten API paths before forwarding them to Express', async () => {
  const app = () => assert.fail('invalid path must not be forwarded');
  app.ready = Promise.resolve();
  const request = { url: '/api/admin?__admin_path=orders%2F..%2Flogin' };
  const response = {
    statusCode: 0,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  await createExpressHandler(app, {
    routePrefix: '/api/admin',
    routeQueryParam: '__admin_path'
  })(request, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, { error: 'Caminho da API inválido.' });
});
