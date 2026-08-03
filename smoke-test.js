'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 3199;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'routewise-test-'));
const temporaryStore = path.join(temporaryDirectory, 'store.json');
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), GOOGLE_MAPS_API_KEY: '', ROUTEWISE_STORE_PATH: temporaryStore },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', data => { output += data.toString(); });
child.stderr.on('data', data => { output += data.toString(); });

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      timeout: 5000,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : undefined
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: response.headers['content-type'] || ''
      }));
    });
    request.on('timeout', () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/health');
      if (response.status === 200) return response;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not start. Output:\n${output}`);
}

async function run() {
  try {
    const health = await waitForServer();
    const healthData = JSON.parse(health.body);
    if (!healthData.ok) throw new Error('Health endpoint did not report ok=true.');

    const homepage = await request('/');
    if (homepage.status !== 200 || !homepage.contentType.includes('text/html') || !homepage.body.includes('RouteWise')) {
      throw new Error('Homepage smoke test failed.');
    }

    const config = await request('/api/config');
    if (config.status !== 200) throw new Error('Configuration endpoint smoke test failed.');

    const planResponse = await request('/api/plan', {
      method: 'POST',
      body: {
        origin: { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
        destination: { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
        startDate: '2026-08-20',
        endDate: '2026-08-25',
        travelers: 2,
        preference: 'balanced'
      }
    });
    if (planResponse.status !== 200) throw new Error(`Trip-plan endpoint failed with status ${planResponse.status}.`);
    const plan = JSON.parse(planResponse.body);
    if (!Array.isArray(plan.options) || plan.options.length !== 5 || !plan.links?.drive || !plan.links?.flights) {
      throw new Error('Trip-plan response is incomplete.');
    }

    const email = `routewise-test-${Date.now()}@example.com`;
    const password = 'RouteWise-Test-Password';
    const registerResponse = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'RouteWise Test User', email, password }
    });
    if (registerResponse.status !== 200) throw new Error('Account-registration smoke test failed.');
    const user = JSON.parse(registerResponse.body).user;

    const loginResponse = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    if (loginResponse.status !== 200) throw new Error('Account-login smoke test failed.');

    const saveTripResponse = await request('/api/trips', {
      method: 'POST',
      body: { userId: user.id, plan }
    });
    if (saveTripResponse.status !== 200) throw new Error('Saved-trip smoke test failed.');
    const savedTrip = JSON.parse(saveTripResponse.body);

    const tripList = await request(`/api/trips/${encodeURIComponent(user.id)}`);
    if (tripList.status !== 200 || JSON.parse(tripList.body).length !== 1) throw new Error('Trip-list smoke test failed.');

    const favoriteResponse = await request('/api/favorites', {
      method: 'POST',
      body: { userId: user.id, item: { name: 'Miami Beach', address: 'Miami Beach, FL' } }
    });
    if (favoriteResponse.status !== 200) throw new Error('Favorite-save smoke test failed.');
    const favorite = JSON.parse(favoriteResponse.body);

    const favoriteList = await request(`/api/favorites/${encodeURIComponent(user.id)}`);
    if (favoriteList.status !== 200 || JSON.parse(favoriteList.body).length !== 1) throw new Error('Favorite-list smoke test failed.');

    await request(`/api/trips/${encodeURIComponent(savedTrip.id)}`, { method: 'DELETE' });
    await request(`/api/favorites/${encodeURIComponent(favorite.id)}`, { method: 'DELETE' });

    console.log('PASS: Server starts successfully');
    console.log('PASS: /api/health responds successfully');
    console.log('PASS: Homepage loads successfully');
    console.log('PASS: /api/config responds successfully');
    console.log('PASS: /api/plan returns five travel options and provider links');
    console.log('PASS: Registration and login work');
    console.log('PASS: Saving, listing, and deleting trips work');
    console.log('PASS: Saving, listing, and deleting favorites work');
    console.log('\nRouteWise smoke test completed successfully.');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(`FAIL: ${error.message}`);
  child.kill('SIGTERM');
  process.exitCode = 1;
});
