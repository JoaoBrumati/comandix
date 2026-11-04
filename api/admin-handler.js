const app = require('../back/server');
const { createExpressHandler } = require('../back/src/vercel-handler');

module.exports = createExpressHandler(app, {
  routePrefix: '/api/admin',
  routeQueryParam: '__admin_path'
});
