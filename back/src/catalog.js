const addons = {
  drinks: [{ name: 'Coca-Cola 350ml', price: 7 }, { name: 'Guaraná 350ml', price: 7 }, { name: 'Água mineral', price: 4 }],
  sides: [{ name: 'Batata frita', price: 8 }, { name: 'Anéis de cebola', price: 10 }, { name: 'Salada fresca', price: 6 }],
  sauces: [{ name: 'Maionese da casa', price: 2 }, { name: 'Molho barbecue', price: 2 }, { name: 'Ketchup', price: 1 }]
};

const addonPrices = new Map(Object.values(addons).flat().map(addon => [addon.name, addon.price]));

module.exports = { addons, addonPrices };
