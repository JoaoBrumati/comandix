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
      category: { notIn: ['Complementos', 'Acompanhamentos', 'Molhos'] }
    });
    return [{
      id: 25,
      name: 'Produto de teste',
      category: 'Lanches',
      description: 'Descrição do produto',
      price: 18.5,
      active: true,
      image: '/img/menu/teste.jpg',
      rating: '5.0',
      tag: 'Do cardápio'
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
});
