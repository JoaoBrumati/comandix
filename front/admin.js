const adminLoginView = document.querySelector('#admin-login-view');
const adminDashboardView = document.querySelector('#admin-dashboard-view');
const adminLoginFeedback = document.querySelector('#admin-login-feedback');
const employeeForm = document.querySelector('#employee-form');
let selectedPeriod = 'daily';
let requestedAdminSection = 'dashboard';
let kanbanRefreshTimer = null;
let kanbanLoading = false;
const orderStages = [
  { id: 'new', label: 'Pedido realizado' },
  { id: 'preparing', label: 'Pedido em produção' },
  { id: 'ready', label: 'Pedido pronto' },
  { id: 'out_for_delivery', label: 'Pedido em rota de entrega' },
  { id: 'completed', label: 'Pedido entregue' },
  { id: 'cancelled', label: 'Pedido cancelado' }
];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatCurrency = value => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const formatDate = value => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não programada';
const formatDateTime = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nenhum ponto registrado';

async function adminRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

async function loadAdminSession() {
  try {
    await adminRequest('/api/admin/session');
    await showAdminDashboard();
  } catch {
    adminLoginView.hidden = false;
    adminDashboardView.hidden = true;
    document.querySelector('#admin-subnav').hidden = true;
  }
}

async function showAdminDashboard() {
  adminLoginView.hidden = true;
  adminDashboardView.hidden = false;
  document.querySelector('#admin-subnav').hidden = false;
  await showAdminSection(requestedAdminSection);
}

async function showAdminSection(section) {
  if (!['dashboard', 'orders', 'menu'].includes(section)) section = 'dashboard';
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
}

async function navigateAdminSection(section) {
  const normalized = ['dashboard', 'orders', 'menu'].includes(section) ? section : 'dashboard';
  requestedAdminSection = normalized;
  document.querySelectorAll('.page-view').forEach(view => view.classList.toggle('active', view.id === 'admin-page'));
  document.querySelectorAll('[data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === 'admin'));
  document.querySelector('.sidebar').classList.remove('open');
  history.replaceState(null, '', `#admin/${normalized}`);
  try {
    await adminRequest('/api/admin/session');
    await showAdminSection(normalized);
  } catch {
    adminLoginView.hidden = false;
    adminDashboardView.hidden = true;
    document.querySelector('#admin-subnav').hidden = true;
  }
}

async function loadDashboard() {
  const data = await adminRequest(`/api/admin/dashboard?period=${selectedPeriod}`);
  const metrics = [
    ['Pedidos', data.orderCount, 'Pedidos no período'],
    ['Faturamento', formatCurrency(data.revenue), 'Vendas com entrega'],
    ['Taxas de entrega', formatCurrency(data.deliveryRevenue), 'Fretes cobrados']
  ];
  document.querySelector('#admin-metrics').innerHTML = metrics.map(([title, value, note], index) => `<article class="admin-metric" data-dashboard-group="${index === 0 ? 'orders' : 'revenue'}"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
  document.querySelector('#admin-orders-summary').innerHTML = data.orders.length ? data.orders.map(order => `<article class="admin-order-row"><div><strong>${escapeHtml(order.items.map(item => `${item.quantity}x ${item.name}`).join(', '))}</strong><small>${formatDateTime(order.createdAt)} · ${escapeHtml(order.payment.method.toUpperCase())}</small></div><span>Itens ${formatCurrency(order.subtotal)}<small>Entrega ${formatCurrency(order.deliveryFee)}</small></span><b>${formatCurrency(order.total)}</b></article>`).join('') : '<div class="admin-empty">Ainda não há pedidos registrados neste período.</div>';
  applyDashboardFilter();
}

function orderCard(order) {
  const items = order.items.map(item => `${item.quantity}× ${escapeHtml(item.name)}`).join(', ');
  const date = formatDateTime(order.createdAt);
  const customer = order.customer?.name ? `<p class="kanban-customer">${escapeHtml(order.customer.name)}</p>` : '';
  const address = order.customer?.address ? `<p class="kanban-address">${escapeHtml(order.customer.address)}</p>` : '';
  const phone = order.customer?.phone ? `<p class="kanban-address">Telefone: ${escapeHtml(order.customer.phone)}</p>` : '';
  const reference = order.customer?.reference ? `<p class="kanban-address">Referência: ${escapeHtml(order.customer.reference)}</p>` : '';
  return `<article class="kanban-card" draggable="true" data-order-id="${escapeHtml(order.orderId)}"><header><strong>Pedido #${escapeHtml(order.orderId.slice(0, 8).toUpperCase())}</strong><span>${date}</span></header>${customer}<p class="kanban-items">${items}</p>${address}${phone}${reference}<div class="kanban-card-footer"><strong>${formatCurrency(order.total)}</strong><select data-kanban-status="${escapeHtml(order.orderId)}" aria-label="Etapa do pedido">${orderStages.map(stage => `<option value="${stage.id}" ${stage.id === order.status ? 'selected' : ''}>${stage.label}</option>`).join('')}</select></div></article>`;
}

async function loadKanban() {
  if (kanbanLoading) return;
  kanbanLoading = true;
  try {
    const orders = await adminRequest('/api/admin/orders');
    document.querySelector('#orders-kanban').innerHTML = orderStages.map(stage => {
      const stageOrders = orders.filter(order => (order.status || 'new') === stage.id);
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
  return `<article class="menu-product-row ${product.active ? '' : 'product-hidden'}"><img src="${escapeHtml(product.image)}" alt="" /><div class="menu-product-info"><strong>${escapeHtml(product.name)}${product.active ? '' : ' · Oculto'}</strong>${price}<span>${escapeHtml(product.description)}</span></div><div class="menu-product-actions"><button type="button" data-toggle-product="${product.id}">${product.active ? 'Ocultar da vitrine' : 'Exibir na vitrine'}</button><button type="button" data-edit-product="${product.id}">Editar</button><button type="button" data-delete-product="${product.id}" class="employee-delete">Excluir</button></div></article>`;
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
  const scheduledProductIds = new Set(menu.promotions.map(promotion => promotion.productId));
  const promotionOptions = '<option value="">Selecione um produto</option>' + menu.products.filter(product => product.active || scheduledProductIds.has(product.id)).map(product => `<option value="${product.id}" data-price="${product.price}">${escapeHtml(product.name)}${product.active ? '' : ' (Oculto)'}</option>`).join('');
  document.querySelector('#promotion-product').innerHTML = promotionOptions;
  document.querySelector('#promotion-list').innerHTML = menu.promotions.length ? menu.promotions.map(promotionMarkup).join('') : '<div class="admin-empty">Nenhuma promoção cadastrada.</div>';
  document.querySelector('#menu-product-list').innerHTML = menu.products.length ? menu.products.map(productMarkup).join('') : '<div class="admin-empty">Nenhum produto cadastrado.</div>';
  document.querySelector('#addon-list').innerHTML = Object.entries(menu.addons).flatMap(([group, options]) => options.map(option => `<div class="addon-row"><span>${escapeHtml(option.name)}</span><small>${escapeHtml({ drinks: 'Bebidas', sides: 'Acompanhamentos', sauces: 'Molhos' }[group])}</small><strong>${formatCurrency(option.price)}</strong><button type="button" data-delete-addon="${escapeHtml(group)}" data-addon-name="${escapeHtml(option.name)}" aria-label="Excluir ${escapeHtml(option.name)}">×</button></div>`)).join('') || '<div class="admin-empty">Nenhum complemento cadastrado.</div>';
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

function setProductForm(product = null) {
  const form = document.querySelector('#menu-form');
  form.reset();
  document.querySelector('#menu-product-id').value = product?.id || '';
  document.querySelector('#menu-product-name').value = product?.name || '';
  document.querySelector('#menu-product-category').value = product?.category || '';
  document.querySelector('#menu-product-price').value = product?.price ?? '';
  document.querySelector('#menu-product-description').value = product?.description || '';
  document.querySelector('#menu-product-active').value = String(product?.active ?? true);
  form.dataset.currentImage = product?.image || '';
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (!image) throw new Error('Selecione uma imagem para o produto.');
    const payload = { name: document.querySelector('#menu-product-name').value.trim(), category: document.querySelector('#menu-product-category').value.trim(), description: document.querySelector('#menu-product-description').value.trim(), price: Number(document.querySelector('#menu-product-price').value), image, active: document.querySelector('#menu-product-active').value === 'true' };
    await adminRequest(id ? `/api/admin/menu/products/${encodeURIComponent(id)}` : '/api/admin/menu/products', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    form.hidden = true;
    await loadAdminMenu();
    await window.refreshStorefrontCatalog();
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
      await window.refreshStorefrontCatalog();
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
    try { await adminRequest(`/api/admin/menu/products/${remove.dataset.deleteProduct}`, { method: 'DELETE' }); await loadAdminMenu(); await window.refreshStorefrontCatalog(); } catch (error) { showAdminToast(error.message); }
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
    try { await adminRequest(`/api/admin/menu/promotions/${encodeURIComponent(deletePromotion.dataset.deletePromotion)}`, { method: 'DELETE' }); await loadAdminMenu(); await window.refreshStorefrontCatalog(); } catch (error) { showAdminToast(error.message); }
    return;
  }
  const removeAddon = event.target.closest('[data-delete-addon]');
  if (removeAddon) {
    try { await adminRequest(`/api/admin/menu/addons/${removeAddon.dataset.deleteAddon}/${encodeURIComponent(removeAddon.dataset.addonName)}`, { method: 'DELETE' }); await loadAdminMenu(); await window.refreshStorefrontCatalog(); } catch (error) { showAdminToast(error.message); }
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
    await window.refreshStorefrontCatalog();
    showAdminToast(id ? 'Promoção atualizada.' : 'Promoção agendada.');
  } catch (error) { showAdminToast(error.message); }
}

async function addAddon(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { name: document.querySelector('#addon-name').value.trim(), group: document.querySelector('#addon-group').value, price: Number(document.querySelector('#addon-price').value) };
  try { await adminRequest('/api/admin/menu/addons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); form.reset(); await loadAdminMenu(); await window.refreshStorefrontCatalog(); } catch (error) { showAdminToast(error.message); }
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
    await adminRequest('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.querySelector('#admin-username').value.trim(), password: document.querySelector('#admin-password').value }) });
    document.querySelector('#admin-password').value = '';
    await showAdminDashboard();
  } catch (error) { adminLoginFeedback.textContent = error.message; }
});

document.querySelector('#admin-logout').addEventListener('click', async () => {
  try { await adminRequest('/api/admin/session', { method: 'DELETE' }); } finally { adminDashboardView.hidden = true; adminLoginView.hidden = false; document.querySelector('#admin-subnav').hidden = true; }
});

window.addEventListener('anotaai:order-created', () => {
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
document.querySelector('#cancel-product')?.addEventListener('click', () => { const menuForm = document.querySelector('#menu-form'); if (menuForm) { menuForm.hidden = true; menuForm.reset(); } });
document.querySelector('#menu-form')?.addEventListener('submit', saveMenuProduct);
document.querySelector('#menu-product-list')?.addEventListener('click', handleMenuAction);
document.querySelector('#addon-list')?.addEventListener('click', handleMenuAction);
document.querySelector('#promotion-list')?.addEventListener('click', handleMenuAction);
document.querySelector('#addon-form')?.addEventListener('submit', addAddon);
document.querySelector('#add-promotion-button')?.addEventListener('click', () => setPromotionForm());
document.querySelector('#cancel-promotion')?.addEventListener('click', () => { const promotionForm = document.querySelector('#promotion-form'); if (promotionForm) { promotionForm.hidden = true; promotionForm.reset(); } });
document.querySelector('#promotion-form')?.addEventListener('submit', submitPromotion);
document.querySelector('#promotion-product')?.addEventListener('change', updatePromotionPreview);
document.querySelector('#promotion-percent')?.addEventListener('input', updatePromotionPreview);
document.querySelector('#dashboard-filter')?.addEventListener('change', applyDashboardFilter);
document.querySelector('#refresh-kanban')?.addEventListener('click', () => loadKanban().catch(error => showAdminToast(error.message)));
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
