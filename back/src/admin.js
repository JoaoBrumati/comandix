const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { addons: defaultAddons, addonPrices, catalog, products: defaultProducts } = require('./catalog');

const employees = new Map();
const documents = new Map();
const menuProducts = new Map(defaultProducts.map(product => [product.id, { ...product }]));
const addonGroups = structuredClone(defaultAddons);
const orders = [];
const orderStatuses = new Set(['new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
const dataFile = path.join(__dirname, '..', 'data', 'admin-store.enc');
let promotions = [];
let encryptionKey = null;
let storeSalt = null;
const employeeSchema = z.object({
  name: z.string().trim().min(5).max(100),
  cpf: z.string().regex(/^\d{11}$/),
  address: z.string().trim().min(8).max(240),
  salary: z.number().finite().min(0).max(1000000),
  role: z.string().trim().min(2).max(80)
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  description: z.string().trim().min(3).max(500),
  price: z.number().finite().min(0).max(100000),
  image: z.string().trim().min(1).max(240),
  active: z.boolean().default(true)
});

function isValidCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;
  const digit = length => {
    const sum = cpf.slice(0, length).split('').reduce((total, value, index) => total + Number(value) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function encryptStore() {
  if (!encryptionKey) return;
  const state = {
    employees: [...employees.values()],
    documents: [...documents.values()].map(document => ({ ...document, buffer: document.buffer.toString('base64') })),
    products: [...menuProducts.values()],
    addons: addonGroups,
    orders,
    promotions
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  const contents = JSON.stringify({ salt: storeSalt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, contents, { mode: 0o600 });
  fs.renameSync(temporaryFile, dataFile);
}

function initializeAdminStore(password) {
  if (encryptionKey) return;
  const pendingOrders = [...orders];
  if (fs.existsSync(dataFile)) {
    const encryptedStore = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const salt = Buffer.from(encryptedStore.salt, 'base64');
    const derivedKey = crypto.scryptSync(password, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(encryptedStore.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(encryptedStore.tag, 'base64'));
    const state = Buffer.concat([decipher.update(Buffer.from(encryptedStore.data, 'base64')), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(state);
    parsed.employees.forEach(employee => employees.set(employee.id, employee));
    parsed.documents.forEach(document => documents.set(document.id, { ...document, buffer: Buffer.from(document.buffer, 'base64') }));
    menuProducts.clear();
    (parsed.products || defaultProducts).forEach(product => menuProducts.set(product.id, product));
    for (const group of Object.keys(addonGroups)) addonGroups[group] = parsed.addons?.[group] || structuredClone(defaultAddons[group]);
    orders.splice(0, orders.length, ...(parsed.orders || []), ...pendingOrders);
    orders.forEach(order => { order.status ||= 'new'; });
    promotions = Array.isArray(parsed.promotions) ? parsed.promotions.map(promotion => ({ ...promotion, id: promotion.id || crypto.randomUUID() })) : [];
    syncCatalog();
    storeSalt = salt;
    encryptionKey = derivedKey;
    return;
  }
  storeSalt = crypto.randomBytes(16);
  encryptionKey = crypto.scryptSync(password, storeSalt, 32);
  encryptStore();
}

function validateEmployee(payload) {
  const parsed = employeeSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Confira os dados do colaborador.', details: parsed.error.flatten() };
  if (!isValidCpf(parsed.data.cpf)) return { error: 'CPF inválido.' };
  return { data: parsed.data };
}

function syncCatalog() {
  catalog.clear();
  for (const product of menuProducts.values()) {
    if (!product.active) continue;
    catalog.set(product.id, getCatalogProduct(product.id));
  }
  addonPrices.clear();
  for (const addon of Object.values(addonGroups).flat()) addonPrices.set(addon.name, addon.price);
}

function listEmployees() {
  return [...employees.values()].map(({ timeEntries, documents: employeeDocuments, ...employee }) => ({ ...employee, timeEntries, documents: employeeDocuments }));
}

function getEmployee(id) {
  return employees.get(id);
}

function addEmployee(payload) {
  const validation = validateEmployee(payload);
  if (validation.error) return validation;
  if (employees.size >= 200) return { error: 'Limite de 200 colaboradores atingido.', status: 409 };
  if (listEmployees().some(employee => employee.cpf === validation.data.cpf)) return { error: 'Já existe um colaborador com esse CPF.' };
  const employee = { id: crypto.randomUUID(), ...validation.data, createdAt: new Date().toISOString(), timeEntries: [], documents: [], vacations: [] };
  employees.set(employee.id, employee);
  encryptStore();
  return { data: employee };
}

function updateEmployee(id, payload) {
  const employee = employees.get(id);
  if (!employee) return { error: 'Colaborador não encontrado.', status: 404 };
  const validation = validateEmployee(payload);
  if (validation.error) return validation;
  if (listEmployees().some(other => other.id !== id && other.cpf === validation.data.cpf)) return { error: 'Já existe um colaborador com esse CPF.' };
  Object.assign(employee, validation.data);
  encryptStore();
  return { data: employee };
}

function scheduleVacation(id, payload) {
  const employee = employees.get(id);
  if (!employee) return { error: 'Colaborador não encontrado.', status: 404 };
  const parsed = z.object({ start: z.string().date(), end: z.string().date(), note: z.string().trim().max(160).optional().default('') }).safeParse(payload);
  if (!parsed.success) return { error: 'Informe as datas de início e fim das férias.' };
  if (parsed.data.end < parsed.data.start) return { error: 'O fim das férias precisa ser após o início.' };
  employee.vacations ||= [];
  employee.vacations.push({ id: crypto.randomUUID(), ...parsed.data, createdAt: new Date().toISOString() });
  encryptStore();
  return { data: employee.vacations.at(-1) };
}

function listProducts() {
  return [...menuProducts.values()].filter(product => product.active).map(product => publicProduct(product));
}

function getMenuSettings() {
  const now = Date.now();
  const allPromotions = promotions.map(promotion => {
    const product = menuProducts.get(promotion.productId);
    return {
      ...promotion,
      status: !product?.active ? 'hidden' : promotion.startsAt && Date.parse(promotion.startsAt) > now ? 'scheduled' : promotion.endsAt && Date.parse(promotion.endsAt) <= now ? 'ended' : 'active',
      productName: product?.name || 'Produto removido',
      basePrice: product?.price ?? 0,
      salePrice: salePriceFor(product, promotion)
    };
  }).sort((first, second) => {
    const rank = { active: 0, scheduled: 1, ended: 2, hidden: 3 };
    return rank[first.status] - rank[second.status] || (first.startsAt || '').localeCompare(second.startsAt || '');
  });
  return { products: [...menuProducts.values()].map(product => publicProduct(product)), addons: structuredClone(addonGroups), promotions: allPromotions };
}

function salePriceFor(product, promotion) {
  return product ? Math.round(product.price * (100 - promotion.percentage)) / 100 : null;
}

function promotionIsActive(promotion, timestamp = Date.now()) {
  return (!promotion.startsAt || Date.parse(promotion.startsAt) <= timestamp) && (!promotion.endsAt || Date.parse(promotion.endsAt) > timestamp);
}

function listActivePromotions(timestamp = Date.now()) {
  return promotions.filter(promotion => promotionIsActive(promotion, timestamp) && menuProducts.get(promotion.productId)?.active).map(promotion => publicProduct(menuProducts.get(promotion.productId), timestamp));
}

function publicProduct(product) {
  const promotion = promotions.find(item => item.productId === product.id && promotionIsActive(item));
  return { ...product, promotionPercentage: promotion?.percentage || 0, originalPrice: promotion ? product.price : null, salePrice: promotion ? salePriceFor(product, promotion) : null };
}

function getCatalogProduct(id, timestamp = Date.now()) {
  const product = menuProducts.get(Number(id));
  if (!product?.active) return null;
  const promotion = promotions.find(item => item.productId === product.id && promotionIsActive(item, timestamp));
  return { name: product.name, price: promotion ? salePriceFor(product, promotion) : product.price };
}

function saveProduct(id, payload) {
  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Confira nome, categoria, descrição, imagem e valor.', details: parsed.error.flatten() };
  const productId = id ? Number(id) : Math.max(0, ...menuProducts.keys()) + 1;
  if (id && !menuProducts.has(productId)) return { error: 'Produto não encontrado.', status: 404 };
  const previous = menuProducts.get(productId) || {};
  const product = { ...previous, id: productId, ...parsed.data, rating: previous.rating || '5.0', tag: previous.tag || 'Do cardápio' };
  menuProducts.set(productId, product);
  syncCatalog();
  encryptStore();
  return { data: product };
}

function deleteProduct(id) {
  const product = menuProducts.get(Number(id));
  if (!product) return false;
  menuProducts.delete(Number(id));
  promotions = promotions.filter(promotion => promotion.productId !== Number(id));
  syncCatalog();
  encryptStore();
  return true;
}

function savePromotion(payload) {
  const parsed = z.object({
    id: z.string().uuid().optional(),
    productId: z.number().int().positive(),
    percentage: z.number().finite().int().min(1).max(90),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional()
  }).safeParse(payload);
  if (!parsed.success) return { error: 'Confira produto, desconto e período da promoção.' };
  const product = menuProducts.get(parsed.data.productId);
  if (!product || (!product.active && !parsed.data.id)) return { error: 'O produto precisa estar visível para criar uma promoção.' };
  if (parsed.data.startsAt && parsed.data.endsAt && Date.parse(parsed.data.endsAt) <= Date.parse(parsed.data.startsAt)) return { error: 'O fim da promoção precisa ser depois do início.' };
  if (!parsed.data.id && promotions.length >= 200) return { error: 'Limite de 200 promoções atingido.' };
  const id = parsed.data.id || crypto.randomUUID();
  if (parsed.data.id && !promotions.some(promotion => promotion.id === id)) return { error: 'Promoção não encontrada.', status: 404 };
  const nextStart = parsed.data.startsAt ? Date.parse(parsed.data.startsAt) : Number.NEGATIVE_INFINITY;
  const nextEnd = parsed.data.endsAt ? Date.parse(parsed.data.endsAt) : Number.POSITIVE_INFINITY;
  const overlaps = promotions.some(promotion => {
    if (promotion.id === id || promotion.productId !== parsed.data.productId) return false;
    const otherStart = promotion.startsAt ? Date.parse(promotion.startsAt) : Number.NEGATIVE_INFINITY;
    const otherEnd = promotion.endsAt ? Date.parse(promotion.endsAt) : Number.POSITIVE_INFINITY;
    return Math.max(nextStart, otherStart) < Math.min(nextEnd, otherEnd);
  });
  if (overlaps) return { error: 'Este produto já possui uma promoção neste período.' };
  const promotion = { ...parsed.data, id };
  promotions = parsed.data.id ? promotions.map(item => item.id === id ? promotion : item) : [...promotions, promotion];
  syncCatalog();
  encryptStore();
  return { data: promotion };
}

function deletePromotion(id) {
  const remaining = promotions.filter(promotion => promotion.id !== id);
  if (remaining.length === promotions.length) return false;
  promotions = remaining;
  syncCatalog();
  encryptStore();
  return true;
}

function saveAddon(payload) {
  const parsed = z.object({ group: z.enum(['drinks', 'sides', 'sauces']), name: z.string().trim().min(2).max(80), price: z.number().finite().min(0).max(10000) }).safeParse(payload);
  if (!parsed.success) return { error: 'Confira grupo, nome e valor do complemento.' };
  if (Object.values(addonGroups).flat().some(addon => addon.name.toLowerCase() === parsed.data.name.toLowerCase())) return { error: 'Já existe um complemento com esse nome.' };
  addonGroups[parsed.data.group].push({ name: parsed.data.name, price: parsed.data.price });
  encryptStore();
  return { data: parsed.data };
}

function deleteAddon(group, name) {
  if (!addonGroups[group]) return false;
  const index = addonGroups[group].findIndex(addon => addon.name === name);
  if (index === -1) return false;
  addonGroups[group].splice(index, 1);
  addonPrices.delete(name);
  encryptStore();
  return true;
}

function recordOrder(order) {
  orders.unshift({ ...order, status: 'new', createdAt: new Date().toISOString(), statusUpdatedAt: new Date().toISOString() });
  if (orders.length > 20000) orders.length = 20000;
  encryptStore();
}

function listOrders() {
  return orders.map(order => ({ ...order }));
}

function updateOrderStatus(orderId, status) {
  if (!orderStatuses.has(status)) return { error: 'Etapa do pedido inválida.' };
  const order = orders.find(item => item.orderId === orderId);
  if (!order) return { error: 'Pedido não encontrado.', status: 404 };
  order.status = status;
  order.statusUpdatedAt = new Date().toISOString();
  encryptStore();
  return { data: { orderId, status, statusUpdatedAt: order.statusUpdatedAt } };
}

function getAddons() {
  return structuredClone(addonGroups);
}

function deleteEmployee(id) {
  const employee = employees.get(id);
  if (!employee) return false;
  employee.documents.forEach(document => documents.delete(document.id));
  employees.delete(id);
  encryptStore();
  return true;
}

function addTimeEntry(id) {
  const employee = employees.get(id);
  if (!employee) return null;
  const entry = { id: crypto.randomUUID(), timestamp: new Date().toISOString() };
  employee.timeEntries.push(entry);
  encryptStore();
  return entry;
}

function addDocument(id, file) {
  const employee = employees.get(id);
  if (!employee) return null;
  if (employee.documents.length >= 10) return { error: 'Limite de 10 documentos por colaborador atingido.' };
  const record = { id: crypto.randomUUID(), name: file.originalname.replace(/[\\/]/g, '_').slice(0, 120), mimeType: file.mimetype, size: file.size, uploadedAt: new Date().toISOString() };
  documents.set(record.id, { ...record, buffer: file.buffer });
  employee.documents.push(record);
  encryptStore();
  return { data: record };
}

function getDocument(id) {
  return documents.get(id);
}

function startOfPeriod(period, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'weekly') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (period === 'monthly') start.setDate(1);
  else if (period === 'yearly') start.setMonth(0, 1);
  return start;
}

function getDashboard(period = 'daily') {
  const allowedPeriods = new Set(['daily', 'weekly', 'monthly', 'yearly']);
  if (!allowedPeriods.has(period)) period = 'daily';
  const from = startOfPeriod(period).getTime();
  const periodOrders = orders.filter(order => Date.parse(order.createdAt) >= from);
  return {
    period,
    orderCount: periodOrders.length,
    revenue: periodOrders.reduce((total, order) => total + order.total, 0),
    deliveryRevenue: periodOrders.reduce((total, order) => total + order.deliveryFee, 0),
    orders: periodOrders.slice(0, 100).map(({ customer, ...order }) => order)
  };
}

module.exports = { addAddon: saveAddon, addDocument, addEmployee, addTimeEntry, deleteAddon, deleteEmployee, deleteProduct, deletePromotion, getAddons, getCatalogProduct, getDashboard, getDocument, getEmployee, getMenuSettings, initializeAdminStore, listActivePromotions, listEmployees, listOrders, listProducts, recordOrder, saveProduct, savePromotion, scheduleVacation, updateEmployee, updateOrderStatus };
