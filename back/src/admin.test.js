const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('./db');
const adminStore = require('./admin');
const { verifyPassword } = require('./security');

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
  assert.deepEqual(findArgs, { where: { tokenHash: expectedHash }, include: { account: true } });
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

test('stores pending authenticator secrets encrypted and enables them after code verification', async t => {
  const originalEncryptionKey = process.env.DATA_ENCRYPTION_KEY;
  const originalFindUnique = prisma.adminTotpCredential.findUnique;
  const originalCreate = prisma.adminTotpCredential.create;
  const originalUpdateMany = prisma.adminTotpCredential.updateMany;
  const token = 'random-authenticator-setup-token';
  const secret = 'JBSWY3DPEHPK3PXP';
  const expiresAt = new Date(Date.now() + 60_000);
  let credential;
  let activationArgs;
  process.env.DATA_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');
  prisma.adminTotpCredential.findUnique = async () => credential || null;
  prisma.adminTotpCredential.create = async args => {
    credential = { accountId: null, ...args.data, enabledAt: null };
    return credential;
  };
  prisma.adminTotpCredential.updateMany = async args => {
    activationArgs = args;
    return { count: 1 };
  };
  t.after(() => {
    prisma.adminTotpCredential.findUnique = originalFindUnique;
    prisma.adminTotpCredential.create = originalCreate;
    prisma.adminTotpCredential.updateMany = originalUpdateMany;
    if (originalEncryptionKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = originalEncryptionKey;
  });

  assert.deepEqual(await adminStore.createAdminTotpSetup(token, secret, expiresAt), { alreadyEnabled: false });
  assert.notEqual(credential.secret, secret);
  assert.notEqual(credential.setupTokenHash, token);
  assert.deepEqual(await adminStore.getAdminTotpSetup(token), { accountId: null, secret });
  assert.equal(await adminStore.activateAdminTotpSetup(token, 123, ['a'.repeat(64)]), true);
  assert.equal(activationArgs.where.setupTokenHash, require('node:crypto').createHash('sha256').update(token).digest('hex'));
  assert.equal(activationArgs.data.lastUsedCounter, 123n);
});

test('creates collaborator accounts with a hashed password and selected permissions', async t => {
  const originalCreate = prisma.adminAccount.create;
  const id = '536a94c8-e118-41d8-b512-6aa50d958931';
  let createArgs;
  prisma.adminAccount.create = async args => {
    createArgs = args;
    return {
      id,
      name: args.data.name,
      email: args.data.email,
      permissions: args.data.permissions,
      createdAt: new Date()
    };
  };
  t.after(() => {
    prisma.adminAccount.create = originalCreate;
  });

  const result = await adminStore.createAdminAccount({
    name: 'Pessoa Colaboradora',
    email: 'COLABORADOR@example.com ',
    password: 'senha-segura-123',
    permissions: ['dashboard', 'menu']
  });

  assert.equal(createArgs.data.email, 'colaborador@example.com');
  assert.equal(createArgs.data.loginName, 'pessoa colaboradora');
  assert.notEqual(createArgs.data.passwordHash, 'senha-segura-123');
  assert.equal(verifyPassword('senha-segura-123', createArgs.data.passwordHash), true);
  assert.deepEqual(createArgs.data.permissions, ['dashboard', 'menu']);
  assert.equal(result.data.id, id);
  assert.equal('passwordHash' in result.data, false);
});

test('finds collaborator profiles by case-insensitive name or email', async t => {
  const originalFindFirst = prisma.adminAccount.findFirst;
  const account = { id: '536a94c8-e118-41d8-b512-6aa50d958931' };
  let query;
  prisma.adminAccount.findFirst = async args => {
    query = args;
    return account;
  };
  t.after(() => {
    prisma.adminAccount.findFirst = originalFindFirst;
  });

  assert.equal(await adminStore.findAdminAccountByLogin('Pessoa Colaboradora'), account);
  assert.deepEqual(query.where.OR, [
    { loginName: 'pessoa colaboradora' },
    { email: { equals: 'Pessoa Colaboradora', mode: 'insensitive' } }
  ]);
});

test('lists authenticator status without exposing the stored credential', async t => {
  const originalFindMany = prisma.adminAccount.findMany;
  prisma.adminAccount.findMany = async () => [{
    id: '536a94c8-e118-41d8-b512-6aa50d958931',
    name: 'Pessoa Colaboradora',
    email: 'colaborador@example.com',
    permissions: ['dashboard'],
    createdAt: new Date(),
    totpCredential: { enabledAt: new Date() }
  }];
  t.after(() => {
    prisma.adminAccount.findMany = originalFindMany;
  });

  const [account] = await adminStore.listAdminAccounts();

  assert.equal(account.authenticatorEnabled, true);
  assert.equal('totpCredential' in account, false);
  assert.equal('secret' in account, false);
});

test('resets collaborator authenticator and invalidates their sessions atomically', async t => {
  const originalTransaction = prisma.$transaction;
  const id = '536a94c8-e118-41d8-b512-6aa50d958931';
  const calls = [];
  prisma.$transaction = async operation => operation({
    adminAccount: { findUnique: async args => { calls.push(['account', args]); return { id }; } },
    adminTotpCredential: { deleteMany: async args => { calls.push(['totp', args]); return { count: 1 }; } },
    adminSession: { deleteMany: async args => { calls.push(['sessions', args]); return { count: 1 }; } }
  });
  t.after(() => {
    prisma.$transaction = originalTransaction;
  });

  assert.equal(await adminStore.resetAdminAccountAuthenticator(id), true);
  assert.deepEqual(calls.map(([type]) => type), ['account', 'totp', 'sessions']);
  assert.deepEqual(calls[1][1], { where: { subjectKey: id } });
  assert.deepEqual(calls[2][1], { where: { accountId: id } });
});

test('rejects invalid collaborator credentials before writing an account', async t => {
  const originalCreate = prisma.adminAccount.create;
  let createCalled = false;
  prisma.adminAccount.create = async () => {
    createCalled = true;
    throw new Error('Should not be called');
  };
  t.after(() => {
    prisma.adminAccount.create = originalCreate;
  });

  const result = await adminStore.createAdminAccount({
    name: 'Colaborador',
    email: 'email-invalido',
    password: 'curta',
    permissions: ['dashboard', 'dashboard']
  });

  assert.match(result.error, /Confira o nome/);
  assert.equal(createCalled, false);
});

test('stores login challenges with a hashed token and limits invalid attempts', async t => {
  const originalCreate = prisma.adminLoginChallenge.create;
  const originalFindUnique = prisma.adminLoginChallenge.findUnique;
  const originalDeleteMany = prisma.adminLoginChallenge.deleteMany;
  const originalUpdateMany = prisma.adminLoginChallenge.updateMany;
  const token = 'random-login-challenge-token';
  const expiresAt = new Date(Date.now() + 60_000);
  let challenge = { attempts: 0 };
  let tokenHash;
  let failureArgs;
  prisma.adminLoginChallenge.create = async args => {
    challenge = { ...args.data, attempts: 0 };
    tokenHash = args.data.tokenHash;
    return args.data;
  };
  prisma.adminLoginChallenge.deleteMany = async () => ({ count: 0 });
  prisma.adminLoginChallenge.findUnique = async () => challenge;
  prisma.adminLoginChallenge.updateMany = async args => {
    failureArgs = args;
    challenge = { ...challenge, attempts: challenge.attempts + 1 };
    return { count: 1 };
  };
  t.after(() => {
    prisma.adminLoginChallenge.create = originalCreate;
    prisma.adminLoginChallenge.findUnique = originalFindUnique;
    prisma.adminLoginChallenge.deleteMany = originalDeleteMany;
    prisma.adminLoginChallenge.updateMany = originalUpdateMany;
  });

  await adminStore.createAdminLoginChallenge(token, expiresAt, '536a94c8-e118-41d8-b512-6aa50d958931');

  assert.notEqual(challenge.tokenHash, token);
  assert.equal(challenge.codeHash, undefined);
  assert.equal(challenge.expiresAt, expiresAt);
  assert.equal((await adminStore.getAdminLoginChallenge(token)).accountId, '536a94c8-e118-41d8-b512-6aa50d958931');
  await adminStore.recordAdminLoginChallengeFailure(token);
  assert.equal(challenge.attempts, 1);
  assert.equal(failureArgs.where.tokenHash, tokenHash);
  assert.equal(failureArgs.where.attempts.lt, 5);
});
