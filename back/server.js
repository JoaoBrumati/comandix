require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { lookupCep, quoteDelivery, publicAddress } = require('./src/delivery');
const { orderSchema } = require('./src/validators');
const adminStore = require('./src/admin');
const { createCheckoutPreference, fetchMercadoPagoPayment, verifyWebhookSignature } = require('./src/payments');

const app = express();
const port = Number(process.env.PORT || 3000);
const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${port}`;
const frontDir = path.join(__dirname, '..', 'front');
const imageDir = path.join(__dirname, '..', 'img');
const menuImageDir = path.join(imageDir, 'menu');
const adminSessions = new Map();
const sessionDuration = 8 * 60 * 60 * 1000;
let databaseReady = false;
let databaseFailure = null;
const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
});
const uploadMenuImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(cors({ origin: clientOrigin, methods: ['GET', 'POST'], credentials: false }));
app.use(express.json({ limit: '20kb', strict: true }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: 'Muitas solicitações. Aguarde um momento e tente novamente.' }),
  skip: request => request.method === 'GET' && request.path === '/api/admin/orders'
}));
app.use(['/api/catalog', '/api/promotion', '/api/admin', '/api/orders', '/api/payments'], (_request, response, next) => {
  if (!databaseReady) return response.status(503).json({ error: 'PostgreSQL indisponível. Configure DATABASE_URL, aplique as migrations e tente novamente.' });
  next();
});

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

async function calculateOrder(items) {
  return Promise.all(items.map(async item => {
    const product = adminStore.getCatalogProduct(item.productId);
    const resolvedProduct = await product;
    if (!resolvedProduct) throw new Error(`Produto inválido: ${item.productId}`);
    const addons = await Promise.all(item.addons.map(async addon => {
      const price = await adminStore.getAddonPrice(addon);
      if (price == null) throw new Error(`Adicional inválido: ${addon}`);
      return { name: addon, price };
    }));
    const unitPrice = resolvedProduct.price + addons.reduce((total, addon) => total + addon.price, 0);
    return { productId: item.productId, name: resolvedProduct.name, quantity: item.quantity, addons: addons.map(addon => addon.name), unitPrice, total: unitPrice * item.quantity };
  }));
}

app.get('/api/health', (_request, response) => {
  let publicUrl;
  try { publicUrl = new URL(process.env.PUBLIC_BASE_URL || ''); } catch {}
  const paymentsReady = process.env.PAYMENT_PROVIDER === 'mercadopago'
    && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
    && Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET)
    && Boolean(publicUrl && (process.env.NODE_ENV !== 'production' || publicUrl.protocol === 'https:'));
  const ready = databaseReady && (process.env.NODE_ENV !== 'production' || paymentsReady);
  return response.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', database: databaseReady ? 'connected' : 'unavailable', payments: paymentsReady ? 'configured' : 'not_configured' });
});
app.get('/api/public-config', (_request, response) => response.json({ whatsapp: (process.env.STORE_WHATSAPP || '').replace(/\D/g, '') }));
app.get('/api/catalog', asyncRoute(async (_request, response) => response.json({ products: await adminStore.listProducts(), addons: await adminStore.getAddons() })));
app.get('/api/promotion', asyncRoute(async (_request, response) => response.json(await adminStore.listActivePromotions())));

function safePasswordMatch(candidate, expected) {
  const candidateHash = crypto.createHash('sha256').update(candidate).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash) && candidate.length === expected.length;
}

function cookieValue(request, name) {
  const entry = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function requireAdmin(request, response, next) {
  const sessionToken = cookieValue(request, 'anotaai_admin');
  const session = adminSessions.get(sessionToken);
  if (!session || session.expiresAt < Date.now()) {
    adminSessions.delete(sessionToken);
    return response.status(401).json({ error: 'Acesso administrativo necessário.' });
  }
  next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin && origin !== clientOrigin) return response.status(403).json({ error: 'Origem não autorizada.' });
  next();
}

app.post('/api/admin/login', requireSameOrigin, asyncRoute(async (request, response) => {
  const expectedPassword = process.env.ADMIN_PASSWORD || '';
  if (expectedPassword.length < 12) return response.status(503).json({ error: 'Configure uma ADMIN_PASSWORD com pelo menos 12 caracteres no .env.' });
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (username.toLowerCase() !== expectedUser.toLowerCase() || !safePasswordMatch(password, expectedPassword)) return response.status(401).json({ error: 'Usuário ou senha administrativa incorretos.' });
  try { await adminStore.initializeAdminStore(); } catch { return response.status(503).json({ error: 'Não foi possível abrir o PostgreSQL. Confira DATABASE_URL e as migrations.' }); }
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  adminSessions.set(sessionToken, { expiresAt: Date.now() + sessionDuration });
  response.setHeader('Set-Cookie', `anotaai_admin=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return response.json({ authenticated: true });
}));

app.get('/api/admin/session', requireAdmin, (_request, response) => response.json({ authenticated: true }));
app.delete('/api/admin/session', requireSameOrigin, (request, response) => {
  adminSessions.delete(cookieValue(request, 'anotaai_admin'));
  response.setHeader('Set-Cookie', 'anotaai_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
  return response.status(204).end();
});

const adminApi = express.Router();
adminApi.use(requireAdmin);
adminApi.use(requireSameOrigin);
adminApi.get('/dashboard', asyncRoute(async (request, response) => response.json(await adminStore.getDashboard(request.query.period))));
adminApi.get('/orders', asyncRoute(async (request, response) => response.json(await adminStore.listOrders(request.query.period))));
adminApi.patch('/orders/:id/status', asyncRoute(async (request, response) => {
  const result = await adminStore.updateOrderStatus(request.params.id, request.body?.status);
  return result.error ? response.status(result.status || 400).json({ error: result.error }) : response.json(result.data);
}));
adminApi.get('/employees', asyncRoute(async (_request, response) => response.json(await adminStore.listEmployees())));
adminApi.post('/employees', asyncRoute(async (request, response) => {
  const result = await adminStore.addEmployee(request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.status(201).json(result.data);
}));
adminApi.patch('/employees/:id', asyncRoute(async (request, response) => {
  const result = await adminStore.updateEmployee(request.params.id, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.json(result.data);
}));
adminApi.post('/employees/:id/vacations', asyncRoute(async (request, response) => {
  const result = await adminStore.scheduleVacation(request.params.id, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  return response.status(201).json(result.data);
}));
adminApi.delete('/employees/:id', asyncRoute(async (request, response) => await adminStore.deleteEmployee(request.params.id) ? response.status(204).end() : response.status(404).json({ error: 'Colaborador não encontrado.' })));
adminApi.post('/employees/:id/timeclock', asyncRoute(async (request, response) => {
  const entry = await adminStore.addTimeEntry(request.params.id);
  return entry ? response.status(201).json(entry) : response.status(404).json({ error: 'Colaborador não encontrado.' });
}));
adminApi.post('/employees/:id/documents', uploadDocument.single('document'), asyncRoute(async (request, response) => {
  const file = request.file;
  if (!file) return response.status(400).json({ error: 'Envie um PDF, JPG ou PNG de até 5 MB.' });
  const isPdf = file.mimetype === 'application/pdf' && file.buffer.subarray(0, 4).toString() === '%PDF';
  const isJpeg = file.mimetype === 'image/jpeg' && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  const isPng = file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPdf && !isJpeg && !isPng) return response.status(400).json({ error: 'O conteúdo do arquivo não corresponde a PDF, JPG ou PNG.' });
  const result = await adminStore.addDocument(request.params.id, file);
  if (!result) return response.status(404).json({ error: 'Colaborador não encontrado.' });
  if (result.error) return response.status(409).json({ error: result.error });
  return response.status(201).json(result.data);
}));
adminApi.get('/employees/:id/documents/:documentId', asyncRoute(async (request, response) => {
  const document = await adminStore.getDocument(request.params.documentId);
  if (!document || document.employeeId !== request.params.id) return response.status(404).json({ error: 'Documento não encontrado.' });
  response.setHeader('Content-Type', document.mimeType);
  response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.name)}"`);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.send(document.buffer);
}));
adminApi.get('/menu', asyncRoute(async (_request, response) => response.json(await adminStore.getMenuSettings())));
adminApi.post('/menu/groups', asyncRoute(async (request, response) => {
  const result = await adminStore.createProductGroup(request.body?.name);
  return result.error ? response.status(400).json({ error: result.error }) : response.status(201).json({ name: result.data });
}));
adminApi.delete('/menu/groups/:name', asyncRoute(async (request, response) => {
  const result = await adminStore.deleteProductGroup(request.params.name);
  return result.error ? response.status(result.status || 400).json({ error: result.error }) : response.status(204).end();
}));
adminApi.post('/menu/products', asyncRoute(async (request, response) => {
  const result = await adminStore.saveProduct(null, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.status(201).json(result.data);
}));
adminApi.patch('/menu/products/:id', asyncRoute(async (request, response) => {
  const result = await adminStore.saveProduct(request.params.id, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.json(result.data);
}));
adminApi.delete('/menu/products/:id', asyncRoute(async (request, response) => await adminStore.deleteProduct(request.params.id) ? response.status(204).end() : response.status(404).json({ error: 'Produto não encontrado.' })));
adminApi.post('/menu/promotions', asyncRoute(async (request, response) => {
  const result = await adminStore.savePromotion(request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  return response.status(201).json(result.data);
}));
adminApi.patch('/menu/promotions/:id', asyncRoute(async (request, response) => {
  const result = await adminStore.savePromotion({ ...request.body, id: request.params.id });
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  return response.json(result.data);
}));
adminApi.delete('/menu/promotions/:id', asyncRoute(async (request, response) => await adminStore.deletePromotion(request.params.id) ? response.status(204).end() : response.status(404).json({ error: 'Promoção não encontrada.' })));
adminApi.post('/menu/images', uploadMenuImage.single('image'), (request, response) => {
  const file = request.file;
  if (!file) return response.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WEBP de até 5 MB.' });
  const signatures = {
    'image/jpeg': file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff,
    'image/png': file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP'
  };
  if (!signatures[file.mimetype]) return response.status(400).json({ error: 'O conteúdo não corresponde a uma imagem válida.' });
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.mimetype];
  const fileName = `${crypto.randomUUID()}.${extension}`;
  require('fs').mkdirSync(menuImageDir, { recursive: true });
  require('fs').writeFileSync(path.join(menuImageDir, fileName), file.buffer, { flag: 'wx' });
  return response.status(201).json({ image: `/img/menu/${fileName}` });
});
app.use('/api/admin', adminApi);

app.get('/api/cep/:cep', async (request, response) => {
  try {
    const cep = request.params.cep.replace(/\D/g, '');
    return response.json(publicAddress(await lookupCep(cep)));
  } catch (error) {
    return response.status(error.status || 502).json({ error: error.message || 'Falha ao consultar o CEP.' });
  }
});

app.post('/api/delivery/quote', async (request, response) => {
  const cep = typeof request.body?.cep === 'string' ? request.body.cep.replace(/\D/g, '') : '';
  if (!/^\d{8}$/.test(cep)) return response.status(400).json({ error: 'Informe um CEP válido.' });
  try {
    return response.json(await quoteDelivery(cep));
  } catch (error) {
    return response.status(error.status || 502).json({ error: error.message || 'Não foi possível consultar a entrega.' });
  }
});

app.get('/api/orders/lookup', asyncRoute(async (request, response) => {
  const orderId = typeof request.query.orderId === 'string' ? request.query.orderId.trim() : '';
  const phone = typeof request.query.phone === 'string' ? request.query.phone.trim() : '';
  const reference = orderId || phone;
  if (!reference) return response.status(400).json({ error: 'Informe o número do pedido ou o telefone do cadastro.' });
  const orders = await adminStore.lookupOrders(reference);
  if (!orders.length) return response.status(404).json({ error: 'Pedido não encontrado para os dados informados.' });
  return response.json({ order: orders[0] });
}));

app.post('/api/payments/mercadopago/webhook', asyncRoute(async (request, response) => {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return response.status(503).json({ error: 'Webhook de pagamento não configurado.' });
  const dataId = request.query['data.id'] || request.body?.data?.id;
  const validSignature = verifyWebhookSignature({
    dataId,
    requestId: request.get('x-request-id'),
    signature: request.get('x-signature'),
    secret
  });
  if (!validSignature) return response.status(401).json({ error: 'Assinatura de webhook inválida.' });
  if (request.body?.type !== 'payment' && request.query.topic !== 'payment') return response.status(200).json({ received: true });

  const payment = await fetchMercadoPagoPayment(dataId);
  const knownStatuses = new Set(['pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back']);
  if (!knownStatuses.has(payment.status) || payment.currency_id !== 'BRL' || !payment.external_reference) return response.status(200).json({ received: true });
  const updated = await adminStore.updateOrderPayment(payment.external_reference, {
    status: payment.status,
    amount: Number(payment.transaction_amount),
    providerPaymentId: String(payment.id),
    statusDetail: payment.status_detail || ''
  });
  return response.status(updated ? 200 : 404).json({ received: updated });
}));

app.post('/api/orders', asyncRoute(async (request, response) => {
  const parsed = orderSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados do pedido inválidos.', details: parsed.error.flatten() });

  try {
    const delivery = await quoteDelivery(parsed.data.customer.cep);
    const items = await calculateOrder(parsed.data.items);
    const subtotal = items.reduce((total, item) => total + item.total, 0);
    const deliveryFee = delivery.fee;
    const total = subtotal + deliveryFee;
    const orderId = crypto.randomUUID();
    let payment;
    let checkoutUrl;
    if (parsed.data.payment.method === 'mercadopago') {
      const preference = await createCheckoutPreference({ orderId, items, deliveryFee });
      payment = { method: 'mercadopago', status: 'pending', preferenceId: preference.id };
      checkoutUrl = preference.checkoutUrl;
    } else {
      payment = { method: 'cash', status: 'pending' };
    }
    const { name, phone, street, number, neighborhood, city, state, complement, reference } = parsed.data.customer;
    const customer = { name, phone, address: [street, number, complement, neighborhood, `${city}/${state}`].filter(Boolean).join(', '), reference };
    await adminStore.recordOrder({ orderId, items, subtotal, deliveryFee, total, payment, customer });

    const orderCode = orderId.slice(0, 8).toUpperCase();
    return response.status(201).json({ orderId, orderCode, status: 'created', items, subtotal, deliveryFee, distanceKm: delivery.distanceKm, total, payment: { method: payment.method, status: payment.status, checkoutUrl } });
  } catch (error) {
    return response.status(error.status || 400).json({ error: error.message });
  }
}));

app.use('/img', express.static(imageDir, { maxAge: '7d', fallthrough: false }));
app.use(express.static(frontDir, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
app.get('*', (_request, response) => response.sendFile(path.join(frontDir, 'index.html')));

app.use((error, _request, response, _next) => {
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'JSON inválido.' });
  if (error instanceof multer.MulterError) return response.status(413).json({ error: 'O arquivo excede o limite de 5 MB.' });
  return response.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(port, () => console.log(`anota.ai rodando em http://localhost:${port}`));
adminStore.initializeAdminStore()
  .then(() => { databaseReady = true; console.log('PostgreSQL conectado; Prisma pronto.'); })
  .catch(error => { databaseFailure = error; console.error(`PostgreSQL/criptografia indisponível (${error.code || error.name}). Confira DATABASE_URL, DATA_ENCRYPTION_KEY e aplique as migrations.`); });
