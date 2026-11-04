function createExpressHandler(app, options = {}) {
  return async function handler(request, response) {
    if (options.routeQueryParam) {
      const requestUrl = new URL(request.url || '/', 'https://localhost');
      const routedPath = requestUrl.searchParams.get(options.routeQueryParam);

      if (routedPath !== null) {
        const segments = routedPath.split('/');
        if (!routedPath || segments.some(segment => !segment || segment === '.' || segment === '..')) {
          return response.status(400).json({ error: 'Caminho da API inválido.' });
        }

        requestUrl.searchParams.delete(options.routeQueryParam);
        request.url = `${options.routePrefix}/${routedPath}${requestUrl.search}`;
      }
    }

    await app.ready;
    return app(request, response);
  };
}

module.exports = { createExpressHandler };
