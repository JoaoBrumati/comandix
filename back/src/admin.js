const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('./db');
const { decryptBuffer, decryptJson, encryptBuffer, encryptJson, hashCpf } = require('./encryption');
const { addons: defaultAddons, products: defaultProducts } = require('./catalog');

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
const orderStatuses = new Set(['new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);

function isValidCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;
  const digit = length => {
    const sum = cpf.slice(0, length).split('').reduce((total, value, index) => total + Number(value) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function moneyNumber(value) {
  return Number(value);
}

function normalizeEmployee(employee) {
  const privateData = decryptJson(employee.privateData);
  return {
    id: employee.id,
    ...privateData,
    createdAt: employee.createdAt.toISOString(),
    vacations: employee.vacations.map(vacation => ({ ...vacation, start: vacation.start.toISOString().slice(0, 10), end: vacation.end.toISOString().slice(0, 10), createdAt: vacation.createdAt.toISOString() })),
    timeEntries: employee.timeEntries.map(entry => ({ ...entry, timestamp: entry.timestamp.toISOString() })),
    documents: employee.documents.map(({ encryptedData, ...document }) => ({ ...document, uploadedAt: document.uploadedAt.toISOString() }))
  };
}

function promotionIsActive(promotion, timestamp = new Date()) {
  return (!promotion.startsAt || promotion.startsAt <= timestamp) && (!promotion.endsAt || promotion.endsAt > timestamp);
}

function salePrice(product, promotion) {
  return moneyNumber((moneyNumber(product.price) * (100 - promotion.percentage) / 100).toFixed(2));
}

function normalizeProduct(product, promotions = [], timestamp = new Date()) {
  const promotion = promotions.find(item => item.productId === product.id && promotionIsActive(item, timestamp));
  const price = moneyNumber(product.price);
  return { ...product, price, originalPrice: promotion ? price : null, promotionPercentage: promotion?.percentage || 0, salePrice: promotion ? salePrice(product, promotion) : null };
}

function normalizeOrder(order, includeCustomer = true) {
  const result = {
    orderId: order.id,
    orderCode: order.id.slice(0, 8).toUpperCase(),
    status: order.status,
    subtotal: moneyNumber(order.subtotal),
    deliveryFee: moneyNumber(order.deliveryFee),
    total: moneyNumber(order.total),
    payment: { method: order.paymentMethod, status: order.paymentStatus, ...(order.paymentData ? decryptJson(order.paymentData) : {}) },
    createdAt: order.createdAt.toISOString(),
    statusUpdatedAt: order.statusUpdatedAt.toISOString(),
    items: order.items.map(item => ({ productId: item.productId, name: item.name, quantity: item.quantity, addons: item.addons, unitPrice: moneyNumber(item.unitPrice), total: moneyNumber(item.total) }))
  };
  if (includeCustomer) result.customer = decryptJson(order.customerData);
  return result;
}

function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '');
}

async function lookupOrders(reference = '') {
  const query = String(reference || '').trim();
  if (!query) return [];
  const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } });
  const cleanPhone = normalizePhone(query);
  const matches = orders.filter(order => {
    const customer = decryptJson(order.customerData);
    const customerPhone = normalizePhone(customer.phone);
    const orderCode = order.id.slice(0, 8).toUpperCase();
    return order.id === query || orderCode === query.toUpperCase() || customerPhone === cleanPhone;
  });
  return matches.map(order => normalizeOrder(order, true));
}

async function initializeAdminStore() {
  hashCpf('database-encryption-key-check');
  await prisma.$connect();
  for (const product of defaultProducts) {
    await prisma.product.upsert({
      where: { id: product.id },
      create: { ...product, price: product.price },
      update: {}
    });
  }
  const defaultGroup = { drinks: 'drinks', sides: 'sides', sauces: 'sauces' };
  for (const [group, entries] of Object.entries(defaultAddons)) {
    for (const addon of entries) {
      await prisma.addon.upsert({ where: { name: addon.name }, create: { ...addon, group: defaultGroup[group] }, update: {} });
    }
  }
}

function validateEmployee(payload) {
  const parsed = employeeSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Confira os dados do colaborador.', details: parsed.error.flatten() };
  if (!isValidCpf(parsed.data.cpf)) return { error: 'CPF inválido.' };
  return { data: parsed.data };
}

async function listEmployees() {
  const employees = await prisma.employee.findMany({ include: { vacations: { orderBy: { start: 'asc' } }, timeEntries: { orderBy: { timestamp: 'asc' } }, documents: { orderBy: { uploadedAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  return employees.map(normalizeEmployee);
}

async function getEmployee(id) {
  return prisma.employee.findUnique({ where: { id }, include: { vacations: true, timeEntries: true, documents: true } });
}

async function addEmployee(payload) {
  const validation = validateEmployee(payload);
  if (validation.error) return validation;
  const { cpf, ...privateData } = validation.data;
  try {
    const employee = await prisma.employee.create({ data: { cpfHash: hashCpf(cpf), privateData: encryptJson({ ...privateData, cpf }) } });
    return { data: { id: employee.id, ...privateData, cpf, createdAt: employee.createdAt.toISOString(), vacations: [], timeEntries: [], documents: [] } };
  } catch (error) {
    if (error.code === 'P2002') return { error: 'Já existe um colaborador com esse CPF.' };
    throw error;
  }
}

async function updateEmployee(id, payload) {
  const validation = validateEmployee(payload);
  if (validation.error) return validation;
  const { cpf, ...privateData } = validation.data;
  try {
    const employee = await prisma.employee.update({ where: { id }, data: { cpfHash: hashCpf(cpf), privateData: encryptJson({ ...privateData, cpf }) } });
    return { data: { id: employee.id, ...privateData, cpf, createdAt: employee.createdAt.toISOString() } };
  } catch (error) {
    if (error.code === 'P2025') return { error: 'Colaborador não encontrado.', status: 404 };
    if (error.code === 'P2002') return { error: 'Já existe um colaborador com esse CPF.' };
    throw error;
  }
}

async function scheduleVacation(id, payload) {
  const parsed = z.object({ start: z.string().date(), end: z.string().date(), note: z.string().trim().max(160).optional().default('') }).safeParse(payload);
  if (!parsed.success) return { error: 'Informe as datas de início e fim das férias.' };
  if (parsed.data.end < parsed.data.start) return { error: 'O fim das férias precisa ser após o início.' };
  try {
    const vacation = await prisma.vacation.create({ data: { employeeId: id, start: new Date(`${parsed.data.start}T00:00:00.000Z`), end: new Date(`${parsed.data.end}T00:00:00.000Z`), note: parsed.data.note } });
    return { data: { ...vacation, start: vacation.start.toISOString().slice(0, 10), end: vacation.end.toISOString().slice(0, 10), createdAt: vacation.createdAt.toISOString() } };
  } catch (error) {
    if (error.code === 'P2003') return { error: 'Colaborador não encontrado.', status: 404 };
    throw error;
  }
}

async function listProducts() {
  const [products, promotions] = await Promise.all([prisma.product.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), prisma.promotion.findMany()]);
  return products.map(product => normalizeProduct(product, promotions));
}

async function getMenuSettings() {
  const [products, addons, promotions] = await Promise.all([
    prisma.product.findMany({ orderBy: { id: 'asc' } }),
    prisma.addon.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] }),
    prisma.promotion.findMany({ include: { product: true }, orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }] })
  ]);
  const now = new Date();
  const allPromotions = promotions.map(promotion => ({
    id: promotion.id,
    productId: promotion.productId,
    percentage: promotion.percentage,
    startsAt: promotion.startsAt?.toISOString() || null,
    endsAt: promotion.endsAt?.toISOString() || null,
    status: !promotion.product.active ? 'hidden' : promotion.startsAt && promotion.startsAt > now ? 'scheduled' : promotion.endsAt && promotion.endsAt <= now ? 'ended' : 'active',
    productName: promotion.product.name,
    basePrice: moneyNumber(promotion.product.price),
    salePrice: salePrice(promotion.product, promotion)
  }));
  const addonsByGroup = { drinks: [], sides: [], sauces: [] };
  for (const addon of addons) addonsByGroup[addon.group].push({ name: addon.name, price: moneyNumber(addon.price) });
  return { products: products.map(product => normalizeProduct(product, promotions, now)), addons: addonsByGroup, promotions: allPromotions };
}

async function listActivePromotions(timestamp = new Date()) {
  const promotions = await prisma.promotion.findMany({ where: { product: { active: true } }, include: { product: true } });
  return promotions.filter(promotion => promotionIsActive(promotion, timestamp)).map(promotion => normalizeProduct(promotion.product, [promotion], timestamp));
}

async function getCatalogProduct(id, timestamp = new Date()) {
  const product = await prisma.product.findUnique({ where: { id: Number(id) } });
  if (!product?.active) return null;
  const promotions = await prisma.promotion.findMany({ where: { productId: product.id } });
  const activePromotion = promotions.find(promotion => promotionIsActive(promotion, timestamp));
  return { name: product.name, price: activePromotion ? salePrice(product, activePromotion) : moneyNumber(product.price) };
}

async function getAddonPrice(name) {
  const addon = await prisma.addon.findUnique({ where: { name } });
  return addon ? moneyNumber(addon.price) : null;
}

async function saveProduct(id, payload) {
  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Confira nome, categoria, descrição, imagem e valor.', details: parsed.error.flatten() };
  if (id) {
    try {
      const product = await prisma.product.update({ where: { id: Number(id) }, data: { ...parsed.data, price: parsed.data.price } });
      return { data: normalizeProduct(product) };
    } catch (error) {
      if (error.code === 'P2025') return { error: 'Produto não encontrado.', status: 404 };
      throw error;
    }
  }
  const latest = await prisma.product.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  const product = await prisma.product.create({ data: { ...parsed.data, id: (latest?.id || 0) + 1 } });
  return { data: normalizeProduct(product) };
}

async function deleteProduct(id) {
  try { await prisma.product.delete({ where: { id: Number(id) } }); return true; }
  catch (error) { if (error.code === 'P2025') return false; throw error; }
}

async function savePromotion(payload) {
  const parsed = z.object({
    id: z.string().uuid().optional(),
    productId: z.number().int().positive(),
    percentage: z.number().finite().int().min(1).max(90),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional()
  }).safeParse(payload);
  if (!parsed.success) return { error: 'Confira produto, desconto e período da promoção.' };
  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product || (!product.active && !parsed.data.id)) return { error: 'O produto precisa estar visível para criar uma promoção.' };
  if (parsed.data.startsAt && parsed.data.endsAt && Date.parse(parsed.data.endsAt) <= Date.parse(parsed.data.startsAt)) return { error: 'O fim da promoção precisa ser depois do início.' };
  const start = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  const end = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  const existing = await prisma.promotion.findMany({ where: { productId: parsed.data.productId, ...(parsed.data.id ? { id: { not: parsed.data.id } } : {}) } });
  const overlaps = existing.some(promotion => {
    const otherStart = promotion.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const otherEnd = promotion.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return Math.max(start?.getTime() ?? Number.NEGATIVE_INFINITY, otherStart) < Math.min(end?.getTime() ?? Number.POSITIVE_INFINITY, otherEnd);
  });
  if (overlaps) return { error: 'Este produto já possui uma promoção neste período.' };
  const data = { productId: parsed.data.productId, percentage: parsed.data.percentage, startsAt: start, endsAt: end };
  try {
    const promotion = parsed.data.id
      ? await prisma.promotion.update({ where: { id: parsed.data.id }, data })
      : await prisma.promotion.create({ data });
    return { data: { ...promotion, startsAt: promotion.startsAt?.toISOString() || null, endsAt: promotion.endsAt?.toISOString() || null } };
  } catch (error) {
    if (error.code === 'P2025') return { error: 'Promoção não encontrada.', status: 404 };
    throw error;
  }
}

async function deletePromotion(id) {
  try { await prisma.promotion.delete({ where: { id } }); return true; }
  catch (error) { if (error.code === 'P2025') return false; throw error; }
}

async function getAddons() {
  const addons = await prisma.addon.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] });
  const groups = { drinks: [], sides: [], sauces: [] };
  for (const addon of addons) groups[addon.group].push({ name: addon.name, price: moneyNumber(addon.price) });
  return groups;
}

async function addAddon(payload) {
  const parsed = z.object({ group: z.enum(['drinks', 'sides', 'sauces']), name: z.string().trim().min(2).max(80), price: z.number().finite().min(0).max(10000) }).safeParse(payload);
  if (!parsed.success) return { error: 'Confira grupo, nome e valor do complemento.' };
  try {
    const addon = await prisma.addon.create({ data: { ...parsed.data, price: parsed.data.price } });
    return { data: { ...addon, price: moneyNumber(addon.price) } };
  } catch (error) { if (error.code === 'P2002') return { error: 'Já existe um complemento com esse nome.' }; throw error; }
}

async function deleteAddon(group, name) {
  try { await prisma.addon.delete({ where: { name, group } }); return true; }
  catch (error) { if (error.code === 'P2025') return false; throw error; }
}

async function recordOrder(order) {
  return prisma.order.create({
    data: {
      id: order.orderId,
      status: 'new',
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status || 'pending',
      paymentData: encryptJson(order.payment),
      customerData: encryptJson(order.customer),
      items: { create: order.items.map(item => ({ productId: item.productId, name: item.name, quantity: item.quantity, addons: item.addons, unitPrice: item.unitPrice, total: item.total })) }
    }
  });
}

async function listOrders() {
  const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } });
  return orders.map(order => normalizeOrder(order));
}

async function updateOrderStatus(orderId, status) {
  if (!orderStatuses.has(status)) return { error: 'Etapa do pedido inválida.' };
  try {
    const order = await prisma.order.update({ where: { id: orderId }, data: { status, statusUpdatedAt: new Date() } });
    return { data: { orderId, status: order.status, statusUpdatedAt: order.statusUpdatedAt.toISOString() } };
  } catch (error) { if (error.code === 'P2025') return { error: 'Pedido não encontrado.', status: 404 }; throw error; }
}

async function listEmployees() {
  const employees = await prisma.employee.findMany({ include: { vacations: { orderBy: { start: 'asc' } }, timeEntries: { orderBy: { timestamp: 'asc' } }, documents: { orderBy: { uploadedAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  return employees.map(normalizeEmployee);
}

async function addTimeEntry(id) {
  try {
    const entry = await prisma.timeEntry.create({ data: { employeeId: id } });
    return { ...entry, timestamp: entry.timestamp.toISOString() };
  } catch (error) { if (error.code === 'P2003') return null; throw error; }
}

async function addDocument(id, file) {
  const count = await prisma.medicalDocument.count({ where: { employeeId: id } });
  if (count >= 10) return { error: 'Limite de 10 documentos por colaborador atingido.' };
  try {
    const document = await prisma.medicalDocument.create({ data: { employeeId: id, name: file.originalname.replace(/[\\/]/g, '_').slice(0, 120), mimeType: file.mimetype, size: file.size, encryptedData: encryptBuffer(file.buffer) } });
    const { encryptedData, ...metadata } = document;
    return { data: { ...metadata, uploadedAt: document.uploadedAt.toISOString() } };
  } catch (error) { if (error.code === 'P2003') return null; throw error; }
}

async function getDocument(id) {
  const document = await prisma.medicalDocument.findUnique({ where: { id } });
  if (!document) return null;
  return { ...document, buffer: decryptBuffer(document.encryptedData) };
}

async function deleteEmployee(id) {
  try { await prisma.employee.delete({ where: { id } }); return true; }
  catch (error) { if (error.code === 'P2025') return false; throw error; }
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

async function getDashboard(period = 'daily') {
  const allowedPeriods = new Set(['daily', 'weekly', 'monthly', 'yearly']);
  if (!allowedPeriods.has(period)) period = 'daily';
  const where = { createdAt: { gte: startOfPeriod(period) } };
  const [summary, orders] = await Promise.all([
    prisma.order.aggregate({ where, _count: { _all: true }, _sum: { total: true, deliveryFee: true } }),
    prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  return {
    period,
    orderCount: summary._count._all,
    revenue: moneyNumber(summary._sum.total || 0),
    deliveryRevenue: moneyNumber(summary._sum.deliveryFee || 0),
    orders: orders.map(order => normalizeOrder(order, false))
  };
}

module.exports = { addAddon, addDocument, addEmployee, addTimeEntry, deleteAddon, deleteEmployee, deleteProduct, deletePromotion, getAddonPrice, getAddons, getCatalogProduct, getDashboard, getDocument, getEmployee, getMenuSettings, initializeAdminStore, listActivePromotions, listEmployees, listOrders, listProducts, lookupOrders, recordOrder, saveProduct, savePromotion, scheduleVacation, updateEmployee, updateOrderStatus };
