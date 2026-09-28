const cepPattern = /^\d{8}$/;
const cepCache = new Map();

async function lookupCep(cep) {
  if (!cepPattern.test(cep)) {
    const error = new Error('CEP inválido. Informe os 8 números.');
    error.status = 400;
    throw error;
  }
  if (cepCache.has(cep)) return cepCache.get(cep);

  const response = await fetch(`https://cep.awesomeapi.com.br/json/${cep}`, { signal: AbortSignal.timeout(8000) });
  if (response.status === 404) {
    const error = new Error('CEP não encontrado. Confira os números digitados.');
    error.status = 404;
    throw error;
  }
  if (!response.ok) {
    const error = new Error('O serviço de CEP está temporariamente indisponível. Tente novamente.');
    error.status = 502;
    throw error;
  }

  const cepData = await response.json();
  cepCache.set(cep, cepData);
  return cepData;
}

function getCoordinates(cepData) {
  const latitude = Number(cepData.lat);
  const longitude = Number(cepData.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function distanceInKm(origin, destination) {
  const radians = value => value * Math.PI / 180;
  const latitudeDifference = radians(destination.latitude - origin.latitude);
  const longitudeDifference = radians(destination.longitude - origin.longitude);
  const arc = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

async function getStoreCoordinates() {
  if (process.env.STORE_LAT && process.env.STORE_LNG) {
    const latitude = Number(process.env.STORE_LAT);
    const longitude = Number(process.env.STORE_LNG);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
  }
  if (process.env.STORE_CEP && cepPattern.test(process.env.STORE_CEP)) {
    const storeCepData = await lookupCep(process.env.STORE_CEP);
    const coordinates = getCoordinates(storeCepData);
    if (coordinates) return coordinates;
  }
  {
    const error = new Error('A localização da loja ainda não está configurada. Informe STORE_CEP no arquivo .env.');
    error.status = 503;
    throw error;
  }
}

async function quoteDelivery(cep) {
  const cepData = await lookupCep(cep);
  const destination = getCoordinates(cepData);
  if (!destination) {
    const error = new Error('Não foi possível localizar este CEP para calcular a taxa.');
    error.status = 422;
    throw error;
  }
  const distanceKm = distanceInKm(await getStoreCoordinates(), destination);
  const fee = distanceKm <= 5 ? 5 : distanceKm <= 10 ? 10 : 20;
  return { fee, distanceKm: Math.round(distanceKm * 10) / 10 };
}

function publicAddress(cepData) {
  return {
    cep: cepData.cep,
    street: cepData.address || '',
    neighborhood: cepData.district || '',
    city: cepData.city || '',
    state: cepData.state || ''
  };
}

module.exports = { lookupCep, quoteDelivery, publicAddress };
