const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('./db');
const adminStore = require('./admin');

test('listProducts is exported for the public storefront catalog', async t => {
  const originalProductFindMany = prisma.product.findMany;
  const originalPromotionFindMany = prisma.promotion.findMany;
  prisma.product.findMany = async options => {
    assert.deepEqual(options.where, {
      active: true,
      productGroup: { visibleInStorefront: true }
    });
    assert.deepEqual(options.include.optionGroup.include.products.where, { active: true });
    return [{
      id: 25,
      name: 'Produto de teste',
      category: 'Lanches',
      description: 'Descrição do produto',
      price: 18.5,
      active: true,
      image: '/img/menu/teste.jpg',
      rating: '5.0',
      tag: 'Do cardápio',
      optionGroupName: 'Centro de salgados',
      maxOptionSelections: 4,
      optionProductIds: [32],
      optionGroup: {
        name: 'Centro de salgados',
        products: [
          { id: 32, name: 'Coxinha', image: '/img/menu/coxinha.jpg' },
          { id: 33, name: 'Kibe', image: '/img/menu/kibe.jpg' }
        ]
      }
    }];
  };
  prisma.promotion.findMany = async () => [];
  t.after(() => {
    prisma.product.findMany = originalProductFindMany;
    prisma.promotion.findMany = originalPromotionFindMany;
  });

  const products = await adminStore.listProducts();
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Produto de teste');
  assert.equal(products[0].price, 18.5);
  assert.deepEqual(products[0].optionGroup, {
    name: 'Centro de salgados',
    maxSelections: 4,
    products: [{ id: 32, name: 'Coxinha', image: '/img/menu/coxinha.jpg' }]
  });
});

test('calculates combo choices as included options and enforces the configured group', async t => {
  const originalProductFindMany = prisma.product.findMany;
  prisma.product.findMany = async () => [{
    id: 70,
    name: 'Combo congelado',
    category: 'Combos',
    price: 70,
    active: true,
    productGroup: { visibleInStorefront: true },
    promotions: [],
    maxOptionSelections: 4,
    optionProductIds: [101, 102, 103, 104, 105],
    optionGroup: { products: [
      { id: 101, name: 'Coxinha' },
      { id: 102, name: 'Kibe' },
      { id: 103, name: 'Bolinha de queijo' },
      { id: 104, name: 'Risole' },
      { id: 105, name: 'Empada' },
      { id: 106, name: 'Pastel' }
    ] }
  }];
  t.after(() => {
    prisma.product.findMany = originalProductFindMany;
  });

  const [item] = await adminStore.calculateOrderItems([{ productId: 70, quantity: 1, addons: [], options: [101, 102] }]);
  assert.deepEqual(item.options, ['Coxinha', 'Kibe']);
  assert.equal(item.unitPrice, 70);
  await assert.rejects(
    adminStore.calculateOrderItems([{ productId: 70, quantity: 1, addons: [], options: [101, 102, 103, 104, 105] }]),
    /Escolha até 4 opções diferentes/
  );
  await assert.rejects(
    adminStore.calculateOrderItems([{ productId: 70, quantity: 1, addons: [], options: [106] }]),
    /Opção inválida/
  );
});

test('renames product groups and preserves storefront visibility', async t => {
  const originalUpdate = prisma.productGroup.update;
  prisma.productGroup.update = async options => {
    assert.deepEqual(options, {
      where: { name: 'Salgado' },
      data: { name: 'Salgados', visibleInStorefront: false }
    });
    return { name: 'Salgados', visibleInStorefront: false };
  };
  t.after(() => {
    prisma.productGroup.update = originalUpdate;
  });

  const result = await adminStore.updateProductGroup('Salgado', { name: 'Salgados', visibleInStorefront: false });
  assert.deepEqual(result, { data: { name: 'Salgados', visibleInStorefront: false } });
});

test('prevents renaming reserved add-on groups', async () => {
  const result = await adminStore.updateProductGroup('Molhos', { name: 'Molhos da casa' });
  assert.match(result.error, /reservado/);
});

test('stores hashed admin session tokens and persists their expiration and CSRF token', async t => {
  const originalCreate = prisma.adminSession.create;
  const token = 'session-token-for-testing';
  const csrfToken = 'a'.repeat(64);
  const expiresAt = new Date(Date.now() + 60_000);
  let createArgs;
  prisma.adminSession.create = async args => {
    createArgs = args;
    return args.data;
  };
  t.after(() => {
    prisma.adminSession.create = originalCreate;
  });

  const session = await adminStore.createAdminSession(token, csrfToken, expiresAt);

  assert.notEqual(createArgs.data.tokenHash, token);
  assert.match(createArgs.data.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(createArgs.data.csrfToken, csrfToken);
  assert.equal(createArgs.data.expiresAt, expiresAt);
  assert.deepEqual(session, createArgs.data);
});

test('loads persistent admin sessions by token hash and deletes expired sessions', async t => {
  const originalFindUnique = prisma.adminSession.findUnique;
  const originalDeleteMany = prisma.adminSession.deleteMany;
  const token = 'session-token-for-testing';
  const expectedHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
  const expiredAt = new Date(Date.now() - 1);
  let findArgs;
  let deleteArgs;
  prisma.adminSession.findUnique = async args => {
    findArgs = args;
    return { tokenHash: expectedHash, csrfToken: 'b'.repeat(64), expiresAt: expiredAt };
  };
  prisma.adminSession.deleteMany = async args => {
    deleteArgs = args;
    return { count: 1 };
  };
  t.after(() => {
    prisma.adminSession.findUnique = originalFindUnique;
    prisma.adminSession.deleteMany = originalDeleteMany;
  });

  assert.equal(await adminStore.getAdminSession(token), null);
  assert.deepEqual(findArgs, { where: { tokenHash: expectedHash } });
  assert.deepEqual(deleteArgs.where.tokenHash, expectedHash);
  assert.ok(deleteArgs.where.expiresAt.lte instanceof Date);
  assert.deepEqual(await adminStore.getAdminSession(''), null);
});

test('deletes persistent admin sessions without storing or querying the raw token', async t => {
  const originalDeleteMany = prisma.adminSession.deleteMany;
  const token = 'session-token-for-testing';
  const expectedHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
  let deleteArgs;
  prisma.adminSession.deleteMany = async args => {
    deleteArgs = args;
    return { count: 1 };
  };
  t.after(() => {
    prisma.adminSession.deleteMany = originalDeleteMany;
  });

  await adminStore.deleteAdminSession(token);

  assert.deepEqual(deleteArgs, { where: { tokenHash: expectedHash } });
  assert.equal(await adminStore.deleteAdminSession(''), undefined);
});
