'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'server.js',
  'package.json',
  '.env.example',
  'README.md',
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/cities-data.js',
  'public/assets/usa_50_states_map.png',
  'data/store.example.json'
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const majorVersion = Number(process.versions.node.split('.')[0]);
if (majorVersion < 18) {
  fail(`Node.js 18 or newer is required. Current version: ${process.version}`);
} else {
  console.log(`PASS: Node.js ${process.version}`);
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`Missing ${relativePath}`);
  else console.log(`PASS: ${relativePath}`);
}

for (const relativePath of ['server.js', 'public/app.js', 'public/cities-data.js']) {
  try {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    new vm.Script(source, { filename: relativePath });
    console.log(`PASS: JavaScript syntax in ${relativePath}`);
  } catch (error) {
    fail(`Syntax error in ${relativePath}: ${error.message}`);
  }
}

for (const relativePath of ['package.json', 'data/store.example.json']) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    console.log(`PASS: Valid JSON in ${relativePath}`);
  } catch (error) {
    fail(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

const assetsPath = path.join(root, 'public', 'assets');
if (fs.existsSync(assetsPath)) {
  const imageCount = fs.readdirSync(assetsPath).filter(name => /\.(png|jpe?g|webp|svg)$/i.test(name)).length;
  if (imageCount < 10) fail(`Expected at least 10 image assets; found ${imageCount}`);
  else console.log(`PASS: ${imageCount} image assets found`);
}


const citySource = fs.readFileSync(path.join(root, 'public/cities-data.js'), 'utf8');
try {
  const context = {};
  vm.createContext(context);
  new vm.Script(`${citySource}
;globalThis.__stateNames = ROUTEWISE_STATE_NAMES; globalThis.__cityData = ROUTEWISE_CITY_DATA;`).runInContext(context);
  const stateCodes = Object.keys(context.__stateNames || {});
  const cityStateCodes = Object.keys(context.__cityData || {});
  if (stateCodes.length !== 50) fail(`Expected 50 state names; found ${stateCodes.length}`);
  else console.log('PASS: All 50 state names are present');
  if (cityStateCodes.length !== 50) fail(`Expected city data for 50 states; found ${cityStateCodes.length}`);
  else console.log('PASS: City data exists for all 50 states');
  const emptyStates = cityStateCodes.filter(code => !Array.isArray(context.__cityData[code]) || context.__cityData[code].length === 0);
  if (emptyStates.length) fail(`States without cities: ${emptyStates.join(', ')}`);
  else console.log('PASS: Every state contains city entries');
} catch (error) {
  fail(`Could not validate state/city data: ${error.message}`);
}

const referenceSources = ['public/index.html', 'public/styles.css', 'public/app.js'];
const assetReferences = new Set();
for (const relativePath of referenceSources) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const match of source.matchAll(/assets\/[A-Za-z0-9_.-]+/g)) assetReferences.add(match[0]);
}
const missingAssets = [...assetReferences].filter(reference => !fs.existsSync(path.join(root, 'public', reference)));
if (missingAssets.length) fail(`Missing referenced assets: ${missingAssets.join(', ')}`);
else console.log(`PASS: All ${assetReferences.size} referenced assets exist`);

if (!process.exitCode) {  console.log('\nRouteWise verification completed successfully.');
}
