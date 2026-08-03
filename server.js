const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const STORE_PATH = process.env.ROUTEWISE_STORE_PATH
  ? path.resolve(process.env.ROUTEWISE_STORE_PATH)
  : path.join(ROOT, 'data', 'store.json');
const STORE_TEMPLATE_PATH = path.join(ROOT, 'data', 'store.example.json');

function loadEnv(filePath = path.join(ROOT, '.env')) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);

function emptyStore() {
  return { users: [], trips: [], favorites: [] };
}
function ensureStore() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  if (fs.existsSync(STORE_PATH)) return;
  try {
    const template = JSON.parse(fs.readFileSync(STORE_TEMPLATE_PATH, 'utf8'));
    fs.writeFileSync(STORE_PATH, JSON.stringify(template, null, 2));
  } catch {
    fs.writeFileSync(STORE_PATH, JSON.stringify(emptyStore(), null, 2));
  }
}
function readStore() {
  ensureStore();
  try {
    const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return {
      users: Array.isArray(store.users) ? store.users : [],
      trips: Array.isArray(store.trips) ? store.trips : [],
      favorites: Array.isArray(store.favorites) ? store.favorites : []
    };
  } catch {
    return emptyStore();
  }
}
function writeStore(store) {
  ensureStore();
  const temporaryPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
  fs.renameSync(temporaryPath, STORE_PATH);
}
function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}
function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function googleHeaders(fieldMask) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY || '',
    'X-Goog-FieldMask': fieldMask
  };
}
function moneyValue(money) {
  if (!money) return null;
  const value = Number(money.units || 0) + Number(money.nanos || 0) / 1e9;
  return Number.isFinite(value) ? value : null;
}
function getToll(route) {
  const prices = route?.travelAdvisory?.tollInfo?.estimatedPrice || [];
  const selected = prices.find(item => item.currencyCode === 'USD') || prices[0];
  return selected ? { amount: moneyValue(selected), currency: selected.currencyCode || null } : { amount: null, currency: null };
}

async function computeRoute(origin, destination, mode, transitModes = []) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: mode,
    computeAlternativeRoutes: false,
    languageCode: 'en-US',
    units: 'IMPERIAL'
  };
  if (mode === 'DRIVE') {
    body.routingPreference = 'TRAFFIC_AWARE';
    body.extraComputations = ['TOLLS'];
    body.routeModifiers = { avoidTolls: false, avoidHighways: false, avoidFerries: false };
  }
  if (mode === 'TRANSIT' && transitModes.length) {
    body.transitPreferences = { allowedTravelModes: transitModes, routingPreference: 'FEWER_TRANSFERS' };
  }
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: googleHeaders('routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo'),
      body: JSON.stringify(body)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return null;
    const toll = getToll(route);
    return {
      distanceMiles: route.distanceMeters / 1609.344,
      durationSeconds: Number(String(route.duration || '0s').replace('s', '')),
      staticDurationSeconds: Number(String(route.staticDuration || '0s').replace('s', '')),
      encodedPolyline: route.polyline?.encodedPolyline || null,
      tollEstimate: toll.amount,
      tollCurrency: toll.currency,
      retrievedAt: new Date().toISOString(),
      source: 'Google Maps Routes API'
    };
  } catch {
    return null;
  }
}

async function textSearch(textQuery, includedType, maxResultCount = 6) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return [];
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: googleHeaders('places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.websiteUri,places.photos'),
      body: JSON.stringify({ textQuery, includedType, maxResultCount, languageCode: 'en' })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.places || []).map(place => ({
      id: place.id,
      name: place.displayName?.text || 'Place',
      address: place.formattedAddress || '',
      rating: place.rating || null,
      userRatingCount: place.userRatingCount || 0,
      priceLevel: place.priceLevel || null,
      googleMapsUri: place.googleMapsUri || null,
      websiteUri: place.websiteUri || null,
      photoName: place.photos?.[0]?.name || null,
      lat: place.location?.latitude || null,
      lng: place.location?.longitude || null
    }));
  } catch {
    return [];
  }
}

function routeSlug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, 'and').replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function directLinks(input) {
  const e = encodeURIComponent;
  const origin = `${input.origin.city}, ${input.origin.state}`;
  const destination = `${input.destination.city}, ${input.destination.state}`;
  const travelers = Math.max(1, Math.min(6, Number(input.travelers) || 1));
  const start = input.startDate || '0000-00-00';
  const end = input.endDate || start;
  const originCoords = `${Number(input.origin.lat).toFixed(6)},${Number(input.origin.lng).toFixed(6)}`;
  const destinationCoords = `${Number(input.destination.lat).toFixed(6)},${Number(input.destination.lng).toFixed(6)}`;
  const mapBase = `https://www.google.com/maps/dir/?api=1&origin=${e(originCoords)}&destination=${e(destinationCoords)}`;
  const fromState = routeSlug(input.origin.state);
  const toState = routeSlug(input.destination.state);
  const fromCity = routeSlug(input.origin.city);
  const toCity = routeSlug(input.destination.city);
  return {
    drive: `${mapBase}&travelmode=driving`,
    bike: `${mapBase}&travelmode=bicycling`,
    transit: `${mapBase}&travelmode=transit`,
    flights: `https://www.expedia.com/go/flight/search/Roundtrip/${e(start)}/${e(end)}?load=1&FromAirport=${e(origin)}&ToAirport=${e(destination)}&FromTime=362&ToTime=362&NumAdult=${travelers}`,
    train: `https://www.wanderu.com/en-us/train/us-${fromState}/${fromCity}/us-${toState}/${toCity}/`,
    bus: `https://www.wanderu.com/en-us/bus/us-${fromState}/${fromCity}/us-${toState}/${toCity}/`,
    hotels: `https://www.google.com/travel/hotels?hl=en&curr=USD&q=${e(`${destination} hotels ${start} to ${end} for ${travelers} travelers`)}`,
    carRental: 'https://www.enterprise.com/en/car-rental.html',
    activities: `https://www.google.com/maps/search/?api=1&query=${e(`${destination} attractions`)}`,
    insurance: 'https://www.allianztravelinsurance.com/quote'
  };
}
function fallbackRoute(origin, destination, speed) {
  const R = 3958.8;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(destination.lat - origin.lat);
  const dLng = rad(destination.lng - origin.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(origin.lat)) * Math.cos(rad(destination.lat)) * Math.sin(dLng / 2) ** 2;
  const distanceMiles = 2 * R * Math.asin(Math.sqrt(x));
  return {
    distanceMiles,
    durationSeconds: distanceMiles / speed * 3600,
    staticDurationSeconds: distanceMiles / speed * 3600,
    encodedPolyline: null,
    tollEstimate: null,
    tollCurrency: null,
    source: 'RouteWise fallback estimate'
  };
}
function estimateDriveCost(distance, liveTollEstimate = null) {
  const mpg = Math.max(1, Number(process.env.DEFAULT_VEHICLE_MPG || 28));
  const gasPrice = Math.max(0, Number(process.env.GAS_PRICE_PER_GALLON || 3.60));
  const fuel = distance / mpg * gasPrice;
  const tolls = Number.isFinite(liveTollEstimate) ? liveTollEstimate : distance * 0.035;
  const tollSource = Number.isFinite(liveTollEstimate) ? 'Google Maps toll estimate' : 'RouteWise toll estimate';
  return {
    low: fuel * 0.95 + tolls,
    high: fuel * 1.10 + tolls,
    breakdown: { fuel, tolls },
    mpg,
    gasPrice,
    tollSource
  };
}
function estimateModeFares(distance, travelers, bikeSeconds) {
  const count = Math.max(1, Number(travelers) || 1);
  const flightBase = distance < 300 ? 95 : distance < 700 ? 165 : distance < 1400 ? 245 : 335;
  const flightMid = count * (flightBase + Math.max(85, distance * 0.055));
  const trainMid = count * Math.max(75, distance * 0.22);
  const busMid = count * Math.max(55, distance * 0.13);
  const bikeDays = Math.max(1, Math.ceil(bikeSeconds / 28800));
  return {
    fly: { low: Math.max(95 * count, flightMid * 0.72), high: Math.max(165 * count, flightMid * 1.18) },
    train: { low: Math.max(45 * count, trainMid * 0.62), high: trainMid * 1.12 },
    bus: { low: Math.max(30 * count, busMid * 0.62), high: busMid * 1.15 },
    bike: { low: 0, high: 0, tripSuppliesEstimate: count * bikeDays * 42 }
  };
}
function optionScore(option, input, maxTime, maxCost) {
  const weights = input.preference === 'fast'
    ? { time: .55, cost: .2, comfort: .2, flexibility: .05 }
    : input.preference === 'budget'
    ? { time: .15, cost: .6, comfort: .1, flexibility: .15 }
    : input.preference === 'comfort'
    ? { time: .2, cost: .15, comfort: .55, flexibility: .1 }
    : { time: .32, cost: .32, comfort: .2, flexibility: .16 };
  const compareDuration = option.comparisonDurationSeconds ?? option.durationSeconds ?? maxTime;
  const compareCost = option.comparisonCostHigh ?? option.costHigh ?? maxCost;
  const timeScore = 100 - compareDuration / maxTime * 100;
  const costScore = 100 - compareCost / maxCost * 100;
  const comfort = { drive: 72, fly: 86, train: 82, bus: 58, bike: 45 }[option.mode];
  const flexibility = { drive: 95, fly: 40, train: 60, bus: 45, bike: 82 }[option.mode];
  return Math.round(timeScore * weights.time + costScore * weights.cost + comfort * weights.comfort + flexibility * weights.flexibility);
}

async function buildPlan(input) {
  const [driveLive, bikeLive, trainLive, busLive] = await Promise.all([
    computeRoute(input.origin, input.destination, 'DRIVE'),
    computeRoute(input.origin, input.destination, 'BICYCLE'),
    computeRoute(input.origin, input.destination, 'TRANSIT', ['TRAIN', 'RAIL']),
    computeRoute(input.origin, input.destination, 'TRANSIT', ['BUS'])
  ]);
  const drive = driveLive || fallbackRoute(input.origin, input.destination, 61);
  const bike = bikeLive || fallbackRoute(input.origin, input.destination, 11.5);
  const train = trainLive || fallbackRoute(input.origin, input.destination, 46);
  const bus = busLive || fallbackRoute(input.origin, input.destination, 43);
  const driveCost = estimateDriveCost(drive.distanceMiles, drive.tollEstimate);
  const fares = estimateModeFares(drive.distanceMiles, input.travelers, bike.durationSeconds);
  const flightSeconds = Math.max(2.5 * 3600, (drive.distanceMiles / 500 + 2.1) * 3600);
  const options = [
    {
      mode: 'drive', label: 'Drive', icon: '🚗',
      distanceMiles: drive.distanceMiles,
      durationSeconds: drive.durationSeconds,
      costLow: driveCost.low, costHigh: driveCost.high,
      estimateLabel: 'Estimated total',
      source: `${drive.source}; ${driveCost.tollSource}; fuel based on ${driveCost.mpg} MPG and $${driveCost.gasPrice.toFixed(2)}/gal`,
      transferText: 'Traffic-aware driving route',
      encodedPolyline: drive.encodedPolyline,
      costBreakdown: driveCost.breakdown,
      tollEstimate: drive.tollEstimate,
      tollCurrency: drive.tollCurrency,
      comparisonDurationSeconds: drive.durationSeconds,
      comparisonCostHigh: driveCost.high
    },
    {
      mode: 'fly', label: 'Fly', icon: '✈️', distanceMiles: null, durationSeconds: flightSeconds,
      costLow: fares.fly.low, costHigh: fares.fly.high,
      estimateLabel: 'Estimated round-trip fare',
      source: 'Estimated round-trip airfare for all travelers. Open the prefilled flight results to verify the current purchasable fare, airline, stops, and exact itinerary.',
      transferText: 'Estimated airport-to-airport time',
      comparisonDurationSeconds: flightSeconds, comparisonCostHigh: fares.fly.high
    },
    {
      mode: 'train', label: 'Train', icon: '🚆',
      distanceMiles: trainLive ? train.distanceMiles : null,
      durationSeconds: trainLive ? train.durationSeconds : null,
      costLow: fares.train.low, costHigh: fares.train.high,
      estimateLabel: 'Estimated total fare',
      source: trainLive ? `${train.source}; displayed fare is an estimate for all travelers—open the prefilled train route to compare current options` : 'Estimated fare and schedule; open the prefilled train route to compare current options.',
      transferText: trainLive ? 'Google Maps transit time' : 'Estimated rail travel time',
      comparisonDurationSeconds: train.durationSeconds, comparisonCostHigh: fares.train.high
    },
    {
      mode: 'bus', label: 'Bus', icon: '🚌',
      distanceMiles: busLive ? bus.distanceMiles : null,
      durationSeconds: busLive ? bus.durationSeconds : null,
      costLow: fares.bus.low, costHigh: fares.bus.high,
      estimateLabel: 'Estimated total fare',
      source: busLive ? `${bus.source}; displayed fare is an estimate for all travelers—open the prefilled bus route to compare current options` : 'Estimated fare and schedule; open the prefilled bus route to compare current options.',
      transferText: busLive ? 'Google Maps transit time' : 'Estimated bus travel time',
      comparisonDurationSeconds: bus.durationSeconds, comparisonCostHigh: fares.bus.high
    },
    {
      mode: 'bike', label: 'Bike', icon: '🚲',
      distanceMiles: bikeLive ? bike.distanceMiles : null,
      durationSeconds: bikeLive ? bike.durationSeconds : null,
      costLow: 0, costHigh: 0,
      estimateLabel: 'Ticket fare',
      source: bikeLive ? `${bike.source}; ticket fare is $0 and food/lodging/supplies are excluded` : 'Ticket fare is $0. Open Google Maps for the route; food, lodging, and supplies are excluded.',
      transferText: 'Bike route',
      comparisonDurationSeconds: bike.durationSeconds, comparisonCostHigh: 0
    }
  ];
  const comparable = options.filter(o => o.comparisonDurationSeconds || o.durationSeconds);
  const maxTime = Math.max(...comparable.map(o => o.comparisonDurationSeconds ?? o.durationSeconds));
  const maxCost = Math.max(...options.map(o => o.comparisonCostHigh ?? o.costHigh ?? driveCost.high * 1.6));
  options.forEach(option => { option.score = optionScore(option, input, maxTime, maxCost); });
  options.sort((a, b) => b.score - a.score);
  const destination = `${input.destination.city}, ${input.destination.state}`;
  const [hotels, attractions] = await Promise.all([
    textSearch(`hotels in ${destination}`, 'hotel', 4),
    textSearch(`top tourist attractions in ${destination}`, 'tourist_attraction', 5)
  ]);
  const links = directLinks(input);
  return {
    input,
    best: options[0],
    options,
    route: drive,
    links,
    hotels,
    attractions,
    generatedAt: new Date().toISOString(),
    sources: {
      drive: drive.source,
      bike: bikeLive ? bike.source : 'Provider link',
      train: trainLive ? train.source : 'Route-specific Wanderu train page',
      bus: busLive ? bus.source : 'Route-specific Wanderu bus page',
      flight: 'Prefilled Expedia flight search; live fare and itinerary are shown after opening the results'
    },
    accuracy: {
      drivingDistanceAndTime: driveLive ? 'Google Maps Routes API' : 'Fallback estimate',
      drivingTolls: drive.tollEstimate != null ? 'Google Maps estimated toll' : 'Fallback toll estimate',
      flightFareAndTime: 'Available on the prefilled flight-results page',
      trainFare: 'Route opens with cities prefilled',
      busFare: 'Route opens with cities prefilled',
      hotelAndAttractionLinks: 'Official website when returned by Google Places; otherwise exact Google Maps place page'
    },
    warnings: [
      !process.env.GOOGLE_MAPS_API_KEY ? 'Google Maps API key is not configured, so route and place values use fallback estimates.' : null,
      'Flight, train, bus, and hotel prices can change until the provider confirms checkout. RouteWise opens the live or official provider page instead of presenting an unverified fare as exact.'
    ].filter(Boolean)
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};
function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': content.length
  });
  res.end(content);
  return true;
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'RouteWise Compass',
      node: process.version,
      googleMapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY)
    });
  }
  if (req.method === 'GET' && pathname === '/api/config') {
    return json(res, 200, {
      hasGoogleMaps: Boolean(process.env.GOOGLE_MAPS_API_KEY)
    });
  }
  if (req.method === 'GET' && pathname === '/api/place-photo') {
    const name = url.searchParams.get('name') || '';
    if (!name || !process.env.GOOGLE_MAPS_API_KEY) return json(res, 404, { error: 'Photo unavailable.' });
    try {
      const mediaUrl = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&skipHttpRedirect=true&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(mediaUrl);
      if (!response.ok) return json(res, 404, { error: 'Photo unavailable.' });
      const data = await response.json();
      if (!data.photoUri) return json(res, 404, { error: 'Photo unavailable.' });
      res.writeHead(302, { Location: data.photoUri });
      res.end();
      return;
    } catch {
      return json(res, 404, { error: 'Photo unavailable.' });
    }
  }
  if (req.method === 'POST' && pathname === '/api/plan') {
    const input = await readBody(req);
    const locations = [input?.origin, input?.destination];
    const validLocations = locations.every(location =>
      location &&
      typeof location.city === 'string' && location.city.trim() &&
      typeof location.state === 'string' && location.state.trim() &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    );
    if (!validLocations) {
      return json(res, 400, { error: 'A valid origin and destination are required.' });
    }
    input.origin.lat = Number(input.origin.lat);
    input.origin.lng = Number(input.origin.lng);
    input.destination.lat = Number(input.destination.lat);
    input.destination.lng = Number(input.destination.lng);
    input.travelers = Math.max(1, Math.min(12, Number(input.travelers) || 1));
    return json(res, 200, await buildPlan(input));
  }
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const { name, email, password } = await readBody(req);
    if (!name || !email || !password) return json(res, 400, { error: 'All fields are required.' });
    const store = readStore();
    const normalized = String(email).toLowerCase();
    if (store.users.some(user => user.email === normalized)) return json(res, 409, { error: 'Account already exists.' });
    const user = { id: randomId(), name, email: normalized, passwordHash: hashPassword(password) };
    store.users.push(user);
    writeStore(store);
    return json(res, 200, { user: { id: user.id, name: user.name, email: user.email } });
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const { email, password } = await readBody(req);
    const store = readStore();
    const user = store.users.find(item => item.email === String(email || '').toLowerCase());
    if (!user || !verifyPassword(password || '', user.passwordHash)) return json(res, 401, { error: 'Invalid email or password.' });
    return json(res, 200, { user: { id: user.id, name: user.name, email: user.email } });
  }
  const tripsMatch = pathname.match(/^\/api\/trips\/([^/]+)$/);
  if (req.method === 'GET' && tripsMatch) {
    return json(res, 200, readStore().trips.filter(trip => trip.userId === tripsMatch[1]));
  }
  if (req.method === 'POST' && pathname === '/api/trips') {
    const { userId, plan } = await readBody(req);
    if (!userId || !plan) return json(res, 400, { error: 'userId and plan are required.' });
    const store = readStore();
    const trip = { id: randomId(), userId, createdAt: new Date().toISOString(), plan };
    store.trips.unshift(trip);
    writeStore(store);
    return json(res, 200, trip);
  }
  if (req.method === 'DELETE' && tripsMatch) {
    const store = readStore();
    store.trips = store.trips.filter(trip => trip.id !== tripsMatch[1]);
    writeStore(store);
    return json(res, 200, { ok: true });
  }
  const favoritesMatch = pathname.match(/^\/api\/favorites\/([^/]+)$/);
  if (req.method === 'GET' && favoritesMatch) {
    return json(res, 200, readStore().favorites.filter(item => item.userId === favoritesMatch[1]));
  }
  if (req.method === 'POST' && pathname === '/api/favorites') {
    const { userId, item } = await readBody(req);
    if (!userId || !item) return json(res, 400, { error: 'userId and item are required.' });
    const store = readStore();
    const favorite = { id: randomId(), userId, item, createdAt: new Date().toISOString() };
    store.favorites.unshift(favorite);
    writeStore(store);
    return json(res, 200, favorite);
  }
  if (req.method === 'DELETE' && favoritesMatch) {
    const store = readStore();
    store.favorites = store.favorites.filter(item => item.id !== favoritesMatch[1]);
    writeStore(store);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'API endpoint not found.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    if (serveStatic(res, decodeURIComponent(url.pathname))) return;
    if (serveStatic(res, '/index.html')) return;
    return text(res, 404, 'Not found');
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || 'Internal server error.' });
  }
});

ensureStore();
const listener = server.listen(PORT, () => {
  console.log(`RouteWise running at http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Closing RouteWise...`);
  listener.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
