const { quoteDelivery } = require('../../back/src/delivery');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const cep = typeof request.body?.cep === 'string' ? request.body.cep.replace(/\D/g, '') : '';
  if (!/^\d{8}$/.test(cep)) {
    return response.status(400).json({ error: 'Informe um CEP válido.' });
  }

  try {
    return response.status(200).json(await quoteDelivery(cep));
  } catch (error) {
    return response.status(error.status || 502).json({ error: error.message || 'Não foi possível consultar a entrega.' });
  }
};
