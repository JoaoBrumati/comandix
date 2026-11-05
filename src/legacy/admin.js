const adminLoginView = document.querySelector('#admin-login-view');
const adminDashboardView = document.querySelector('#admin-dashboard-view');
const adminLoginFeedback = document.querySelector('#admin-login-feedback');
const adminEmailCodeForm = document.querySelector('#admin-email-code-form');
const adminEmailCodeFeedback = document.querySelector('#admin-email-code-feedback');
const employeeForm = document.querySelector('#employee-form');
let selectedPeriod = 'daily';
let requestedAdminSection = 'dashboard';
let currentAdminProfile = null;
let pendingLoginChallenge = '';
let dashboardOrders = [];
let adminMenuProducts = [];
let adminMenuGroups = [];
let kanbanRefreshTimer = null;
let kanbanLoading = false;
const kanbanPeriodStorageKey = 'comandix-kanban-period';
const allowedOrderPeriods = ['daily', 'weekly', 'monthly', 'yearly'];
let kanbanPeriod = 'daily';
try {
  const storedKanbanPeriod = localStorage.getItem(kanbanPeriodStorageKey);
  if (allowedOrderPeriods.includes(storedKanbanPeriod)) kanbanPeriod = storedKanbanPeriod;
} catch {}
const orderStages = [
  { id: 'new', label: 'Pedido realizado' },
  { id: 'preparing', label: 'Pedido em produção' },
  { id: 'out_for_delivery', label: 'Pedido em rota de entrega' },
  { id: 'completed', label: 'Pedido entregue' },
  { id: 'cancelled', label: 'Pedido cancelado' }
];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatCurrency = value => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const formatDate = value => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não programada';
const formatDateTime = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nenhum ponto registrado';
const paymentMethodLabel = payment => payment.method === 'cash'
  ? 'Dinheiro na entrega'
  : ({ credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'Pix' }[payment.paymentType] || 'Mercado Pago');
const groupOrderStorageKey = 'comandix-category-order';

function getStoredGroupOrder(groups = []) {
  const saved = localStorage.getItem(groupOrderStorageKey);
  if (!saved) return groups;
  try {
    const parsed = JSON.parse(saved);
    const ordered = Array.isArray(parsed) ? parsed.filter(item => groups.includes(item)) : [];
    const remaining = groups.filter(group => !ordered.includes(group));
    return [...ordered, ...remaining];
  } catch {
    return groups;
  }
}

function saveGroupOrder(groups = []) {
  localStorage.setItem(groupOrderStorageKey, JSON.stringify(groups));
}

function getCsrfTokenFromCookie() {
  const match = document.cookie.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith('comandix_csrf='));
  return match ? decodeURIComponent(match.slice('comandix_csrf='.length)) : '';
}

async function adminRequest(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers.has('X-CSRF-Token')) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  } catch (error) {
    console.error(`Não foi possível conectar à API em ${url}.`, error);
    throw new Error('Não foi possível conectar ao servidor. Inicie a API e tente novamente.');
  }
  if (response.status === 204) return null;
  const responseText = await response.text();
  let body = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch (error) {
      console.error(`A API retornou uma resposta inválida para ${url}.`, error);
      throw new Error(`O servidor retornou uma resposta inválida (HTTP ${response.status}). Verifique se a API está configurada corretamente.`);
    }
  }
  if (!response.ok) {
    const error = new Error(body.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }
  return body;
}

async function loadAdminSession() {
  try {
    const session = await adminRequest('/api/admin/session');
    history.replaceState(null, '', `/admin#admin/${requestedAdminSection}`);
    await showAdminDashboard(session.profile);
  } catch {
    if (window.location.pathname !== '/login') history.replaceState(null, '', '/login');
    adminLoginView.hidden = false;
    adminDashboardView.hidden = true;
    document.querySelector('#admin-profile-nav').hidden = true;
    document.querySelector('#admin-subnav').hidden = true;
  }
}

async function showAdminDashboard(profile = currentAdminProfile) {
  adminLoginView.hidden = true;
  adminDashboardView.hidden = false;
  document.querySelector('#admin-subnav').hidden = false;
  document.querySelector('#admin-profile-nav').hidden = false;
  currentAdminProfile = profile;
  document.querySelectorAll('[data-admin-section]').forEach(button => {
    const section = button.dataset.adminSection;
    button.hidden = section !== 'profile' && !currentAdminProfile?.permissions.includes(section);
  });
  if (requestedAdminSection !== 'profile' && !currentAdminProfile?.permissions.includes(requestedAdminSection)) {
    requestedAdminSection = 'profile';
    history.replaceState(null, '', `/admin#admin/${requestedAdminSection}`);
  }
  await showAdminSection(requestedAdminSection);
}

async function showAdminSection(section) {
  if (!['dashboard', 'orders', 'menu', 'profile'].includes(section)) section = 'dashboard';
  requestedAdminSection = section;
  clearInterval(kanbanRefreshTimer);
  kanbanRefreshTimer = null;
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === `admin-${section}-panel`));
  document.querySelectorAll('[data-admin-section]').forEach(link => link.classList.toggle('active', link.dataset.adminSection === section));
  if (section === 'dashboard') await loadDashboard();
  if (section === 'orders') {
    await loadKanban();
    kanbanRefreshTimer = setInterval(() => loadKanban().catch(() => {}), 5000);
  }
  if (section === 'menu') await loadAdminMenu();
  if (section === 'profile') await loadAdminProfile();
}

async function navigateAdminSection(section) {
  const normalized = ['dashboard', 'orders', 'menu', 'profile'].includes(section) ? section : 'dashboard';
  requestedAdminSection = normalized;
  document.querySelectorAll('.page-view').forEach(view => view.classList.toggle('active', view.id === 'admin-page'));
  document.querySelectorAll('[data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === 'admin'));
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('#drawer-backdrop').classList.remove('open');
  document.querySelector('#mobile-menu').setAttribute('aria-expanded', 'false');
  history.replaceState(null, '', `/admin#admin/${normalized}`);
  try {
    const session = await adminRequest('/api/admin/session');
    currentAdminProfile = session.profile;
    const allowedSection = normalized === 'profile' || currentAdminProfile.permissions.includes(normalized);
    const targetSection = allowedSection ? normalized : 'profile';
    requestedAdminSection = targetSection;
    history.replaceState(null, '', `/admin#admin/${targetSection}`);
    await showAdminSection(targetSection);
  } catch (error) {
    if (error.status === 401) {
      history.replaceState(null, '', '/login');
      adminLoginView.hidden = false;
      adminDashboardView.hidden = true;
      document.querySelector('#admin-profile-nav').hidden = true;
      document.querySelector('#admin-subnav').hidden = true;
      return;
    }
    showAdminToast(error.message);
  }
}

async function loadAdminProfile() {
  const { profile } = await adminRequest('/api/admin/profile');
  currentAdminProfile = profile;
  const permissions = profile.permissions.map(permission => ({ dashboard: 'Dashboard', orders: 'Kanban', menu: 'Cardápio' })[permission]).join(', ');
  document.querySelector('#admin-profile-details').innerHTML = `
    <div><span>Nome do perfil</span><strong>${escapeHtml(profile.name)}</strong></div>
    <div><span>E-mail</span><strong>${escapeHtml(profile.email || 'Não informado')}</strong></div>
    <div><span>Acessos deste perfil</span><strong>${profile.isOwner ? 'Administrador principal' : escapeHtml(permissions || 'Nenhuma seção liberada')}</strong></div>
  `;
  const management = document.querySelector('#admin-account-management');
  management.hidden = !profile.isOwner;
  if (!profile.isOwner) return;
  await loadAdminAccounts();
}

async function loadAdminAccounts() {
  const { accounts } = await adminRequest('/api/admin/accounts');
  const permissionNames = { dashboard: 'Dashboard', orders: 'Kanban', menu: 'Cardápio' };
  document.querySelector('#admin-account-list').innerHTML = accounts.length
    ? accounts.map(account => `<article class="admin-account-row">
        <div><strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(account.email)}</span><small>Acessos: ${escapeHtml(account.permissions.map(permission => permissionNames[permission]).join(', '))}</small></div>
        <button class="admin-secondary" type="button" data-delete-admin-account="${escapeHtml(account.id)}">Remover acesso</button>
      </article>`).join('')
    : '<p class="admin-empty">Nenhum colaborador cadastrado.</p>';
}

async function submitAdminAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const permissions = [...form.querySelectorAll('input[name="permission"]:checked')].map(input => input.value);
  if (!permissions.length) {
    showAdminToast('Selecione pelo menos uma permissão para o colaborador.');
    return;
  }
  const payload = {
    name: document.querySelector('#admin-account-name').value.trim(),
    email: document.querySelector('#admin-account-email').value.trim(),
    password: document.querySelector('#admin-account-password').value,
    permissions
  };
  try {
    await adminRequest('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    form.reset();
    await loadAdminAccounts();
    showAdminToast('Perfil do colaborador cadastrado.');
  } catch (error) {
    showAdminToast(error.message);
  }
}

async function handleAdminAccountAction(event) {
  const button = event.target.closest('[data-delete-admin-account]');
  if (!button || !window.confirm('Remover o acesso deste colaborador?')) return;
  try {
    await adminRequest(`/api/admin/accounts/${encodeURIComponent(button.dataset.deleteAdminAccount)}`, { method: 'DELETE' });
    await loadAdminAccounts();
    showAdminToast('Acesso do colaborador removido.');
  } catch (error) {
    showAdminToast(error.message);
  }
}

async function loadSecurityLogs() {
  try {
    const { logs = [] } = await adminRequest('/api/admin/security/logs');
    const logList = logs.slice(-5).reverse().map(log => `<li><strong>${escapeHtml(log.event || 'event')}</strong><span>${escapeHtml(log.timestamp || 'agora')}</span><small>${escapeHtml(log.ip || 'desconhecido')}</small></li>`).join('');
    document.querySelector('#admin-security-log').innerHTML = `<h3>Últimas ocorrências</h3><ul class="security-log-list">${logList || '<li><span>Sem registros ainda</span></li>'}</ul>`;
  } catch {
    document.querySelector('#admin-security-log').innerHTML = '<h3>Últimas ocorrências</h3><ul class="security-log-list"><li><span>Não foi possível carregar os logs</span></li></ul>';
  }
}

async function loadDashboard() {
  const data = await adminRequest(`/api/admin/dashboard?period=${selectedPeriod}`);
  dashboardOrders = data.orders;
  const soldItems = data.orders.reduce((total, order) => total + order.items.reduce((orderTotal, item) => orderTotal + item.quantity, 0), 0);
  const metrics = [
    ['Total de pedidos', data.orderCount, 'Pedidos no período'],
    ['Faturamento', formatCurrency(data.revenue), `${formatCurrency(data.deliveryRevenue)} em taxas de entrega`],
    ['Itens vendidos', soldItems, 'Quantidade nos pedidos recentes']
  ];
  document.querySelector('#admin-metrics').innerHTML = metrics.map(([title, value, note], index) => `<article class="admin-metric" data-dashboard-group="${index === 0 || index === 2 ? 'orders' : 'revenue'}"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
  document.querySelector('#admin-orders-summary').innerHTML = data.orders.length ? data.orders.map(order => `<article class="admin-order-row"><div><strong>${escapeHtml(order.items.map(item => `${item.quantity}x ${item.name}${item.options?.length ? ` (Escolhas: ${item.options.join(', ')})` : ''}${item.addons?.length ? ` (Adicionais: ${item.addons.join(', ')})` : ''}`).join(', '))}</strong><small>${formatDateTime(order.createdAt)} · ${escapeHtml(paymentMethodLabel(order.payment))}</small></div><span>Itens ${formatCurrency(order.subtotal)}<small>Entrega ${formatCurrency(order.deliveryFee)}</small></span><b>${formatCurrency(order.total)}</b></article>`).join('') : '<div class="admin-empty">Ainda não há pedidos registrados neste período.</div>';
  renderDashboardRevenue(data.orders);
  renderDashboardStatuses(data.orders, data.orderCount);
  renderDashboardProducts(data.orders);
  document.querySelector('#admin-security-log').hidden = !currentAdminProfile?.isOwner;
  if (currentAdminProfile?.isOwner) await loadSecurityLogs();
  applyDashboardFilter();
}

function renderDashboardRevenue(orders) {
  const periods = {
    daily: { count: 8, label: index => `${index * 3}h` },
    weekly: { count: 7, label: index => ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][index] },
    monthly: { count: 5, label: index => `Sem. ${index + 1}` },
    yearly: { count: 12, label: index => new Date(2000, index, 1).toLocaleDateString('pt-BR', { month: 'short' }) }
  };
  const config = periods[selectedPeriod] || periods.daily;
  const totals = Array(config.count).fill(0);
  for (const order of orders) {
    const date = new Date(order.createdAt);
    let index = 0;
    if (selectedPeriod === 'daily') index = Math.floor(date.getHours() / 3);
    if (selectedPeriod === 'weekly') index = (date.getDay() + 6) % 7;
    if (selectedPeriod === 'monthly') index = Math.min(config.count - 1, Math.floor((date.getDate() - 1) / 7));
    if (selectedPeriod === 'yearly') index = date.getMonth();
    if (Number.isFinite(order.total) && index >= 0 && index < totals.length) totals[index] += order.total;
  }
  const max = Math.max(...totals, 1);
  const chartWidth = 760;
  const chartHeight = 210;
  const baseline = 166;
  const top = 18;
  const gap = 12;
  const barWidth = (chartWidth - gap * (config.count - 1)) / config.count;
  const grid = [0, 1, 2, 3].map(step => {
    const y = top + (baseline - top) * step / 3;
    return `<line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" /><text x="0" y="${y - 5}">${formatCurrency(max * (1 - step / 3))}</text>`;
  }).join('');
  const bars = totals.map((total, index) => {
    const height = total ? Math.max(3, (total / max) * (baseline - top)) : 0;
    const x = index * (barWidth + gap);
    const y = baseline - height;
    return `<g><rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="5"><title>${escapeHtml(config.label(index))}: ${formatCurrency(total)}</title></rect><text class="dashboard-chart-label" x="${x + barWidth / 2}" y="${baseline + 20}" text-anchor="middle">${escapeHtml(config.label(index))}</text></g>`;
  }).join('');
  document.querySelector('#dashboard-revenue-chart').innerHTML = orders.length
    ? `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Gráfico de faturamento por intervalo">${grid}${bars}</svg>`
    : '<div class="dashboard-chart-empty">Sem faturamento para exibir neste período.</div>';
}

function renderDashboardStatuses(orders, periodOrderCount) {
  const stages = [
    { id: 'completed', label: 'Entregues', color: '#c41428' },
    { id: 'preparing', label: 'Em produção', color: '#f39b17' },
    { id: 'out_for_delivery', label: 'Em entrega', color: '#ffbf24' },
    { id: 'new', label: 'Novos', color: '#f1dfc2' },
    { id: 'cancelled', label: 'Cancelados', color: '#e7a49a' }
  ];
  const counts = Object.fromEntries(stages.map(stage => [stage.id, 0]));
  for (const order of orders) {
    const status = order.status === 'ready' ? 'preparing' : order.status;
    counts[counts[status] === undefined ? 'new' : status] += 1;
  }
  const total = orders.length;
  let accumulated = 0;
  const stops = stages.map(stage => {
    const start = accumulated;
    accumulated += total ? counts[stage.id] / total * 100 : 0;
    return `${stage.color} ${start}% ${accumulated}%`;
  }).join(', ');
  const legend = stages.filter(stage => counts[stage.id] > 0).map(stage => `<li><span><i style="--status-color:${stage.color}"></i>${stage.label}</span><strong>${counts[stage.id]}</strong></li>`).join('');
  document.querySelector('#dashboard-status-caption').textContent = `${orders.length} de ${periodOrderCount} pedidos no período`;
  document.querySelector('#dashboard-status-chart').innerHTML = total
    ? `<div class="dashboard-donut" style="--status-donut:conic-gradient(${stops})"><div><strong>${total}</strong><span>pedidos</span></div></div><ul class="dashboard-status-legend">${legend}</ul>`
    : '<div class="dashboard-chart-empty">Sem pedidos para exibir neste período.</div>';
}

function renderDashboardProducts(orders) {
  const products = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const current = products.get(item.name) || 0;
      products.set(item.name, current + item.quantity);
    }
  }
  const topProducts = [...products.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5);
  const maximum = topProducts[0]?.[1] || 1;
  document.querySelector('#dashboard-top-products').innerHTML = topProducts.length
    ? topProducts.map(([name, quantity], index) => `<div class="dashboard-product-row"><span class="dashboard-product-rank">${String(index + 1).padStart(2, '0')}</span><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><span class="dashboard-product-bar"><i style="--product-share:${quantity / maximum * 100}%"></i></span><small>${quantity} un.</small></div>`).join('')
    : '<div class="dashboard-chart-empty">Ainda não há itens vendidos neste período.</div>';
}

function exportDashboardOrders() {
  const rows = [
    ['Pedido', 'Data', 'Status', 'Itens', 'Subtotal', 'Entrega', 'Total', 'Pagamento'],
    ...dashboardOrders.map(order => [
      order.orderId,
      formatDateTime(order.createdAt),
      orderStages.find(stage => stage.id === (order.status === 'ready' ? 'preparing' : order.status))?.label || 'Pedido realizado',
      order.items.map(item => `${item.quantity}x ${item.name}${item.options?.length ? ` (Escolhas: ${item.options.join(', ')})` : ''}${item.addons?.length ? ` (Adicionais: ${item.addons.join(', ')})` : ''}`).join(', '),
      order.subtotal.toFixed(2),
      order.deliveryFee.toFixed(2),
      order.total.toFixed(2),
      paymentMethodLabel(order.payment)
    ])
  ];
  const csvValue = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = `\uFEFF${rows.map(row => row.map(csvValue).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-pedidos-${selectedPeriod}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function orderCard(order) {
  const displayStatus = order.status === 'ready' ? 'preparing' : order.status;
  const items = order.items.map(item => `${item.quantity}× ${escapeHtml(item.name)}${item.options?.length ? ` (Escolhas: ${escapeHtml(item.options.join(', '))})` : ''}${item.addons?.length ? ` (Adicionais: ${escapeHtml(item.addons.join(', '))})` : ''}`).join(', ');
  const date = formatDateTime(order.createdAt);
  const customer = order.customer?.name ? `<p class="kanban-customer">${escapeHtml(order.customer.name)}</p>` : '';
  const address = order.customer?.address ? `<p class="kanban-address">${escapeHtml(order.customer.address)}</p>` : '';
  const phone = order.customer?.phone ? `<p class="kanban-address">Telefone: ${escapeHtml(order.customer.phone)}</p>` : '';
  const reference = order.customer?.reference ? `<p class="kanban-address">Referência: ${escapeHtml(order.customer.reference)}</p>` : '';
  return `<article class="kanban-card" draggable="true" data-order-id="${escapeHtml(order.orderId)}"><header><strong>Pedido #${escapeHtml(order.orderId.slice(0, 8).toUpperCase())}</strong><span>${date}</span></header>${customer}<p class="kanban-items">${items}</p>${address}${phone}${reference}<div class="kanban-card-footer"><strong>${formatCurrency(order.total)}</strong><select data-kanban-status="${escapeHtml(order.orderId)}" aria-label="Etapa do pedido">${orderStages.map(stage => `<option value="${stage.id}" ${stage.id === displayStatus ? 'selected' : ''}>${stage.label}</option>`).join('')}</select></div></article>`;
}

async function loadKanban() {
  if (kanbanLoading) return;
  kanbanLoading = true;
  try {
    const orders = await adminRequest(`/api/admin/orders?period=${kanbanPeriod}`);
    document.querySelector('#orders-kanban').innerHTML = orderStages.map(stage => {
      const stageOrders = orders.filter(order => (order.status === 'ready' ? 'preparing' : order.status || 'new') === stage.id);
      return `<section class="kanban-column" data-kanban-column="${stage.id}"><header><h3>${stage.label}</h3><span>${stageOrders.length}</span></header><div class="kanban-dropzone" data-drop-status="${stage.id}">${stageOrders.length ? stageOrders.map(orderCard).join('') : '<div class="kanban-empty">Solte pedidos aqui</div>'}</div></section>`;
    }).join('');
  } finally {
    kanbanLoading = false;
  }
}

async function moveOrder(orderId, status) {
  try {
    await adminRequest(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    await Promise.all([loadKanban(), loadDashboard()]);
  } catch (error) { showAdminToast(error.message); await loadKanban(); }
}

async function refreshAdminOrderBoards() {
  if (!document.querySelector('#admin-dashboard-view') || document.querySelector('#admin-dashboard-view').hidden) return;
  if (requestedAdminSection === 'dashboard' || requestedAdminSection === 'orders') {
    await Promise.all([loadKanban(), loadDashboard()]);
  }
}

function applyDashboardFilter() {
  const filter = document.querySelector('#dashboard-filter').value;
  document.querySelectorAll('[data-dashboard-group]').forEach(metric => { metric.hidden = filter !== 'all' && metric.dataset.dashboardGroup !== filter; });
  document.querySelector('#admin-orders-section').hidden = filter === 'revenue';
}

function renderEmployeeOptions() {
  const select = document.querySelector('#timeclock-employee');
  const selected = select.value;
  select.innerHTML = '<option value="">Selecione um colaborador</option>' + adminEmployees.map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}</option>`).join('');
  if (adminEmployees.some(employee => employee.id === selected)) select.value = selected;
}

function productMarkup(product) {
  const price = product.promotionPercentage ? `<small><s>${formatCurrency(product.price)}</s> ${formatCurrency(product.salePrice)} · Promoção ${product.promotionPercentage}%</small>` : `<small>${escapeHtml(product.category)} · ${formatCurrency(product.price)}</small>`;
  return `<article class="menu-product-row ${product.active ? '' : 'product-hidden'}">${product.image ? `<img src="${escapeHtml(product.image)}" alt="" />` : '<div class="menu-product-no-image"></div>'}<div class="menu-product-info"><strong>${escapeHtml(product.name)}${product.active ? '' : ' · Oculto'}</strong>${price}<span>${escapeHtml(product.description)}</span></div><div class="menu-product-actions"><button type="button" data-toggle-product="${product.id}">${product.active ? 'Ocultar da vitrine' : 'Exibir na vitrine'}</button><button type="button" data-edit-product="${product.id}">Editar</button><button type="button" data-delete-product="${product.id}" class="employee-delete">Excluir</button></div></article>`;
}

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function promotionMarkup(promotion) {
  const statusLabel = { active: 'Ativa', scheduled: 'Agendada', ended: 'Encerrada', hidden: 'Produto oculto' }[promotion.status] || 'Ativa';
  const start = promotion.startsAt ? formatDateTime(promotion.startsAt) : 'Imediata';
  const end = promotion.endsAt ? formatDateTime(promotion.endsAt) : 'Sem horário final';
  return `<article class="promotion-list-item ${promotion.status === 'ended' ? 'promotion-ended' : ''}"><div class="promotion-list-product"><strong>${escapeHtml(promotion.productName)}</strong><span class="promotion-status status-${promotion.status}">${statusLabel}</span></div><div class="promotion-list-price"><span>Desconto ${promotion.percentage}%</span><span><s>${formatCurrency(promotion.basePrice)}</s> <strong>${formatCurrency(promotion.salePrice)}</strong></span></div><div class="promotion-list-schedule"><span>Início: ${escapeHtml(start)}</span><span>Fim: ${escapeHtml(end)}</span></div><div class="promotion-list-actions"><button type="button" data-edit-promotion="${escapeHtml(promotion.id)}">Editar</button><button type="button" class="employee-delete" data-delete-promotion="${escapeHtml(promotion.id)}">Apagar</button></div></article>`;
}

async function loadAdminMenu() {
  const menu = await adminRequest('/api/admin/menu');
  adminMenuProducts = menu.products;
  const groups = menu.groups.map(group => typeof group === 'string' ? { name: group, visibleInStorefront: true } : group);
  const orderedGroups = getStoredGroupOrder(groups.map(group => group.name));
  adminMenuGroups = orderedGroups;
  const groupSettings = new Map(groups.map(group => [group.name, group]));
  const categorySelect = document.querySelector('#menu-product-category');
  const currentCategory = categorySelect.value;
  categorySelect.innerHTML = '<option value="">Selecione um grupo</option>' + orderedGroups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('');
  if (orderedGroups.includes(currentCategory)) categorySelect.value = currentCategory;
  const optionGroupSelect = document.querySelector('#menu-product-option-group');
  const currentOptionGroup = optionGroupSelect.value;
  renderOptionGroupSelect(currentOptionGroup);
  renderComboOptionProducts(null);
  const scheduledProductIds = new Set(menu.promotions.map(promotion => promotion.productId));
  const promotionOptions = '<option value="">Selecione um produto</option>' + menu.products.filter(product => product.active || scheduledProductIds.has(product.id)).map(product => `<option value="${product.id}" data-price="${product.price}">${escapeHtml(product.name)}${product.active ? '' : ' (Oculto)'}</option>`).join('');
  document.querySelector('#promotion-product').innerHTML = promotionOptions;
  document.querySelector('#promotion-list').innerHTML = menu.promotions.length ? menu.promotions.map(promotionMarkup).join('') : '<div class="admin-empty">Nenhuma promoção cadastrada.</div>';
  const productsByCategory = Object.groupBy ? Object.groupBy(menu.products, product => product.category) : menu.products.reduce((groups, product) => ({ ...groups, [product.category]: [...(groups[product.category] || []), product] }), {});
  const orderedProductGroups = orderedGroups.map(group => [group, productsByCategory[group] || []]).filter(([group, products]) => products.length || group === 'Bebidas');
  document.querySelector('#menu-product-list').innerHTML = menu.products.length ? orderedProductGroups.map(([category, products]) => `<section class="menu-product-group"><h3>${escapeHtml(category)}</h3>${products.map(productMarkup).join('')}</section>`).join('') : '<div class="admin-empty">Nenhum produto cadastrado.</div>';
  const productCounts = menu.products.reduce((counts, product) => ({ ...counts, [product.category]: (counts[product.category] || 0) + 1 }), {});
  const protectedGroups = new Set(['Bebidas', 'Complementos', 'Acompanhamentos', 'Molhos']);
  document.querySelector('#group-list').innerHTML = orderedGroups.map(group => {
    const hasProducts = Boolean(productCounts[group]);
    const usedByCombos = menu.products.some(product => product.optionGroupName === group);
    const protectedGroup = protectedGroups.has(group);
    const deleteTitle = protectedGroup
      ? 'Grupo reservado para adicionais'
      : hasProducts
        ? 'Mova ou exclua os produtos deste grupo antes de removê-lo'
        : usedByCombos
          ? 'Remova este grupo das opções dos combos antes de excluí-lo'
          : `Excluir grupo ${group}`;
    return `<div class="group-row" draggable="true" data-group-name="${escapeHtml(group)}"><span class="group-name">${escapeHtml(group)}</span><small>${productCounts[group] || 0} produtos</small><label class="group-storefront-toggle"><input type="checkbox" data-toggle-group="${escapeHtml(group)}" ${groupSettings.get(group)?.visibleInStorefront === false ? '' : 'checked'} /><span>Mostrar na tela inicial</span></label><button type="button" data-edit-group="${escapeHtml(group)}" ${protectedGroup ? 'disabled title="Grupo reservado para adicionais"' : ''}>Editar</button><button type="button" data-delete-group="${escapeHtml(group)}" ${protectedGroup || hasProducts || usedByCombos ? 'disabled' : ''} title="${escapeHtml(deleteTitle)}">Excluir</button></div>`;
  }).join('');
  saveGroupOrder(orderedGroups);
}

async function updateGroupVisibility(event) {
  const checkbox = event.target.closest('[data-toggle-group]');
  if (!checkbox) return;
  checkbox.disabled = true;
  try {
    await adminRequest(`/api/admin/menu/groups/${encodeURIComponent(checkbox.dataset.toggleGroup)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibleInStorefront: checkbox.checked })
    });
    showAdminToast(checkbox.checked ? 'Grupo exibido na tela inicial.' : 'Grupo oculto da tela inicial.');
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    showAdminToast(error.message);
  } finally {
    checkbox.disabled = false;
  }
}

async function saveProductGroup(event) {
  event.preventDefault();
  const input = document.querySelector('#group-name');
  try {
    await adminRequest('/api/admin/menu/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value.trim() }) });
    input.value = '';
    await loadAdminMenu();
    showAdminToast('Grupo adicionado.');
  } catch (error) { showAdminToast(error.message); }
}

async function handleGroupAction(event) {
  const editButton = event.target.closest('[data-edit-group]');
  if (editButton && !editButton.disabled) {
    const oldName = editButton.dataset.editGroup;
    const name = window.prompt('Novo nome do grupo:', oldName)?.trim();
    if (!name || name === oldName) return;
    try {
      await adminRequest(`/api/admin/menu/groups/${encodeURIComponent(oldName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const groups = [...document.querySelectorAll('#group-list [data-group-name]')].map(row => row.dataset.groupName === oldName ? name : row.dataset.groupName);
      saveGroupOrder(groups);
      await loadAdminMenu();
      showAdminToast('Grupo renomeado.');
    } catch (error) { showAdminToast(error.message); }
    return;
  }
  const button = event.target.closest('[data-delete-group]');
  if (!button || button.disabled) return;
  if (!window.confirm(`Excluir o grupo "${button.dataset.deleteGroup}"?`)) return;
  try {
    await adminRequest(`/api/admin/menu/groups/${encodeURIComponent(button.dataset.deleteGroup)}`, { method: 'DELETE' });
    await loadAdminMenu();
    showAdminToast('Grupo excluído.');
  } catch (error) { showAdminToast(error.message); }
}

function employeeMarkup(employee) {
  const vacations = employee.vacations || [];
  const documentList = employee.documents || [];
  const documents = documentList.map(document => `<a class="employee-document" href="/api/admin/employees/${encodeURIComponent(employee.id)}/documents/${encodeURIComponent(document.id)}">${escapeHtml(document.name)}</a>`).join('');
  const lastPunch = employee.timeEntries?.at(-1)?.timestamp;
  return `<article class="employee-card" data-employee="${escapeHtml(employee.id)}">
    <div class="employee-card-heading"><div><span class="employee-role">${escapeHtml(employee.role)}</span><h3>${escapeHtml(employee.name)}</h3></div><div class="employee-actions"><button type="button" data-edit-employee="${escapeHtml(employee.id)}">Editar</button><button type="button" class="employee-delete" data-delete-employee="${escapeHtml(employee.id)}">Excluir</button></div></div>
    <div class="employee-details"><span>CPF ${escapeHtml(employee.cpf)}</span><span>${escapeHtml(employee.address)}</span><span>Salário ${formatCurrency(employee.salary)}</span><span>Ponto ${escapeHtml(formatDateTime(lastPunch))}</span></div>
    <details class="vacation-panel"><summary>Férias <span>${vacations.length} programação(ões)</span></summary><div class="vacation-list">${vacations.length ? vacations.map(vacation => `<div><strong>${formatDate(vacation.start)} a ${formatDate(vacation.end)}</strong><small>${escapeHtml(vacation.note || 'Sem observação')}</small></div>`).join('') : '<small>Férias ainda não programadas.</small>'}</div><form class="vacation-form" data-vacation-form="${escapeHtml(employee.id)}"><label>Início<input name="start" type="date" required /></label><label>Fim<input name="end" type="date" required /></label><label>Observação<input name="note" maxlength="160" placeholder="Opcional" /></label><button type="submit" class="admin-secondary">Programar férias</button></form></details>
    <div class="employee-documents"><div class="employee-documents-list"><strong class="document-count">Atestados (${documentList.length})</strong>${documents || '<span class="no-documents">Sem atestados anexados</span>'}</div><label class="upload-document">Anexar atestado<input type="file" data-upload-document="${escapeHtml(employee.id)}" accept="application/pdf,image/jpeg,image/png" /></label></div>
  </article>`;
}

async function loadEmployees() {
  adminEmployees = await adminRequest('/api/admin/employees');
  renderEmployeeOptions();
  const employeeList = document.querySelector('#employee-list');
  employeeList.innerHTML = adminEmployees.length ? adminEmployees.map(employeeMarkup).join('') : '<div class="admin-empty">Nenhum colaborador cadastrado. Use “Novo colaborador” para começar.</div>';
}

function setEmployeeForm(employee = null) {
  employeeForm.reset();
  document.querySelector('#employee-id').value = employee?.id || '';
  document.querySelector('#employee-name').value = employee?.name || '';
  document.querySelector('#employee-cpf').value = employee?.cpf || '';
  document.querySelector('#employee-address').value = employee?.address || '';
  document.querySelector('#employee-salary').value = employee?.salary ?? '';
  document.querySelector('#employee-role').value = employee?.role || '';
  employeeForm.hidden = false;
  employeeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitEmployee(event) {
  event.preventDefault();
  const id = document.querySelector('#employee-id').value;
  const payload = {
    name: document.querySelector('#employee-name').value.trim(),
    cpf: document.querySelector('#employee-cpf').value.replace(/\D/g, ''),
    address: document.querySelector('#employee-address').value.trim(),
    salary: Number(document.querySelector('#employee-salary').value),
    role: document.querySelector('#employee-role').value.trim(),
  };
  try {
    await adminRequest(id ? `/api/admin/employees/${encodeURIComponent(id)}` : '/api/admin/employees', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    employeeForm.hidden = true;
    await Promise.all([loadEmployees(), loadDashboard()]);
    showAdminToast('Cadastro salvo.');
  } catch (error) { showAdminToast(error.message); }
}

function showAdminToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

async function handleEmployeeAction(event) {
  const editButton = event.target.closest('[data-edit-employee]');
  if (editButton) return setEmployeeForm(adminEmployees.find(employee => employee.id === editButton.dataset.editEmployee));
  const deleteButton = event.target.closest('[data-delete-employee]');
  if (deleteButton) {
    if (!window.confirm('Excluir este colaborador e os documentos anexados?')) return;
    try { await adminRequest(`/api/admin/employees/${encodeURIComponent(deleteButton.dataset.deleteEmployee)}`, { method: 'DELETE' }); await Promise.all([loadEmployees(), loadDashboard()]); } catch (error) { showAdminToast(error.message); }
  }
}

async function handleVacationSchedule(event) {
  const form = event.target.closest('[data-vacation-form]');
  if (!form) return;
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  try {
    await adminRequest(`/api/admin/employees/${encodeURIComponent(form.dataset.vacationForm)}/vacations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await Promise.all([loadEmployees(), loadDashboard()]);
    showAdminToast('Férias programadas.');
  } catch (error) { showAdminToast(error.message); }
}

function renderOptionGroupSelect(selectedGroup = '') {
  const category = document.querySelector('#menu-product-category').value;
  const select = document.querySelector('#menu-product-option-group');
  const candidates = adminMenuGroups.filter(group => group !== category && !['Bebidas', 'Complementos', 'Acompanhamentos', 'Molhos'].includes(group));
  select.innerHTML = '<option value="">Não usa escolhas adicionais</option>' + candidates.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('');
  select.value = candidates.includes(selectedGroup) ? selectedGroup : '';
}

function setProductForm(product = null) {
  const form = document.querySelector('#menu-form');
  form.reset();
  document.querySelector('#menu-product-id').value = product?.id || '';
  document.querySelector('#menu-product-name').value = product?.name || '';
  const categorySelect = document.querySelector('#menu-product-category');
  if (product?.category && ![...categorySelect.options].some(option => option.value === product.category)) categorySelect.add(new Option(product.category, product.category));
  categorySelect.value = product?.category || '';
  renderOptionGroupSelect(product?.optionGroupName || '');
  document.querySelector('#menu-product-max-options').value = product?.maxOptionSelections || 4;
  const configuredOptionIds = product?.optionProductIds?.length
    ? product.optionProductIds
    : product?.optionGroupName
      ? adminMenuProducts.filter(option => option.active && option.category === product.optionGroupName).map(option => option.id)
      : [];
  renderComboOptionProducts(configuredOptionIds);
  document.querySelector('#menu-product-price').value = product?.price ?? '';
  document.querySelector('#menu-product-description').value = product?.description || '';
  document.querySelector('#menu-product-active').value = String(product?.active ?? true);
  form.dataset.currentImage = product?.image || '';
  const imagePreview = document.querySelector('#menu-image-preview');
  imagePreview.hidden = !product?.image;
  if (product?.image) imagePreview.querySelector('img').src = product.image;
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderComboOptionProducts(selectedIds = null) {
  const groupName = document.querySelector('#menu-product-option-group').value;
  const fieldset = document.querySelector('#combo-option-products');
  const list = document.querySelector('#combo-option-product-list');
  const limitInput = document.querySelector('#menu-product-max-options');
  fieldset.hidden = !groupName;
  limitInput.disabled = !groupName;
  const products = adminMenuProducts.filter(product => product.active && product.category === groupName);
  if (!groupName) {
    list.innerHTML = '';
    return;
  }
  if (!products.length) {
    list.innerHTML = '<span class="combo-option-empty">Este grupo ainda não tem produtos ativos.</span>';
    return;
  }
  const selected = selectedIds == null ? new Set(products.map(product => product.id)) : new Set(selectedIds);
  list.innerHTML = products.map(product => `<label class="combo-option-product"><input type="checkbox" data-combo-product-id="${product.id}" ${selected.has(product.id) ? 'checked' : ''} /><span>${escapeHtml(product.name)}</span></label>`).join('');
}

async function saveMenuProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = document.querySelector('#menu-product-id').value;
  let image = form.dataset.currentImage || '';
  const file = document.querySelector('#menu-product-image').files[0];
  try {
    if (file) {
      const imageForm = new FormData();
      imageForm.append('image', file);
      const upload = await adminRequest('/api/admin/menu/images', { method: 'POST', body: imageForm });
      image = upload.image;
    }
    const category = document.querySelector('#menu-product-category').value;
    if (!image && !['Complementos', 'Acompanhamentos', 'Molhos'].includes(category)) throw new Error('Selecione uma imagem para produtos da vitrine.');
    const optionGroupName = document.querySelector('#menu-product-option-group').value || null;
    const maxOptionSelections = optionGroupName ? Number(document.querySelector('#menu-product-max-options').value) : 0;
    const optionProductIds = optionGroupName
      ? [...document.querySelectorAll('#combo-option-product-list [data-combo-product-id]:checked')].map(input => Number(input.dataset.comboProductId))
      : [];
    if (optionGroupName && (!Number.isInteger(maxOptionSelections) || maxOptionSelections < 1 || maxOptionSelections > 4)) throw new Error('Defina de 1 a 4 opções diferentes para o combo.');
    if (optionGroupName && !optionProductIds.length) throw new Error('Marque pelo menos um produto disponível para este combo.');
    const payload = { name: document.querySelector('#menu-product-name').value.trim(), category, description: document.querySelector('#menu-product-description').value.trim(), price: Number(document.querySelector('#menu-product-price').value), image, active: document.querySelector('#menu-product-active').value === 'true', optionGroupName, maxOptionSelections, optionProductIds };
    await adminRequest(id ? `/api/admin/menu/products/${encodeURIComponent(id)}` : '/api/admin/menu/products', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    form.hidden = true;
    await loadAdminMenu();
    showAdminToast('Produto salvo no cardápio.');
  } catch (error) { showAdminToast(error.message); }
}

async function handleMenuAction(event) {
  const toggle = event.target.closest('[data-toggle-product]');
  if (toggle) {
    try {
      const menu = await adminRequest('/api/admin/menu');
      const product = menu.products.find(item => item.id === Number(toggle.dataset.toggleProduct));
      if (!product) return;
      const { promotionPercentage, salePrice, originalPrice, ...productData } = product;
      await adminRequest(`/api/admin/menu/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...productData, active: !product.active }) });
      await loadAdminMenu();
      showAdminToast(product.active ? 'Produto ocultado da vitrine.' : 'Produto exibido na vitrine.');
    } catch (error) { showAdminToast(error.message); }
    return;
  }
  const edit = event.target.closest('[data-edit-product]');
  if (edit) {
    const menu = await adminRequest('/api/admin/menu');
    return setProductForm(menu.products.find(product => product.id === Number(edit.dataset.editProduct)));
  }
  const remove = event.target.closest('[data-delete-product]');
  if (remove) {
    if (!window.confirm('Excluir este produto do cardápio?')) return;
    try { await adminRequest(`/api/admin/menu/products/${remove.dataset.deleteProduct}`, { method: 'DELETE' }); await loadAdminMenu(); } catch (error) { showAdminToast(error.message); }
    return;
  }
  const editPromotion = event.target.closest('[data-edit-promotion]');
  if (editPromotion) {
    try {
      const menu = await adminRequest('/api/admin/menu');
      setPromotionForm(menu.promotions.find(promotion => promotion.id === editPromotion.dataset.editPromotion));
    } catch (error) { showAdminToast(error.message); }
    return;
  }
  const deletePromotion = event.target.closest('[data-delete-promotion]');
  if (deletePromotion) {
    if (!window.confirm('Apagar esta promoção?')) return;
    try { await adminRequest(`/api/admin/menu/promotions/${encodeURIComponent(deletePromotion.dataset.deletePromotion)}`, { method: 'DELETE' }); await loadAdminMenu(); } catch (error) { showAdminToast(error.message); }
    return;
  }
}

function setPromotionForm(promotion = null) {
  const form = document.querySelector('#promotion-form');
  form.reset();
  document.querySelector('#promotion-id').value = promotion?.id || '';
  document.querySelector('#promotion-product').value = promotion?.productId || '';
  document.querySelector('#promotion-percent').value = promotion?.percentage ?? '';
  document.querySelector('#promotion-start').value = toLocalDateTime(promotion?.startsAt);
  document.querySelector('#promotion-end').value = toLocalDateTime(promotion?.endsAt);
  form.hidden = false;
  updatePromotionPreview();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updatePromotionPreview() {
  const select = document.querySelector('#promotion-product');
  const percentage = Number(document.querySelector('#promotion-percent').value);
  const option = select.selectedOptions[0];
  const basePrice = Number(option?.dataset.price);
  const preview = document.querySelector('#promotion-preview');
  if (!select.value || !Number.isFinite(basePrice) || !percentage) { preview.textContent = 'Selecione produto e porcentagem'; return; }
  if (percentage < 1 || percentage > 90) { preview.textContent = 'Informe de 1% a 90%'; return; }
  const finalPrice = Math.round(basePrice * (100 - percentage)) / 100;
  preview.innerHTML = `De <s>${formatCurrency(basePrice)}</s> por <strong>${formatCurrency(finalPrice)}</strong>`;
}

async function submitPromotion(event) {
  event.preventDefault();
  const id = document.querySelector('#promotion-id').value;
  const productId = document.querySelector('#promotion-product').value;
  const percentage = Number(document.querySelector('#promotion-percent').value);
  const startValue = document.querySelector('#promotion-start').value;
  const endValue = document.querySelector('#promotion-end').value;
  if (!productId || !Number.isInteger(percentage) || percentage < 1 || percentage > 90) return showAdminToast('Selecione um produto e informe um desconto de 1% a 90%.');
  if (startValue && endValue && new Date(endValue) <= new Date(startValue)) return showAdminToast('O fim da promoção precisa ser depois do início.');
  const payload = { productId: Number(productId), percentage };
  if (startValue) payload.startsAt = new Date(startValue).toISOString();
  if (endValue) payload.endsAt = new Date(endValue).toISOString();
  try {
    await adminRequest(id ? `/api/admin/menu/promotions/${encodeURIComponent(id)}` : '/api/admin/menu/promotions', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    document.querySelector('#promotion-form').hidden = true;
    await loadAdminMenu();
    showAdminToast(id ? 'Promoção atualizada.' : 'Promoção agendada.');
  } catch (error) { showAdminToast(error.message); }
}

async function uploadMedicalDocument(event) {
  const input = event.target.closest('[data-upload-document]');
  const file = input?.files?.[0];
  if (!input || !file) return;
  const formData = new FormData();
  formData.append('document', file);
  try {
    await adminRequest(`/api/admin/employees/${encodeURIComponent(input.dataset.uploadDocument)}/documents`, { method: 'POST', body: formData });
    input.value = '';
    await Promise.all([loadEmployees(), loadDashboard()]);
    showAdminToast('Atestado anexado.');
  } catch (error) { showAdminToast(error.message); input.value = ''; }
}

async function registerTimeclock() {
  const employeeId = document.querySelector('#timeclock-employee').value;
  if (!employeeId) return showAdminToast('Selecione um colaborador.');
  try {
    await adminRequest(`/api/admin/employees/${encodeURIComponent(employeeId)}/timeclock`, { method: 'POST' });
    await Promise.all([loadEmployees(), loadDashboard()]);
    showAdminToast('Ponto registrado com horário atual.');
  } catch (error) { showAdminToast(error.message); }
}

async function updateWhatsAppLink() {
  const supportLink = document.querySelector('#support-whatsapp');
  try {
    const config = await adminRequest('/api/public-config');
    if (config.whatsapp) {
      supportLink.href = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent('Olá! Preciso de ajuda com meu pedido.')}`;
      supportLink.classList.remove('support-unconfigured');
    } else {
      supportLink.href = '#';
      supportLink.classList.add('support-unconfigured');
      supportLink.addEventListener('click', event => { event.preventDefault(); showAdminToast('Configure STORE_WHATSAPP no arquivo .env da loja.'); });
    }
  } catch { supportLink.href = '#'; }
}

document.querySelector('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  adminLoginFeedback.textContent = '';
  try {
    const payload = { username: document.querySelector('#admin-username').value.trim(), password: document.querySelector('#admin-password').value };
    const result = await adminRequest('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    document.querySelector('#admin-password').value = '';
    pendingLoginChallenge = result.challengeToken;
    document.querySelector('#admin-login-form').hidden = true;
    document.querySelector('#admin-email-code-description').textContent = `Enviamos um código de seis dígitos para ${result.email}. O código expira em 10 minutos.`;
    document.querySelector('#admin-email-code').value = '';
    adminEmailCodeFeedback.textContent = '';
    adminEmailCodeForm.hidden = false;
    document.querySelector('#admin-email-code').focus();
  } catch (error) { adminLoginFeedback.textContent = error.message; }
});

adminEmailCodeForm.addEventListener('submit', async event => {
  event.preventDefault();
  adminEmailCodeFeedback.textContent = '';
  try {
    const result = await adminRequest('/api/admin/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: pendingLoginChallenge, code: document.querySelector('#admin-email-code').value.trim() })
    });
    pendingLoginChallenge = '';
    adminEmailCodeForm.hidden = true;
    history.replaceState(null, '', `/admin#admin/${requestedAdminSection}`);
    await showAdminDashboard(result.profile);
  } catch (error) {
    adminEmailCodeFeedback.textContent = error.message;
  }
});

document.querySelector('#admin-email-code-back').addEventListener('click', () => {
  pendingLoginChallenge = '';
  adminEmailCodeForm.reset();
  adminEmailCodeForm.hidden = true;
  document.querySelector('#admin-login-form').hidden = false;
  adminEmailCodeFeedback.textContent = '';
});

document.querySelector('#admin-logout').addEventListener('click', async () => {
  try { await adminRequest('/api/admin/session', { method: 'DELETE' }); } finally {
    history.replaceState(null, '', '/login');
    adminDashboardView.hidden = true;
    adminLoginView.hidden = false;
    adminEmailCodeForm.hidden = true;
    document.querySelector('#admin-login-form').hidden = false;
    document.querySelector('#admin-profile-nav').hidden = true;
    document.querySelector('#admin-subnav').hidden = true;
  }
});

window.addEventListener('comandix:order-created', () => {
  refreshAdminOrderBoards().catch(error => showAdminToast(error.message));
});

document.querySelector('#new-employee-button')?.addEventListener('click', () => setEmployeeForm());
document.querySelector('#cancel-employee')?.addEventListener('click', () => { if (employeeForm) { employeeForm.hidden = true; employeeForm.reset(); } });
employeeForm?.addEventListener('submit', submitEmployee);
document.querySelector('#employee-list')?.addEventListener('click', handleEmployeeAction);
document.querySelector('#employee-list')?.addEventListener('submit', handleVacationSchedule);
document.querySelector('#employee-list')?.addEventListener('change', uploadMedicalDocument);
document.querySelector('#register-timeclock')?.addEventListener('click', registerTimeclock);
document.querySelector('#new-product-button')?.addEventListener('click', () => setProductForm());
document.querySelector('#manage-groups-button')?.addEventListener('click', () => { const manager = document.querySelector('#group-manager'); manager.hidden = !manager.hidden; });
document.querySelector('#group-form')?.addEventListener('submit', saveProductGroup);
document.querySelector('#group-list')?.addEventListener('click', handleGroupAction);
document.querySelector('#group-list')?.addEventListener('change', updateGroupVisibility);
document.querySelector('#group-list')?.addEventListener('dragstart', event => {
  const groupRow = event.target.closest('[data-group-name]');
  if (!groupRow) return;
  event.dataTransfer.setData('text/plain', groupRow.dataset.groupName);
  event.dataTransfer.effectAllowed = 'move';
});
document.querySelector('#group-list')?.addEventListener('dragover', event => {
  const groupRow = event.target.closest('[data-group-name]');
  if (!groupRow) return;
  event.preventDefault();
  groupRow.classList.add('drag-over');
});
document.querySelector('#group-list')?.addEventListener('dragleave', event => {
  const groupRow = event.target.closest('[data-group-name]');
  if (!groupRow) return;
  groupRow.classList.remove('drag-over');
});
document.querySelector('#group-list')?.addEventListener('drop', event => {
  const groupRow = event.target.closest('[data-group-name]');
  if (!groupRow) return;
  event.preventDefault();
  const dragged = event.dataTransfer.getData('text/plain');
  const groups = [...document.querySelectorAll('#group-list [data-group-name]')].map(item => item.dataset.groupName);
  const fromIndex = groups.indexOf(dragged);
  const toIndex = groups.indexOf(groupRow.dataset.groupName);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
  groups.splice(fromIndex, 1);
  groups.splice(toIndex, 0, dragged);
  saveGroupOrder(groups);
  loadAdminMenu().catch(error => showAdminToast(error.message));
  groupRow.classList.remove('drag-over');
});
document.querySelector('#group-list')?.addEventListener('dragend', event => {
  const groupRow = event.target.closest('[data-group-name]');
  if (groupRow) groupRow.classList.remove('drag-over');
});
document.querySelector('#cancel-product')?.addEventListener('click', () => { const menuForm = document.querySelector('#menu-form'); if (menuForm) { menuForm.hidden = true; menuForm.reset(); } });
document.querySelector('#menu-form')?.addEventListener('submit', saveMenuProduct);
document.querySelector('#menu-product-option-group')?.addEventListener('change', () => renderComboOptionProducts());
document.querySelector('#menu-product-category')?.addEventListener('change', () => {
  const selectedIds = [...document.querySelectorAll('#combo-option-product-list [data-combo-product-id]:checked')].map(input => Number(input.dataset.comboProductId));
  const selectedGroup = document.querySelector('#menu-product-option-group').value;
  renderOptionGroupSelect(selectedGroup);
  renderComboOptionProducts(selectedIds);
});
document.querySelector('#menu-product-list')?.addEventListener('click', handleMenuAction);
document.querySelector('#promotion-list')?.addEventListener('click', handleMenuAction);
document.querySelector('#remove-product-image')?.addEventListener('click', () => {
  const form = document.querySelector('#menu-form');
  form.dataset.currentImage = '';
  document.querySelector('#menu-product-image').value = '';
  document.querySelector('#menu-image-preview').hidden = true;
});
document.querySelector('#add-promotion-button')?.addEventListener('click', () => setPromotionForm());
document.querySelector('#cancel-promotion')?.addEventListener('click', () => { const promotionForm = document.querySelector('#promotion-form'); if (promotionForm) { promotionForm.hidden = true; promotionForm.reset(); } });
document.querySelector('#promotion-form')?.addEventListener('submit', submitPromotion);
document.querySelector('#promotion-product')?.addEventListener('change', updatePromotionPreview);
document.querySelector('#promotion-percent')?.addEventListener('input', updatePromotionPreview);
document.querySelector('#dashboard-filter')?.addEventListener('change', applyDashboardFilter);
document.querySelector('#admin-account-form')?.addEventListener('submit', submitAdminAccount);
document.querySelector('#admin-account-list')?.addEventListener('click', handleAdminAccountAction);
document.querySelector('#refresh-kanban')?.addEventListener('click', () => loadKanban().catch(error => showAdminToast(error.message)));
document.querySelectorAll('[data-kanban-period]').forEach(button => {
  button.classList.toggle('active', button.dataset.kanbanPeriod === kanbanPeriod);
  button.addEventListener('click', () => {
    kanbanPeriod = button.dataset.kanbanPeriod;
    document.querySelectorAll('[data-kanban-period]').forEach(item => item.classList.toggle('active', item === button));
    try { localStorage.setItem(kanbanPeriodStorageKey, kanbanPeriod); } catch {}
    loadKanban().catch(error => showAdminToast(error.message));
  });
});
const ordersKanban = document.querySelector('#orders-kanban');
ordersKanban?.addEventListener('change', event => {
  const select = event.target.closest('[data-kanban-status]');
  if (select) moveOrder(select.dataset.kanbanStatus, select.value);
});
ordersKanban.addEventListener('dragstart', event => {
  const card = event.target.closest('[data-order-id]');
  if (card) { event.dataTransfer.setData('text/plain', card.dataset.orderId); event.dataTransfer.effectAllowed = 'move'; }
});
ordersKanban.addEventListener('dragover', event => {
  const zone = event.target.closest('[data-drop-status]');
  if (zone) { event.preventDefault(); zone.classList.add('drag-over'); }
});
ordersKanban.addEventListener('dragleave', event => { const zone = event.target.closest('[data-drop-status]'); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over'); });
ordersKanban.addEventListener('drop', event => {
  const zone = event.target.closest('[data-drop-status]');
  if (!zone) return;
  event.preventDefault();
  const orderId = event.dataTransfer.getData('text/plain');
  zone.classList.remove('drag-over');
  if (orderId) moveOrder(orderId, zone.dataset.dropStatus);
});
document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', async () => {
  selectedPeriod = button.dataset.period;
  document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button));
  try { await loadDashboard(); } catch (error) { showAdminToast(error.message); }
}));
document.querySelector('#dashboard-export')?.addEventListener('click', exportDashboardOrders);
document.querySelector('#dashboard-print')?.addEventListener('click', () => window.print());
document.querySelectorAll('[data-admin-section]').forEach(button => {
  button.addEventListener('click', async event => {
    event.preventDefault();
    await navigateAdminSection(button.dataset.adminSection);
  });
});
document.querySelector('.sidebar').addEventListener('click', event => {
  const adminLink = event.target.closest('[data-page="admin"]');
  if (adminLink) {
    event.preventDefault();
    navigateAdminSection('dashboard');
  }
});
updateWhatsAppLink();
const adminPath = window.location.pathname.replace(/\/+$/, '') || '/';
const adminRoute = window.location.hash.match(/^#admin(?:\/(dashboard|orders|menu|profile))?$/);
if (adminPath === '/login' || adminPath === '/admin') {
  requestedAdminSection = adminRoute?.[1] || 'dashboard';
  loadAdminSession();
}
