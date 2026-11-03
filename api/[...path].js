const app = require('../back/server');

module.exports = async function handler(request, response) {
  await app.ready;
  return app(request, response);
};
