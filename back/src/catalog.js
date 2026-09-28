const products = [
  { id: 1, name: 'Smash clássico', category: 'Hambúrgueres', description: 'Pão brioche, carne, queijo e molho da casa.', price: 28.9, rating: '4.9', tag: 'Mais pedido', image: 'Qual-e-o-Lanche-Mais-Popular-no-Brasil.webp', active: true },
  { id: 2, name: 'Pizza da casa', category: 'Pizzas', description: 'Queijo cremoso, tomate fresco e manjericão.', price: 42, rating: '4.8', tag: 'Favorita', image: 'WhatsApp Image 2026-09-24 at 12.02.10.jpeg', active: true },
  { id: 3, name: 'Bowl tropical', category: 'Saudável', description: 'Arroz, salada crocante, frango e molho cítrico.', price: 31.5, rating: '4.7', tag: 'Leve', image: 'WhatsApp Image 2026-09-24 at 12.02.11 (1).jpeg', active: true },
  { id: 4, name: 'Brownie quentinho', category: 'Doces', description: 'Chocolate intenso, casquinha crocante e calda.', price: 16.9, rating: '4.9', tag: 'Novo', image: 'WhatsApp Image 2026-09-24 at 12.02.11 (2).jpeg', active: true },
  { id: 5, name: 'Batata crocante', category: 'Acompanhamentos', description: 'Porção dourada com páprica e molho especial.', price: 18.5, rating: '4.8', tag: 'Para dividir', image: 'WhatsApp Image 2026-09-24 at 12.02.11.jpeg', active: true },
  { id: 6, name: 'Torta de frutas', category: 'Doces', description: 'Massa amanteigada, creme e frutas da estação.', price: 19.9, rating: '4.6', tag: 'Do dia', image: 'WhatsApp Image 2026-09-24 at 12.02.12 (1).jpeg', active: true },
  { id: 7, name: 'Limonada fresca', category: 'Bebidas', description: 'Limão espremido, água com gás e hortelã.', price: 9.9, rating: '4.9', tag: 'Refrescante', image: 'WhatsApp Image 2026-09-24 at 12.02.12.jpeg', active: true },
  { id: 8, name: 'Combo completo', category: 'Hambúrgueres', description: 'Smash, batata e bebida para matar a fome.', price: 39.9, rating: '5.0', tag: 'Combo', image: 'WhatsApp Image 2026-09-24 at 12.02.10 (1).jpeg', active: true }
];

const addons = {
  drinks: [{ name: 'Coca-Cola 350ml', price: 7 }, { name: 'Guaraná 350ml', price: 7 }, { name: 'Água mineral', price: 4 }],
  sides: [{ name: 'Batata frita', price: 8 }, { name: 'Anéis de cebola', price: 10 }, { name: 'Salada fresca', price: 6 }],
  sauces: [{ name: 'Maionese da casa', price: 2 }, { name: 'Molho barbecue', price: 2 }, { name: 'Ketchup', price: 1 }]
};

const catalog = new Map(products.map(product => [product.id, { name: product.name, price: product.price }]));
const addonPrices = new Map(Object.values(addons).flat().map(addon => [addon.name, addon.price]));

module.exports = { addons, addonPrices, catalog, products };
