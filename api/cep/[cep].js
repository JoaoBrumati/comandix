const { lookupPublicAddress } = require('../../back/src/delivery');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const cep = String(request.query?.cep || new URL(request.url || '/', 'https://localhost').pathname.split('/').pop()).replace(/\D/g, '');

  try {
    return response.status(200).json(await lookupPublicAddress(cep));
  } catch (error) {
    return response.status(error.status || 502).json({ error: error.message || 'Falha ao consultar o CEP.' });
  }
};
