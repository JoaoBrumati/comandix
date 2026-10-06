const imageBase = window.location.protocol === 'file:' ? '../img/' : '/img/';
let foods = [];
let foodLayout = localStorage.getItem('comandix-food-layout') === 'rectangle' ? 'rectangle' : 'square';
let addonGroups = { drinks: [], sides: [], sauces: [] };
let cart = [];
const orderStatusFlow = [
  { id: 'new', label: 'Pedido realizado' },
  { id: 'preparing', label: 'Pedido em produção' },
  { id: 'ready', label: 'Pedido pronto' },
  { id: 'out_for_delivery', label: 'Pedido em rota de entrega' },
  { id: 'completed', label: 'Pedido entregue' }
];
const orderStatusLabels = Object.fromEntries(orderStatusFlow.map(stage => [stage.id, stage.label]));
orderStatusLabels.cancelled = 'Pedido cancelado';

const money = value => `R$ ${value.toFixed(2).replace('.', ',')}`;
const foodImage = food => food.image?.startsWith('/') ? food.image : `${imageBase}${food.image}`;
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const foodGrid = document.querySelector('#food-grid');
const searchInput = document.querySelector('#search-input');
const navCount = document.querySelector('#nav-count');
let detailProduct = null;
let detailQuantity = 1;
let deliveryQuote = null;
let lastQueriedCep = '';
let lastQuoteKey = '';
let quoteTimer;
let trackedOrderId = '';
let orderRefreshTimer = null;

function getCategoryOrder(categories) {
  const saved = localStorage.getItem('comandix-category-order');
  if (!saved) return categories;
  try {
    const parsed = JSON.parse(saved);
    const ordered = Array.isArray(parsed) ? parsed.filter(item => categories.includes(item)) : [];
    const remaining = categories.filter(category => !ordered.includes(category));
    return [...ordered, ...remaining];
  } catch {
    return categories;
  }
}

function updateFoodLayout(layout) {
  foodLayout = layout === 'rectangle' ? 'rectangle' : 'square';
  foodGrid.classList.toggle('layout-rectangle', foodLayout === 'rectangle');
  document.querySelectorAll('[data-food-layout]').forEach(button => {
    const active = button.dataset.foodLayout === foodLayout;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  localStorage.setItem('comandix-food-layout', foodLayout);
}
updateFoodLayout(foodLayout);

function renderFoods() {
  const categories = getCategoryOrder([...new Set(foods.map(food => food.category).filter(Boolean))]);
  const activeFromDom = document.querySelector('.category.active')?.dataset.category || '';
  const activeCategory = categories.includes(activeFromDom) ? activeFromDom : categories[0] || '';
  const query = searchInput.value.toLowerCase().trim();
  const filtered = foods.filter(food => (!activeCategory || food.category === activeCategory) && `${food.name} ${food.description}`.toLowerCase().includes(query));
  foodGrid.innerHTML = filtered.length ? filtered.map(food => `
    <article class="food-card" data-product="${food.id}">
      <div class="food-image"><img src="${escapeText(foodImage(food))}" alt="${escapeText(food.name)}" />${food.promotionPercentage ? `<span class="food-tag promotion-tag">Promoção · ${food.promotionPercentage}%</span>` : ''}<button class="add-button" data-add="${food.id}" aria-label="Adicionar ${escapeText(food.name)}">+</button></div>
      <div class="food-info"><h3>${escapeText(food.name)}</h3><p>${escapeText(food.description)}</p><div class="food-bottom"><span class="price">${food.promotionPercentage ? `<s>${money(food.originalPrice)}</s> ` : ''}${money(food.price)}</span></div></div>
    </article>`).join('') : '<div class="empty">Nenhum sabor encontrado. Tente outra busca.</div>';
}
function renderCategories() {
  const categories = getCategoryOrder([...new Set(foods.map(food => food.category).filter(Boolean))]);
  const icons = { Hambúrgueres: '🍔', Pizzas: '🍕', Saudável: '🥗', Doces: '🍰', Bebidas: '🥤', Acompanhamentos: '🍟' };
  const row = document.querySelector('#category-row');
  const activeFromDom = document.querySelector('.category.active')?.dataset.category || '';
  const activeCategory = categories.includes(activeFromDom) ? activeFromDom : categories[0] || '';
  row.innerHTML = categories.map(category => `<button class="category ${category === activeCategory ? 'active' : ''}" data-category="${escapeText(category)}"><span>${icons[category] || '✦'}</span>${escapeText(category)}</button>`).join('');
  if (!row.querySelector('.category.active') && row.querySelector('.category')) row.querySelector('.category').classList.add('active');
}
function renderAddonOptions(elementId, options, type) {
  document.querySelector(`#${elementId}`).innerHTML = options.map(option => `
    <div class="option-item">
      ${option.image ? `<img src="${escapeText(option.image)}" alt="" />` : ''}
      <span class="option-label">${escapeText(option.name)}</span>
      <div class="option-quantity">
        <button type="button" data-addon-step="${type}" data-addon-change="-1" data-addon-name="${encodeURIComponent(option.name)}" data-addon-price="${option.price}" aria-label="Diminuir ${escapeText(option.name)}">−</button>
        <input type="number" min="0" max="99" step="1" value="0" inputmode="numeric" data-addon-name="${encodeURIComponent(option.name)}" data-addon-price="${option.price}" data-addon-type="${type}" aria-label="Quantidade de ${escapeText(option.name)}" />
        <button type="button" data-addon-step="${type}" data-addon-change="1" data-addon-name="${encodeURIComponent(option.name)}" data-addon-price="${option.price}" aria-label="Aumentar ${escapeText(option.name)}">+</button>
      </div>
      <small>+ ${money(option.price)}</small>
    </div>`).join('');
}
function getDetailTotal() {
  const quantityExtras = [...document.querySelectorAll('.product-detail [data-addon-price]')].reduce((sum, input) => sum + Number(input.dataset.addonPrice || 0) * Number(input.value || 0), 0);
  const legacyExtras = [...document.querySelectorAll('.product-detail input[type="checkbox"]:checked')].reduce((sum, input) => sum + Number(input.dataset.price || 0), 0);
  return (detailProduct.price + quantityExtras + legacyExtras) * detailQuantity;
}
function updateDetailTotal() {
  document.querySelector('#detail-quantity').textContent = detailQuantity;
  document.querySelector('#detail-total').textContent = money(getDetailTotal());
}
function openProduct(id) {
  detailProduct = foods.find(food => food.id === id);
  detailQuantity = 1;
  document.querySelector('#detail-image').src = foodImage(detailProduct);
  document.querySelector('#detail-image').alt = detailProduct.name;
  document.querySelector('#detail-tag').textContent = detailProduct.promotionPercentage ? `Promoção · ${detailProduct.promotionPercentage}%` : detailProduct.tag;
  document.querySelector('#detail-tag').classList.toggle('promotion-tag', Boolean(detailProduct.promotionPercentage));
  document.querySelector('#detail-name').textContent = detailProduct.name;
  document.querySelector('#detail-description').textContent = `${detailProduct.description} Tudo preparado na hora, com ingredientes selecionados e muito sabor em cada mordida.`;
  document.querySelector('#detail-price').innerHTML = detailProduct.promotionPercentage ? `<s>${money(detailProduct.originalPrice)}</s> ${money(detailProduct.price)}` : money(detailProduct.price);
  renderAddonOptions('drink-options', addonGroups.drinks, 'drink');
  renderAddonOptions('side-options', addonGroups.sides, 'side');
  renderAddonOptions('sauce-options', addonGroups.sauces, 'sauce');
  document.querySelector('#product-overlay').classList.add('open');
  document.querySelector('#product-overlay').setAttribute('aria-hidden', 'false');
  updateDetailTotal();
}
function closeProduct() {
  document.querySelector('#product-overlay').classList.remove('open');
  document.querySelector('#product-overlay').setAttribute('aria-hidden', 'true');
}
function addConfiguredProduct() {
  const addonSelections = [...document.querySelectorAll('.product-detail [data-addon-name]')];
  const addons = [];
  for (const input of addonSelections) {
    const quantity = Number(input.value || 0);
    if (quantity <= 0) continue;
    const name = decodeURIComponent(input.dataset.addonName || '');
    for (let index = 0; index < quantity; index += 1) addons.push(name);
  }
  const legacyAddons = [...document.querySelectorAll('.product-detail input[type="checkbox"]:checked')].map(input => input.value);
  const unitPrice = getDetailTotal() / detailQuantity;
  cart.push({ ...detailProduct, id: Date.now(), originalId: detailProduct.id, price: unitPrice, quantity: detailQuantity, addons: [...addons, ...legacyAddons] });
  renderCart();
  closeProduct();
  showToast('Pedido adicionado!');
}
function renderOrderTracking(order) {
  const orderCode = order.orderCode || order.orderId?.slice(0, 8).toUpperCase();
  const activeStatusIndex = orderStatusFlow.findIndex(stage => stage.id === order.status);
  const timeline = orderStatusFlow.map((stage, index) => {
    const isDone = index < activeStatusIndex || (order.status === 'completed' && index === orderStatusFlow.length - 1);
    const isCurrent = stage.id === order.status;
    const stateClass = isDone ? 'done' : isCurrent ? 'current' : '';
    const label = index < activeStatusIndex ? 'Concluído' : isCurrent ? 'Em andamento' : 'Próximo';
    return `<div class="tracking-step ${stateClass}"><span class="tracking-dot"></span><div><strong>${stage.label}</strong><small>${label}</small></div></div>`;
  }).join('');
  const items = order.items?.map(item => `${item.quantity}× ${item.name}${item.addons?.length ? ` (${item.addons.join(', ')})` : ''}`).join('<br>') || '';
  const total = money(Number(order.total || 0));
  const paymentStatuses = { pending: 'Aguardando pagamento', approved: 'Pago', authorized: 'Autorizado', in_process: 'Em processamento', in_mediation: 'Em análise', rejected: 'Recusado', cancelled: 'Cancelado', refunded: 'Reembolsado', charged_back: 'Contestado' };
  const statusMessage = order.status === 'cancelled' ? '<p class="lookup-feedback">Este pedido foi cancelado.</p>' : '';
  document.querySelector('#order-tracking').innerHTML = `
    <div class="tracking-summary"><div><span>Pedido</span><strong>#${orderCode}</strong></div><div><span>Valor total</span><strong>${total}</strong></div></div>
    <div class="tracking-summary"><div><span>Pagamento</span><strong>${escapeText(paymentStatuses[order.payment?.status] || 'Aguardando confirmação')}</strong></div></div>
    ${timeline}
    ${statusMessage}
    <div class="tracking-summary"><div><span>Itens</span><strong>${escapeText(order.items?.length ? order.items.length : 0)} itens</strong></div><div><span>Atualização</span><strong>${orderStatusLabels[order.status] || 'Pedido em análise'}</strong></div></div>
    <div class="tracking-summary"><div><span>Resumo</span><strong>${items || 'Nenhum item informado'}</strong></div></div>
  `;
}

function trackOrder(order) {
  clearInterval(orderRefreshTimer);
  trackedOrderId = order.orderId;
  if (['completed', 'cancelled'].includes(order.status)) return;
  orderRefreshTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible' || !document.querySelector('#orders-page').classList.contains('active')) return;
    try {
      const params = new URLSearchParams({ orderId: trackedOrderId });
      const response = await fetch(`/api/orders/lookup?${params.toString()}`);
      if (!response.ok) return;
      const result = await response.json();
      renderOrderTracking(result.order);
      if (['completed', 'cancelled'].includes(result.order.status)) {
        clearInterval(orderRefreshTimer);
        orderRefreshTimer = null;
      }
    } catch {}
  }, 15000);
}

async function lookupOrderByReference(event) {
  event?.preventDefault();
  clearInterval(orderRefreshTimer);
  orderRefreshTimer = null;
  const orderId = document.querySelector('#lookup-order-id').value.trim();
  const phone = document.querySelector('#lookup-phone').value.trim();
  const feedback = document.querySelector('#lookup-feedback');
  if (!orderId && !phone) {
    feedback.textContent = 'Informe o número do pedido ou o telefone cadastrado.';
    document.querySelector('#order-tracking').innerHTML = '';
    return;
  }
  feedback.textContent = 'Consultando seu pedido...';
  try {
    const params = new URLSearchParams();
    if (orderId) params.set('orderId', orderId);
    else params.set('phone', phone);
    const response = await fetch(`/api/orders/lookup?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pedido não encontrado.');
    renderOrderTracking(result.order);
    trackOrder(result.order);
    feedback.textContent = `Pedido #${result.order.orderCode} encontrado.`;
  } catch (error) {
    document.querySelector('#order-tracking').innerHTML = '<div class="empty">Nenhum pedido encontrado para os dados informados.</div>';
    feedback.textContent = error.message || 'Não foi possível consultar o pedido.';
  }
}

function renderOrders() {
  document.querySelector('#orders-list').innerHTML = '';
}
function formatAddonSummary(addons = []) {
  const counts = new Map();
  addons.forEach(addon => counts.set(addon, (counts.get(addon) || 0) + 1));
  return [...counts].map(([name, quantity]) => `${quantity}x ${name}`).join(', ');
}
function renderCart() {
  navCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartItems = document.querySelector('#cart-items');
  if (!cart.length) { cartItems.innerHTML = '<div class="empty">Seu carrinho está esperando por um pedido gostoso.</div>'; } else {
    cartItems.innerHTML = cart.map(item => {
      const addons = formatAddonSummary(item.addons);
      return `<article class="cart-row"><img src="${foodImage(item)}" alt="${escapeText(item.name)}" /><div class="cart-detail"><h3>${escapeText(item.name)}</h3><p>${money(item.price)} cada${addons ? `<br><strong>Adicionais:</strong> ${escapeText(addons)}` : ''}</p></div><div class="qty"><button data-decrease="${item.id}" aria-label="Diminuir quantidade">−</button><span>${item.quantity}</span><button data-increase="${item.id}" aria-label="Aumentar quantidade">+</button></div><strong>${money(item.price * item.quantity)}</strong><button class="remove" data-remove="${item.id}" aria-label="Remover ${escapeText(item.name)}">×</button></article>`;
    }).join('');
  }
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryLabel = deliveryQuote ? money(deliveryQuote.fee) : 'Consultar';
  const totalLabel = deliveryQuote ? money(subtotal + deliveryQuote.fee) : 'Consultar';
  document.querySelector('#checkout-card').innerHTML = `<h2>Resumo do pedido</h2><div class="summary-line"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="summary-line"><span>Taxa de entrega</span><span>${deliveryLabel}</span></div><div class="summary-line total"><span>Total</span><span>${totalLabel}</span></div>${cart.length ? '<button class="checkout-button" id="checkout-button">Continuar para pagamento <span>→</span></button>' : ''}`;
}
function updateDeliveryPricing() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fee = deliveryQuote?.fee;
  const feeLabel = fee == null ? 'Consultar' : money(fee);
  document.querySelector('#delivery-fee-value').textContent = feeLabel;
  document.querySelector('#delivery-distance-value').textContent = deliveryQuote ? `${deliveryQuote.distanceKm} km` : 'Consultar';
  document.querySelector('#delivery-subtotal-value').textContent = money(subtotal);
  document.querySelector('#delivery-total-value').textContent = fee == null ? 'Consultar' : money(subtotal + fee);
  document.querySelector('#payment-subtotal').textContent = money(subtotal);
  document.querySelector('#payment-delivery-fee').textContent = feeLabel;
  document.querySelector('#payment-total').textContent = fee == null ? 'Consultar' : money(subtotal + fee);
  document.querySelector('#continue-payment').disabled = fee == null;
  document.querySelector('#calculate-delivery').hidden = fee != null;
  document.querySelector('#calculate-delivery').disabled = fee != null || !addressIsReady();
  renderCart();
}
function openPayment() {
  if (!cart.length) return showToast('Adicione um item antes de finalizar');
  document.querySelector('#payment-error').textContent = '';
  updateDeliveryPricing();
  showCheckoutStep('delivery');
  document.querySelector('#payment-overlay').classList.add('open');
  document.querySelector('#payment-overlay').setAttribute('aria-hidden', 'false');
}
function showCheckoutStep(step) {
  const delivery = step === 'delivery';
  document.querySelector('#delivery-step').classList.toggle('active', delivery);
  document.querySelector('#payment-step').classList.toggle('active', !delivery);
  document.querySelector('#checkout-step-label').textContent = delivery ? 'ETAPA 1 DE 2 · ENTREGA' : 'ETAPA 2 DE 2 · PAGAMENTO';
  document.querySelector('#payment-title').textContent = delivery ? 'Seus dados de entrega' : 'Como você quer pagar?';
  document.querySelector('#checkout-step-intro').textContent = delivery ? 'Preencha seus dados para receber o pedido.' : 'Escolha uma forma segura para concluir seu pedido.';
  document.querySelector('#payment-error').textContent = '';
}
function continueToPayment() {
  const name = document.querySelector('#customer-name').value.trim();
  const phone = document.querySelector('#customer-phone').value.replace(/\D/g, '');
  const error = document.querySelector('#payment-error');
  if (name.split(/\s+/).length < 2 || name.length < 5) { error.textContent = 'Informe seu nome completo.'; return; }
  if (phone.length < 10 || phone.length > 11) { error.textContent = 'Informe um telefone válido com DDD.'; return; }
  if (!deliveryQuote) { error.textContent = 'Consulte a taxa de entrega antes de continuar.'; return; }
  showCheckoutStep('payment');
}
async function lookupDeliveryCep() {
  const input = document.querySelector('#delivery-cep');
  const cep = input.value.replace(/\D/g, '');
  const feedback = document.querySelector('#address-feedback');
  if (!/^\d{8}$/.test(cep)) { feedback.textContent = 'Digite um CEP com 8 números.'; return; }
  if (lastQueriedCep === cep) return;
  lastQueriedCep = cep;
  feedback.textContent = 'Buscando endereço...';
  try {
    const response = await fetch(`/api/cep/${cep}`);
    const result = await response.json().catch(() => null);
    if (!result) throw new Error(response.status === 429 ? 'Muitas consultas de CEP. Aguarde um momento e tente novamente.' : `Não foi possível localizar o CEP (HTTP ${response.status}).`);
    if (!response.ok) throw new Error(result.error || 'Não foi possível localizar o CEP.');
    document.querySelector('#delivery-street').value = result.street;
    document.querySelector('#delivery-neighborhood').value = result.neighborhood;
    document.querySelector('#delivery-city').value = result.city;
    document.querySelector('#delivery-state').value = result.state;
    feedback.textContent = 'Endereço encontrado. Confira os dados e informe o número.';
    scheduleDeliveryQuote();
  } catch (error) {
    lastQueriedCep = '';
    feedback.textContent = error instanceof TypeError ? 'Não foi possível consultar o CEP. Confira se o servidor está ativo.' : error.message;
  }
}
function addressIsReady() {
  return /^\d{8}$/.test(document.querySelector('#delivery-cep').value.replace(/\D/g, ''))
    && document.querySelector('#delivery-street').value.trim().length >= 2
    && document.querySelector('#delivery-number').value.trim().length > 0
    && document.querySelector('#delivery-neighborhood').value.trim().length >= 2
    && document.querySelector('#delivery-city').value.trim().length >= 2
    && document.querySelector('#delivery-state').value.trim().length === 2;
}
function scheduleDeliveryQuote() {
  clearTimeout(quoteTimer);
  const ready = addressIsReady();
  document.querySelector('#calculate-delivery').disabled = !ready || deliveryQuote != null;
  if (!ready) return;
  quoteTimer = setTimeout(() => requestDeliveryQuote(false), 650);
}
async function requestDeliveryQuote(force = true) {
  const feedback = document.querySelector('#address-feedback');
  if (!addressIsReady()) {
    feedback.textContent = 'Preencha nome, telefone, CEP e número para consultar a entrega.';
    return;
  }
  const cep = document.querySelector('#delivery-cep').value.replace(/\D/g, '');
  const quoteKey = `${cep}:${document.querySelector('#delivery-number').value.trim()}`;
  if (!force && lastQuoteKey === quoteKey) return;
  lastQuoteKey = quoteKey;
  feedback.textContent = 'Calculando a taxa pela distância...';
  document.querySelector('#calculate-delivery').disabled = true;
  try {
    const response = await fetch('/api/delivery/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cep }) });
    const responseText = await response.text();
    let result = null;
    try { result = responseText ? JSON.parse(responseText) : null; } catch { result = null; }
    if (!result) throw new Error(`Não foi possível calcular a entrega (HTTP ${response.status}).`);
    if (!response.ok) throw new Error(result.error || 'Não foi possível calcular a entrega.');
    deliveryQuote = result;
    updateDeliveryPricing();
    feedback.textContent = `Entrega a ${result.distanceKm} km da loja. Taxa calculada.`;
  } catch (error) {
    deliveryQuote = null;
    updateDeliveryPricing();
    feedback.textContent = error instanceof TypeError ? 'Não foi possível conectar ao servidor para calcular a entrega.' : error.message;
  } finally {
    document.querySelector('#calculate-delivery').disabled = false;
  }
}
function handleCepInput() {
  const input = document.querySelector('#delivery-cep');
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  if (digits !== lastQueriedCep) {
    lastQueriedCep = '';
    lastQuoteKey = '';
    deliveryQuote = null;
    ['#delivery-street', '#delivery-neighborhood', '#delivery-city', '#delivery-state'].forEach(selector => { document.querySelector(selector).value = ''; });
    document.querySelector('#address-feedback').textContent = '';
    updateDeliveryPricing();
  }
  if (digits.length === 8) lookupDeliveryCep();
}
function closePayment() {
  document.querySelector('#payment-overlay').classList.remove('open');
  document.querySelector('#payment-overlay').setAttribute('aria-hidden', 'true');
}
function paymentPayload(method) {
  const payload = { customer: { name: document.querySelector('#customer-name').value.trim(), phone: document.querySelector('#customer-phone').value.replace(/\D/g, ''), cep: document.querySelector('#delivery-cep').value.replace(/\D/g, ''), street: document.querySelector('#delivery-street').value.trim(), number: document.querySelector('#delivery-number').value.trim(), neighborhood: document.querySelector('#delivery-neighborhood').value.trim(), city: document.querySelector('#delivery-city').value.trim(), state: document.querySelector('#delivery-state').value.trim().toUpperCase(), residenceType: document.querySelector('[name="residence-type"]:checked').value, complement: document.querySelector('#delivery-complement').value.trim(), reference: document.querySelector('#delivery-reference').value.trim() }, items: cart.map(item => ({ productId: item.originalId || item.id, quantity: item.quantity, addons: item.addons || [] })) };
  if (method === 'mercadopago') payload.payment = { method: 'mercadopago' };
  if (method === 'cash') payload.payment = { method: 'cash', changeFor: Number((document.querySelector('#cash-change').value || '').replace(',', '.')) || undefined };
  return payload;
}
async function confirmPayment() {
  const method = document.querySelector('.payment-method.active').dataset.method;
  const error = document.querySelector('#payment-error');
  error.textContent = '';
  try {
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paymentPayload(method)) });
    const responseText = await response.text();
    let result = null;
    try { result = responseText ? JSON.parse(responseText) : null; } catch { result = null; }
    if (!result) throw new Error(`Servidor indisponível ou resposta inválida (HTTP ${response.status}). Inicie o projeto com npm start.`);
    if (!response.ok) throw new Error(result.error || 'Não foi possível criar o pedido.');
    if (method === 'mercadopago') {
      if (!result.payment?.checkoutUrl) throw new Error('O checkout seguro não retornou um endereço válido.');
      window.location.assign(result.payment.checkoutUrl);
      return;
    }
    cart = [];
    renderCart();
    closePayment();
    const orderCode = result.orderCode || result.orderId?.slice(0, 8).toUpperCase();
    window.dispatchEvent(new CustomEvent('comandix:order-created', { detail: { orderId: result.orderId, orderCode } }));
    document.querySelector('#lookup-order-id').value = orderCode;
    document.querySelector('#lookup-phone').value = '';
    document.querySelector('[data-page="orders"]').click();
    await lookupOrderByReference();
    showToast(`Pedido #${orderCode} criado com sucesso!`);
  } catch (requestError) { error.textContent = requestError instanceof TypeError ? 'Não foi possível conectar ao servidor. Confira se o projeto está rodando com npm start.' : requestError.message || 'Não foi possível concluir o pagamento.'; }
}
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }
function addToCart(id) { const food = foods.find(item => item.id === id); const existing = cart.find(item => item.id === id); existing ? existing.quantity++ : cart.push({ ...food, quantity: 1 }); renderCart(); showToast('Pedido adicionado!'); }

async function loadStorefrontCatalog() {
  try {
    const response = await fetch('/api/catalog');
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.products)) foods = data.products.map(product => ({ ...product, originalPrice: product.price, price: product.salePrice ?? product.price }));
    if (data.addons) addonGroups = data.addons;
    renderCategories();
    renderFoods();
    renderCart();
    renderDailyPromotion();
  } catch { renderDailyPromotion(); }
}
async function renderDailyPromotion() {
  const container = document.querySelector('#daily-promotion');
  try {
    const response = await fetch('/api/promotion');
    const promotions = await response.json();
    if (!Array.isArray(promotions) || !promotions.length) { container.hidden = true; return; }
    container.innerHTML = promotions.map(promotion => `<article class="daily-promotion-item"><img src="${escapeText(foodImage(promotion))}" alt="${escapeText(promotion.name)}" /><div><span>PROMOÇÃO DO DIA · ${promotion.promotionPercentage}% OFF</span><h2>${escapeText(promotion.name)}</h2><p>${escapeText(promotion.description)}</p><strong><s>${money(promotion.price)}</s> ${money(promotion.salePrice)}</strong></div><button class="promotion-order" data-promotion-add="${promotion.id}">Ver promoção →</button></article>`).join('');
    container.hidden = false;
  } catch { container.hidden = true; }
}
window.refreshStorefrontCatalog = loadStorefrontCatalog;

foodGrid.addEventListener('click', event => { const button = event.target.closest('[data-add]'); if (button) { addToCart(Number(button.dataset.add)); return; } const card = event.target.closest('[data-product]'); if (card) openProduct(Number(card.dataset.product)); });
document.querySelector('#daily-promotion').addEventListener('click', event => { const button = event.target.closest('[data-promotion-add]'); if (button) openProduct(Number(button.dataset.promotionAdd)); });
searchInput.addEventListener('input', renderFoods);
document.querySelector('.food-layout-toggle').addEventListener('click', event => { const button = event.target.closest('[data-food-layout]'); if (button) updateFoodLayout(button.dataset.foodLayout); });
document.querySelector('#category-row').addEventListener('click', event => { const button = event.target.closest('.category'); if (!button) return; document.querySelectorAll('.category').forEach(item => item.classList.remove('active')); button.classList.add('active'); renderFoods(); });
document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('.sidebar').addEventListener('click', event => { if (event.target.closest('.nav-item')) document.querySelector('.sidebar').classList.remove('open'); });
document.querySelector('#orders-list').addEventListener('click', event => { const button = event.target.closest('[data-repeat]'); if (button) addToCart(Number(button.dataset.repeat)); });
document.querySelector('#cart-items').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; const id = Number(button.dataset.increase || button.dataset.decrease || button.dataset.remove); const item = cart.find(entry => entry.id === id); if (button.dataset.increase) item.quantity++; if (button.dataset.decrease) item.quantity > 1 ? item.quantity-- : cart = cart.filter(entry => entry.id !== id); if (button.dataset.remove) cart = cart.filter(entry => entry.id !== id); renderCart(); });
document.querySelector('#checkout-card').addEventListener('click', event => { if (event.target.closest('#checkout-button')) openPayment(); });
document.querySelector('#detail-close').addEventListener('click', closeProduct);
document.querySelector('#product-overlay').addEventListener('click', event => { if (event.target.id === 'product-overlay') closeProduct(); });
document.querySelector('#detail-increase').addEventListener('click', () => { detailQuantity++; updateDetailTotal(); });
document.querySelector('#detail-decrease').addEventListener('click', () => { if (detailQuantity > 1) detailQuantity--; updateDetailTotal(); });
document.querySelector('#detail-add').addEventListener('click', addConfiguredProduct);
document.querySelector('#payment-close').addEventListener('click', closePayment);
document.querySelector('#payment-methods').addEventListener('click', event => { const method = event.target.closest('[data-method]'); if (!method) return; document.querySelectorAll('.payment-method').forEach(item => item.classList.toggle('active', item === method)); document.querySelectorAll('.payment-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === method.dataset.method)); });
document.querySelector('#confirm-payment').addEventListener('click', confirmPayment);
document.querySelector('#continue-payment').addEventListener('click', continueToPayment);
document.querySelector('#order-lookup-form')?.addEventListener('submit', lookupOrderByReference);
document.querySelector('#lookup-phone')?.addEventListener('input', () => { const digits = document.querySelector('#lookup-phone').value.replace(/\D/g, '').slice(0, 11); document.querySelector('#lookup-phone').value = digits.length > 10 ? `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}` : digits.length > 0 ? `(${digits.slice(0,2)}) ${digits.slice(2)}`.trim() : ''; });
document.querySelector('#lookup-order-id')?.addEventListener('input', event => { event.target.value = event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16).toUpperCase(); });
document.querySelector('#lookup-cep').addEventListener('click', lookupDeliveryCep);
document.querySelector('#delivery-cep').addEventListener('input', handleCepInput);
document.querySelector('#calculate-delivery').addEventListener('click', () => requestDeliveryQuote(true));
['#customer-name', '#customer-phone', '#delivery-number'].forEach(selector => document.querySelector(selector).addEventListener('input', scheduleDeliveryQuote));
document.querySelector('#back-to-delivery').addEventListener('click', () => showCheckoutStep('delivery'));
document.querySelector('#product-overlay').addEventListener('input', event => {
  if (!event.target.matches('[data-addon-name]')) return;
  const value = Number(event.target.value || 0);
  event.target.value = Math.min(99, Math.max(0, Number.isFinite(value) ? value : 0));
  updateDetailTotal();
});
document.querySelector('#product-overlay').addEventListener('click', event => {
  const button = event.target.closest('[data-addon-change]');
  if (!button) return;
  const input = button.closest('.option-item')?.querySelector('input[data-addon-name]');
  if (!input) return;
  const delta = Number(button.dataset.addonChange || 0);
  const nextValue = Math.min(99, Math.max(0, (Number(input.value || 0)) + delta));
  input.value = nextValue;
  updateDetailTotal();
});
document.addEventListener('keydown', event => { if (event.key !== 'Escape') return; if (document.querySelector('#product-overlay').classList.contains('open')) closeProduct(); });
const pageHashes = { home: 'inicio', orders: 'pedidos', cart: 'carrinho', admin: 'admin' };
function activatePage(page) {
  if (!pageHashes[page]) page = 'home';
  document.querySelectorAll('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  document.querySelectorAll('.page-view').forEach(item => item.classList.toggle('active', item.id === `${page}-page`));
}
document.querySelectorAll('[data-page]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const page = link.dataset.page;
  activatePage(page);
  history.replaceState(null, '', `#${pageHashes[page] || pageHashes.home}`);
}));
const initialPageHash = window.location.hash.slice(1).split('/')[0];
const initialPage = Object.keys(pageHashes).find(page => pageHashes[page] === initialPageHash) || 'home';
activatePage(initialPage);

renderFoods(); renderOrders(); renderCart(); loadStorefrontCatalog();
const checkoutReturn = new URLSearchParams(window.location.search);
const returnedOrderCode = checkoutReturn.get('order_id');
if (returnedOrderCode) {
  document.querySelector('#lookup-order-id').value = returnedOrderCode;
  activatePage('orders');
  history.replaceState(null, '', `#${pageHashes.orders}`);
  document.querySelector('#lookup-feedback').textContent = 'Retorno do pagamento recebido. Consultando o status confirmado pelo Mercado Pago...';
  lookupOrderByReference();
}
