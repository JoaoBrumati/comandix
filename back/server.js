require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { addonPrices } = require('./src/catalog');
const { lookupCep, quoteDelivery, publicAddress } = require('./src/delivery');
const { orderSchema } = require('./src/validators');
const adminStore = require('./src/admin');

const app = express();
const port = Number(process.env.PORT || 3000);
const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${port}`;
const frontDir = path.join(__dirname, '..', 'front');
const imageDir = path.join(__dirname, '..', 'img');
const menuImageDir = path.join(imageDir, 'menu');
const adminSessions = new Map();
const sessionDuration = 8 * 60 * 60 * 1000;
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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: clientOrigin, methods: ['GET', 'POST'], credentials: false }));
app.use(express.json({ limit: '20kb', strict: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

function calculateOrder(items) {
  return items.map(item => {
    const product = adminStore.getCatalogProduct(item.productId);
    if (!product) throw new Error(`Produto inválido: ${item.productId}`);
    const addons = item.addons.map(addon => {
      if (!addonPrices.has(addon)) throw new Error(`Adicional inválido: ${addon}`);
      return { name: addon, price: addonPrices.get(addon) };
    });
    const unitPrice = product.price + addons.reduce((total, addon) => total + addon.price, 0);
    return { productId: item.productId, name: product.name, quantity: item.quantity, addons: addons.map(addon => addon.name), unitPrice, total: unitPrice * item.quantity };
  });
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
app.get('/api/public-config', (_request, response) => response.json({ whatsapp: (process.env.STORE_WHATSAPP || '').replace(/\D/g, '') }));
app.get('/api/catalog', (_request, response) => response.json({ products: adminStore.listProducts(), addons: adminStore.getAddons() }));
app.get('/api/promotion', (_request, response) => response.json(adminStore.listActivePromotions()));

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

app.post('/api/admin/login', requireSameOrigin, (request, response) => {
  const expectedPassword = process.env.ADMIN_PASSWORD || '';
  if (expectedPassword.length < 12) return response.status(503).json({ error: 'Configure uma ADMIN_PASSWORD com pelo menos 12 caracteres no .env.' });
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (username.toLowerCase() !== expectedUser.toLowerCase() || !safePasswordMatch(password, expectedPassword)) return response.status(401).json({ error: 'Usuário ou senha administrativa incorretos.' });
  try { adminStore.initializeAdminStore(expectedPassword); } catch { return response.status(503).json({ error: 'Não foi possível abrir o armazenamento administrativo. Confira a senha configurada.' }); }
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  adminSessions.set(sessionToken, { expiresAt: Date.now() + sessionDuration });
  response.setHeader('Set-Cookie', `anotaai_admin=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return response.json({ authenticated: true });
});

app.get('/api/admin/session', requireAdmin, (_request, response) => response.json({ authenticated: true }));
app.delete('/api/admin/session', requireSameOrigin, (request, response) => {
  adminSessions.delete(cookieValue(request, 'anotaai_admin'));
  response.setHeader('Set-Cookie', 'anotaai_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
  return response.status(204).end();
});

const adminApi = express.Router();
adminApi.use(requireAdmin);
adminApi.use(requireSameOrigin);
adminApi.get('/dashboard', (request, response) => response.json(adminStore.getDashboard(request.query.period)));
adminApi.get('/orders', (_request, response) => response.json(adminStore.listOrders()));
adminApi.patch('/orders/:id/status', (request, response) => {
  const result = adminStore.updateOrderStatus(request.params.id, request.body?.status);
  return result.error ? response.status(result.status || 400).json({ error: result.error }) : response.json(result.data);
});
adminApi.get('/employees', (_request, response) => response.json(adminStore.listEmployees()));
adminApi.post('/employees', (request, response) => {
  const result = adminStore.addEmployee(request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.status(201).json(result.data);
});
adminApi.patch('/employees/:id', (request, response) => {
  const result = adminStore.updateEmployee(request.params.id, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.json(result.data);
});
adminApi.post('/employees/:id/vacations', (request, response) => {
  const result = adminStore.scheduleVacation(request.params.id, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  return response.status(201).json(result.data);
});
adminApi.delete('/employees/:id', (request, response) => adminStore.deleteEmployee(request.params.id) ? response.status(204).end() : response.status(404).json({ error: 'Colaborador não encontrado.' }));
adminApi.post('/employees/:id/timeclock', (request, response) => {
  const entry = adminStore.addTimeEntry(request.params.id);
  return entry ? response.status(201).json(entry) : response.status(404).json({ error: 'Colaborador não encontrado.' });
});
adminApi.post('/employees/:id/documents', uploadDocument.single('document'), (request, response) => {
  const file = request.file;
  if (!file) return response.status(400).json({ error: 'Envie um PDF, JPG ou PNG de até 5 MB.' });
  const isPdf = file.mimetype === 'application/pdf' && file.buffer.subarray(0, 4).toString() === '%PDF';
  const isJpeg = file.mimetype === 'image/jpeg' && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  const isPng = file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPdf && !isJpeg && !isPng) return response.status(400).json({ error: 'O conteúdo do arquivo não corresponde a PDF, JPG ou PNG.' });
  const result = adminStore.addDocument(request.params.id, file);
  if (!result) return response.status(404).json({ error: 'Colaborador não encontrado.' });
  if (result.error) return response.status(409).json({ error: result.error });
  return response.status(201).json(result.data);
});
adminApi.get('/employees/:id/documents/:documentId', (request, response) => {
  const document = adminStore.getDocument(request.params.documentId);
  if (!document || !adminStore.getEmployee(request.params.id)?.documents.some(item => item.id === document.id)) return response.status(404).json({ error: 'Documento não encontrado.' });
  response.setHeader('Content-Type', document.mimeType);
  response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.name)}"`);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.send(document.buffer);
});
adminApi.get('/menu', (_request, response) => response.json(adminStore.getMenuSettings()));
adminApi.post('/menu/products', (request, response) => {
  const result = adminStore.saveProduct(null, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.status(201).json(result.data);
});
adminApi.patch('/menu/products/:id', (request, response) => {
  const result = adminStore.saveProduct(request.params.id, request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error, details: result.details });
  return response.json(result.data);
});
adminApi.delete('/menu/products/:id', (request, response) => adminStore.deleteProduct(request.params.id) ? response.status(204).end() : response.status(404).json({ error: 'Produto não encontrado.' }));
adminApi.post('/menu/promotions', (request, response) => {
  const result = adminStore.savePromotion(request.body);
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  return response.status(201).json(result.data);
});
adminApi.patch('/menu/promotions/:id', (request, response) => {
  const result = adminStore.savePromotion({ ...request.body, id: request.params.id });
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  return response.json(result.data);
});
adminApi.delete('/menu/promotions/:id', (request, response) => adminStore.deletePromotion(request.params.id) ? response.status(204).end() : response.status(404).json({ error: 'Promoção não encontrada.' }));
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
adminApi.post('/menu/addons', (request, response) => {
  const result = adminStore.addAddon(request.body);
  return result.error ? response.status(400).json({ error: result.error }) : response.status(201).json(result.data);
});
adminApi.delete('/menu/addons/:group/:name', (request, response) => {
  const name = decodeURIComponent(request.params.name);
  return adminStore.deleteAddon(request.params.group, name) ? response.status(204).end() : response.status(404).json({ error: 'Complemento não encontrado.' });
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

app.post('/api/orders', async (request, response) => {
  const parsed = orderSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados do pedido inválidos.', details: parsed.error.flatten() });

  try {
    const delivery = await quoteDelivery(parsed.data.customer.cep);
    const items = calculateOrder(parsed.data.items);
    const subtotal = items.reduce((total, item) => total + item.total, 0);
    const deliveryFee = delivery.fee;
    const total = subtotal + deliveryFee;
    const orderId = crypto.randomUUID();
    const payment = parsed.data.payment.method === 'pix'
      ? { method: 'pix', status: 'pending', copyPaste: `anotaai-pix-${orderId}` }
      : { method: parsed.data.payment.method, status: 'pending' };
    const { name, phone, street, number, neighborhood, city, state, complement, reference } = parsed.data.customer;
    const customer = { name, phone, address: [street, number, complement, neighborhood, `${city}/${state}`].filter(Boolean).join(', '), reference };
    adminStore.recordOrder({ orderId, items, subtotal, deliveryFee, total, payment, customer });

    return response.status(201).json({ orderId, status: 'created', items, subtotal, deliveryFee, distanceKm: delivery.distanceKm, total, payment });
  } catch (error) {
    return response.status(error.status || 400).json({ error: error.message });
  }
});

app.use('/img', express.static(imageDir, { maxAge: '7d', fallthrough: false }));
app.use(express.static(frontDir, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
app.get('*', (_request, response) => response.sendFile(path.join(frontDir, 'index.html')));

app.use((error, _request, response, _next) => {
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'JSON inválido.' });
  if (error instanceof multer.MulterError) return response.status(413).json({ error: 'O arquivo excede o limite de 5 MB.' });
  return response.status(500).json({ error: 'Erro interno do servidor.' });
});

if ((process.env.ADMIN_PASSWORD || '').length >= 12) {
  try { adminStore.initializeAdminStore(process.env.ADMIN_PASSWORD); }
  catch { console.error('Não foi possível abrir o armazenamento administrativo cifrado. Verifique ADMIN_PASSWORD.'); }
}

app.listen(port, () => console.log(`anota.ai rodando em http://localhost:${port}`));
