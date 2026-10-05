const crypto = require('crypto');

function paymentError(message, status = 503) {
  return Object.assign(new Error(message), { status });
}

function getPublicBaseUrl() {
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) throw paymentError('Configure PUBLIC_BASE_URL para ativar o checkout do Mercado Pago.');
  let url;
  try { url = new URL(value); } catch { throw paymentError('PUBLIC_BASE_URL precisa ser uma URL válida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw paymentError('PUBLIC_BASE_URL precisa conter apenas a origem pública do site.');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw paymentError('O Checkout Pro em produção exige PUBLIC_BASE_URL com HTTPS.');
  }
  return url.origin;
}

function getAccessToken() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw paymentError('Configure MERCADOPAGO_ACCESS_TOKEN para ativar pagamentos online.');
  return accessToken;
}

function buildPreferencePayload({ orderId, items, deliveryFee, baseUrl }) {
  const preferenceItems = items.map(item => ({
    id: String(item.productId),
    title: item.name.slice(0, 200),
    description: item.addons?.length ? `Adicionais: ${item.addons.join(', ')}`.slice(0, 250) : undefined,
    quantity: item.quantity,
    unit_price: Number(item.unitPrice.toFixed(2)),
    currency_id: 'BRL'
  }));
  if (deliveryFee > 0) preferenceItems.push({ title: 'Taxa de entrega', quantity: 1, unit_price: Number(deliveryFee.toFixed(2)), currency_id: 'BRL' });

  const orderReference = encodeURIComponent(orderId.slice(0, 8).toUpperCase());
  return {
    items: preferenceItems,
    external_reference: orderId,
    back_urls: {
      success: `${baseUrl}/?checkout_result=success&order_id=${orderReference}`,
      pending: `${baseUrl}/?checkout_result=pending&order_id=${orderReference}`,
      failure: `${baseUrl}/?checkout_result=failure&order_id=${orderReference}`
    },
    auto_return: 'approved',
    notification_url: `${baseUrl}/api/payments/mercadopago/webhook`,
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }] },
    metadata: { order_id: orderId }
  };
}

async function createCheckoutPreference(order) {
  if (process.env.PAYMENT_PROVIDER !== 'mercadopago') {
    throw paymentError('Pagamentos com cartão e PIX ainda estão em modo de teste. Configure PAYMENT_PROVIDER=mercadopago.');
  }
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) throw paymentError('Configure MERCADOPAGO_WEBHOOK_SECRET antes de ativar pagamentos online.');
  const accessToken = getAccessToken();
  const baseUrl = getPublicBaseUrl();
  let response;
  try {
    response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPreferencePayload({ ...order, baseUrl })),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw paymentError('Não foi possível conectar ao Mercado Pago. Tente novamente.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id) throw paymentError('O Mercado Pago não conseguiu iniciar o checkout. Confira as credenciais e tente novamente.', 502);
  const checkoutUrl = process.env.NODE_ENV === 'production' ? result.init_point : (result.sandbox_init_point || result.init_point);
  if (typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) throw paymentError('O Mercado Pago retornou um endereço de checkout inválido.', 502);
  return { id: result.id, checkoutUrl };
}

function verifyWebhookSignature({ dataId, requestId, signature, secret }) {
  if (!dataId || !requestId || !signature || !secret) return false;
  const fields = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
  if (!fields.ts || !/^[a-f0-9]{64}$/i.test(fields.v1 || '')) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const actual = Buffer.from(fields.v1, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function fetchMercadoPagoPayment(paymentId) {
  if (!/^\d+$/.test(String(paymentId))) throw paymentError('Identificador de pagamento inválido.', 400);
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    signal: AbortSignal.timeout(10000)
  });
  const payment = await response.json().catch(() => null);
  if (!response.ok || !payment) throw paymentError('Não foi possível consultar o pagamento no Mercado Pago.', 502);
  return payment;
}

module.exports = { buildPreferencePayload, createCheckoutPreference, fetchMercadoPagoPayment, verifyWebhookSignature };
