require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../src/db');
const { encryptBuffer, encryptJson, hashCpf } = require('../src/encryption');
const adminStore = require('../src/admin');

const legacyFile = path.join(__dirname, '..', 'data', 'admin-store.enc');
const orderStatuses = new Set(['new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);

function decryptLegacyStore(fileContents, password) {
  const envelope = JSON.parse(fileContents);
  const salt = Buffer.from(envelope.salt, 'base64');
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function asDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function importLegacyState(state) {
  const legacyDocuments = new Map((state.documents || []).map(document => [document.id, document]));
  const counts = { employees: 0, documents: 0, products: 0, promotions: 0, orders: 0 };

  await prisma.$transaction(async transaction => {
    for (const product of state.products || []) {
      await transaction.product.upsert({
        where: { id: Number(product.id) },
        create: { id: Number(product.id), name: product.name, category: product.category, description: product.description, price: Number(product.price), image: product.image, rating: product.rating || '5.0', tag: product.tag || 'Do cardápio', active: product.active !== false },
        update: { name: product.name, category: product.category, description: product.description, price: Number(product.price), image: product.image, rating: product.rating || '5.0', tag: product.tag || 'Do cardápio', active: product.active !== false }
      });
      counts.products++;
    }

    for (const employee of state.employees || []) {
      const { id, cpf, name, address, salary, role, createdAt, vacations = [], timeEntries = [], documents = [], ...otherPrivateData } = employee;
      const privateData = { ...otherPrivateData, cpf, name, address, salary: Number(salary), role };
      await transaction.employee.upsert({
        where: { id },
        create: { id, cpfHash: hashCpf(cpf), privateData: encryptJson(privateData), createdAt: asDate(createdAt) },
        update: { cpfHash: hashCpf(cpf), privateData: encryptJson(privateData), createdAt: asDate(createdAt) }
      });
      counts.employees++;

      for (const vacation of vacations) {
        await transaction.vacation.upsert({
          where: { id: vacation.id },
          create: { id: vacation.id, employeeId: id, start: asDate(vacation.start), end: asDate(vacation.end), note: vacation.note || '', createdAt: asDate(vacation.createdAt) },
          update: { start: asDate(vacation.start), end: asDate(vacation.end), note: vacation.note || '' }
        });
      }

      for (const entry of timeEntries) {
        await transaction.timeEntry.upsert({
          where: { id: entry.id },
          create: { id: entry.id, employeeId: id, timestamp: asDate(entry.timestamp) },
          update: { timestamp: asDate(entry.timestamp) }
        });
      }

      for (const metadata of documents) {
        const legacyDocument = legacyDocuments.get(metadata.id);
        if (!legacyDocument) continue;
        const bytes = Buffer.isBuffer(legacyDocument.buffer) ? legacyDocument.buffer : Buffer.from(legacyDocument.buffer, 'base64');
        await transaction.medicalDocument.upsert({
          where: { id: metadata.id },
          create: { id: metadata.id, employeeId: id, name: metadata.name, mimeType: metadata.mimeType, size: metadata.size, encryptedData: encryptBuffer(bytes), uploadedAt: asDate(metadata.uploadedAt) },
          update: { name: metadata.name, mimeType: metadata.mimeType, size: metadata.size, encryptedData: encryptBuffer(bytes) }
        });
        counts.documents++;
      }
    }

    const legacyPromotions = state.promotions || [];
    if (!legacyPromotions.length && state.dailyPromotionId) console.warn('A promoção legada não tinha percentual; ela não foi importada e pode ser configurada novamente no ADM.');
    for (const promotion of legacyPromotions) {
      if (!promotion.id || !Number.isInteger(Number(promotion.productId))) continue;
      await transaction.promotion.upsert({
        where: { id: promotion.id },
        create: { id: promotion.id, productId: Number(promotion.productId), percentage: Number(promotion.percentage), startsAt: promotion.startsAt ? asDate(promotion.startsAt) : null, endsAt: promotion.endsAt ? asDate(promotion.endsAt) : null, createdAt: asDate(promotion.createdAt) },
        update: { productId: Number(promotion.productId), percentage: Number(promotion.percentage), startsAt: promotion.startsAt ? asDate(promotion.startsAt) : null, endsAt: promotion.endsAt ? asDate(promotion.endsAt) : null }
      });
      counts.promotions++;
    }

    for (const order of state.orders || []) {
      if (!order.orderId) continue;
      const status = orderStatuses.has(order.status) ? order.status : 'new';
      const payment = order.payment || { method: 'unknown', status: 'pending' };
      const customer = order.customer || {};
      const orderData = {
        status,
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.deliveryFee),
        total: Number(order.total),
        paymentMethod: payment.method || 'unknown',
        paymentStatus: payment.status || 'pending',
        paymentData: encryptJson(payment),
        customerData: encryptJson(customer),
        createdAt: asDate(order.createdAt),
        statusUpdatedAt: asDate(order.statusUpdatedAt || order.createdAt)
      };
      const savedOrder = await transaction.order.upsert({ where: { id: order.orderId }, create: { id: order.orderId, ...orderData }, update: orderData });
      await transaction.orderItem.deleteMany({ where: { orderId: savedOrder.id } });
      if (order.items?.length) {
        await transaction.orderItem.createMany({ data: order.items.map(item => ({ orderId: savedOrder.id, productId: Number(item.productId) || 0, name: item.name, quantity: Number(item.quantity), addons: item.addons || [], unitPrice: Number(item.unitPrice ?? item.price), total: Number(item.total ?? Number(item.unitPrice ?? item.price) * Number(item.quantity)) })) });
      }
      counts.orders++;
    }
  });

  return counts;
}

async function main() {
  if (!process.env.ADMIN_PASSWORD) throw new Error('Defina ADMIN_PASSWORD no .env para descriptografar o arquivo legado.');
  await adminStore.initializeAdminStore();
  if (!fs.existsSync(legacyFile)) {
    console.log('Arquivo legado não encontrado; o catálogo padrão já foi inicializado no PostgreSQL.');
    return;
  }
  const state = decryptLegacyStore(fs.readFileSync(legacyFile, 'utf8'), process.env.ADMIN_PASSWORD);
  const counts = await importLegacyState(state);
  console.log(`Importação Prisma concluída: ${JSON.stringify(counts)}`);
  console.log('O arquivo legado foi mantido sem alterações.');
}

main()
  .catch(error => { console.error(`Falha na importação: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
