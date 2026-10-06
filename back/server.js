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
const { detectImageFormat, isAllowedImageMimeType } = require('./src/image-validation');
const { hashPassword, verifyPassword, buildAdminCookie, buildCsrfCookie, clearAdminCookie, clearCsrfCookie, cookieValue, generateCsrfToken, getClientIp, recordFailedLogin, isBlockedIp, clearFailedLogin, logAdminAuditEvent, findRecentAuditLogs, isAllowedAdminIp, verifyTotpCode, buildSecurityAlertPayload, validateProductionConfig } = require('./src/security');
const { createCheckoutPreference, fetchMercadoPagoPayment, verifyWebhookSignature } = require('./src/payments');

const productionConfig = validateProductionConfig(process.env);
if (process.env.NODE_ENV === 'production' && !productionConfig.ok) {
  console.error('Configuração de produção inválida:', productionConfig.errors.join(' | '));
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
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
  fileFilter: (_request, file, callback) => {
    const allowedMimeType = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/pjpeg', 'image/x-jpeg', 'image/x-png'];
    const hasAcceptedExtension = /\.(pdf|jpe?g|png)$/i.test(file.originalname || '');
    callback(null, allowedMimeType.includes(file.mimetype) || hasAcceptedExtension);
  }
});
const uploadMenuImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowedMimeType = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/pjpeg', 'image/x-jpeg', 'image/x-png', 'image/x-webp'];
    const hasAcceptedExtension = /\.(jpe?g|png|webp)$/i.test(file.originalname || '');
    callback(null, allowedMimeType.includes(file.mimetype) || hasAcceptedExtension);
  }
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
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
app.use(cors({
  origin: clientOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: false,
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: '20kb', strict: true }));
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: 'Muitas solicitações. Aguarde um momento e tente novamente.' }),
  skip: request => request.method === 'GET' && request.path === '/api/admin/orders'
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});
app.use(globalRateLimiter);
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

function requireAdmin(request, response, next) {
  const sessionToken = cookieValue(request, 'comandix_admin');
  const session = adminSessions.get(sessionToken);
  if (!session || session.expiresAt < Date.now()) {
    adminSessions.delete(sessionToken);
    return response.status(401).json({ error: 'Acesso administrativo necessário.' });
  }
  const clientIp = getClientIp(request);
  if (!isAllowedAdminIp(clientIp, process.env.ADMIN_ALLOWED_IPS)) {
    return response.status(403).json({ error: 'IP não autorizado para o painel administrativo.' });
  }
  next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin && origin !== clientOrigin) return response.status(403).json({ error: 'Origem não autorizada.' });
  next();
}

function requireCsrf(request, response, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
  const sessionToken = cookieValue(request, 'comandix_admin');
  const session = adminSessions.get(sessionToken);
  const expectedToken = session?.csrfToken || '';
  const tokenFromHeader = request.get('x-csrf-token') || request.get('x-xsrf-token');
  const tokenFromCookie = cookieValue(request, 'comandix_csrf');
  if (!expectedToken || !tokenFromHeader || !tokenFromCookie || tokenFromHeader.length !== tokenFromCookie.length || tokenFromHeader.length !== expectedToken.length) {
    return response.status(403).json({ error: 'Token CSRF inválido ou ausente.' });
  }
  const headerBuffer = Buffer.from(tokenFromHeader);
  const cookieBuffer = Buffer.from(tokenFromCookie);
  const expectedBuffer = Buffer.from(expectedToken);
  if (!crypto.timingSafeEqual(headerBuffer, cookieBuffer) || !crypto.timingSafeEqual(headerBuffer, expectedBuffer)) {
    return response.status(403).json({ error: 'Token CSRF inválido ou ausente.' });
  }
  next();
}

app.post('/api/admin/login', requireSameOrigin, adminLoginLimiter, asyncRoute(async (request, response) => {
  const clientIp = getClientIp(request);
  if (!isAllowedAdminIp(clientIp, process.env.ADMIN_ALLOWED_IPS)) {
    logAdminAuditEvent('admin_ip_blocked', request, { ip: clientIp, reason: 'not_in_whitelist' });
    return response.status(403).json({ error: 'Este IP não está autorizado para acessar o painel administrativo.' });
  }
  if (isBlockedIp(clientIp)) return response.status(403).json({ error: 'IP temporariamente bloqueado por muitas tentativas de login.' });
  const expectedPassword = process.env.ADMIN_PASSWORD_HASH || (process.env.ADMIN_PASSWORD ? hashPassword(process.env.ADMIN_PASSWORD) : '');
  if (!expectedPassword || expectedPassword.length < 32) return response.status(503).json({ error: 'Configure ADMIN_PASSWORD ou ADMIN_PASSWORD_HASH com uma senha forte no .env.' });
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const otpCode = typeof request.body?.otp === 'string' ? request.body.otp.replace(/\D/g, '') : '';
  const secret = process.env.ADMIN_2FA_SECRET || '';
  const credentialsAreValid = username.toLowerCase() === expectedUser.toLowerCase() && verifyPassword(password, expectedPassword);
  if (!credentialsAreValid) {
    recordFailedLogin(clientIp);
    logAdminAuditEvent('admin_login_failed', request, { username, reason: 'invalid_credentials' });
    const alert = buildSecurityAlertPayload('admin_login_failed', clientIp, { username });
    if (process.env.ADMIN_ALERT_WEBHOOK) fetch(process.env.ADMIN_ALERT_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alert) }).catch(() => {});
    return response.status(401).json({ error: 'Usuário ou senha administrativa incorretos.' });
  }
  if (secret && !verifyTotpCode(secret, otpCode)) {
    recordFailedLogin(clientIp);
    logAdminAuditEvent('admin_login_failed', request, { username, reason: 'invalid_2fa' });
    return response.status(401).json({ error: 'Código de autenticação em duas etapas inválido.' });
  }
  clearFailedLogin(clientIp);
  try { await adminStore.initializeAdminStore(); } catch { return response.status(503).json({ error: 'Não foi possível abrir o PostgreSQL. Confira DATABASE_URL e as migrations.' }); }
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const csrfToken = generateCsrfToken();
  adminSessions.set(sessionToken, { expiresAt: Date.now() + sessionDuration, csrfToken });
  response.setHeader('Set-Cookie', [buildAdminCookie(sessionToken), buildCsrfCookie(csrfToken)]);
  logAdminAuditEvent('admin_login_success', request, { username, has2fa: Boolean(secret) });
  return response.json({ authenticated: true, csrfToken, requiresTwoFactor: Boolean(secret) });
}));

app.get('/api/admin/session', requireAdmin, (request, response) => {
  const sessionToken = cookieValue(request, 'comandix_admin');
  const session = adminSessions.get(sessionToken);
  return response.json({ authenticated: true, csrfToken: session?.csrfToken || '' });
});
app.delete('/api/admin/session', requireSameOrigin, (request, response) => {
  const clientIp = getClientIp(request);
  adminSessions.delete(cookieValue(request, 'comandix_admin'));
  logAdminAuditEvent('admin_logout', request, { ip: clientIp });
  response.setHeader('Set-Cookie', [clearAdminCookie(), clearCsrfCookie()]);
  return response.status(204).end();
});

const adminApi = express.Router();
adminApi.use(requireAdmin);
adminApi.use(requireSameOrigin);
adminApi.use((request, _response, next) => {
  logAdminAuditEvent('admin_api_call', request, { path: request.originalUrl });
  next();
});
adminApi.use(requireCsrf);
adminApi.get('/security/logs', (_request, response) => response.json({ logs: findRecentAuditLogs(25) }));
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
  const mimeType = file.mimetype || '';
  const detectedFormat = detectImageFormat(file.buffer, mimeType);
  const isPdf = mimeType === 'application/pdf' && file.buffer.subarray(0, 4).toString() === '%PDF';
  const isJpeg = detectedFormat === 'image/jpeg';
  const isPng = detectedFormat === 'image/png';
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
  const detectedFormat = detectImageFormat(file.buffer, file.mimetype);
  if (!detectedFormat || !isAllowedImageMimeType(detectedFormat)) return response.status(400).json({ error: 'O conteúdo não corresponde a uma imagem válida.' });
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[detectedFormat];
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

app.listen(port, () => console.log(`Comandix rodando em http://localhost:${port}`));
adminStore.initializeAdminStore()
  .then(() => { databaseReady = true; console.log('PostgreSQL conectado; Prisma pronto.'); })
  .catch(error => { databaseFailure = error; console.error(`PostgreSQL/criptografia indisponível (${error.code || error.name}). Confira DATABASE_URL, DATA_ENCRYPTION_KEY e aplique as migrations.`); });
