const cepPattern = /^\d{8}$/;
const cepCache = new Map();

async function lookupCep(cep) {
  if (!cepPattern.test(cep)) {
    const error = new Error('CEP inválido. Informe os 8 números.');
    error.status = 400;
    throw error;
  }
  if (cepCache.has(cep)) return cepCache.get(cep);

  let notFound = false;
  const providers = [
    {
      url: `https://cep.awesomeapi.com.br/json/${cep}`,
      normalize: data => data
    },
    {
      url: `https://brasilapi.com.br/api/cep/v2/${cep}`,
      normalize: data => ({
        cep: data.cep,
        address: data.street || '',
        district: data.neighborhood || '',
        city: data.city || '',
        state: data.state || '',
        lat: data.location?.coordinates?.latitude,
        lng: data.location?.coordinates?.longitude
      })
    }
  ];

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, { signal: AbortSignal.timeout(8000) });
      if (response.status === 404) {
        notFound = true;
        continue;
      }
      if (!response.ok) continue;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) continue;
      const cepData = provider.normalize(await response.json());
      if (!cepData || typeof cepData !== 'object' || !cepData.cep) continue;
      cepCache.set(cep, cepData);
      return cepData;
    } catch {}
  }

  const error = new Error(notFound ? 'CEP não encontrado. Confira os números digitados.' : 'O serviço de CEP está temporariamente indisponível. Tente novamente.');
  error.status = notFound ? 404 : 502;
  throw error;
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
