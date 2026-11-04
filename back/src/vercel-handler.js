function createExpressHandler(app) {
  return async function handler(request, response) {
    await app.ready;
    return app(request, response);
  };
}

module.exports = { createExpressHandler };
