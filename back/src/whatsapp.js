const statusTemplates = {
  new: 'WHATSAPP_TEMPLATE_ORDER_CREATED',
  preparing: 'WHATSAPP_TEMPLATE_PREPARING',
  out_for_delivery: 'WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY',
  completed: 'WHATSAPP_TEMPLATE_COMPLETED'
};

const formatCurrency = value => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const textParameter = value => ({ type: 'text', text: String(value || '').slice(0, 1024) });

function formatPhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return phone.startsWith('55') ? phone : `55${phone}`;
}

function buildOrderNotification(status, order, estimate = process.env.WHATSAPP_DELIVERY_ESTIMATE || '60 min') {
  if (!statusTemplates[status] || status === 'ready') return null;
  const orderCode = order.orderCode || order.orderId.slice(0, 8).toUpperCase();
  let parameters;

  if (status === 'new') {
    const items = order.items.map(item => `${item.quantity} x ${item.name}${item.addons?.length ? ` (${item.addons.join(', ')})` : ''}\n  Produto: ${formatCurrency(item.unitPrice)}\n  Subtotal: ${formatCurrency(item.total)}`).join('\n\n').slice(0, 1000);
    const createdAt = new Date(order.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
    parameters = [orderCode, createdAt, order.customer.name, order.customer.phone, order.customer.address, items, formatCurrency(order.subtotal), formatCurrency(order.deliveryFee), formatCurrency(order.total), order.payment.method === 'cash' ? 'Dinheiro na entrega' : 'Cartão ou PIX pelo Mercado Pago', estimate].map(textParameter);
  } else if (status === 'preparing') {
    parameters = [orderCode, estimate].map(textParameter);
  } else if (status === 'out_for_delivery') {
    parameters = [orderCode, estimate].map(textParameter);
  } else {
    parameters = [orderCode].map(textParameter);
  }

  return { templateEnv: statusTemplates[status], parameters };
}

async function sendOrderNotification(status, order) {
  if (!order?.customer?.whatsappOptIn) return { sent: false, reason: 'customer_not_opted_in' };
  const notification = buildOrderNotification(status, order);
  if (!notification) return { sent: false, reason: 'status_not_notified' };

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return { sent: false, reason: 'whatsapp_not_configured' };

  const templateName = process.env[notification.templateEnv];
  if (!templateName) {
    console.error(`Template WhatsApp não configurado: ${notification.templateEnv}`);
    return { sent: false, reason: 'template_not_configured' };
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const language = process.env.WHATSAPP_LANGUAGE || 'pt_BR';
  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formatPhone(order.customer.phone),
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [{ type: 'body', parameters: notification.parameters }]
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.error(`Falha no envio WhatsApp (HTTP ${response.status}): ${details.slice(0, 500)}`);
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (error) {
    console.error(`Falha ao conectar à API do WhatsApp: ${error.message}`);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { buildOrderNotification, sendOrderNotification };