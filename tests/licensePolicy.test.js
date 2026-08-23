const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const required = [
  'LICENSE', 'COMMERCIAL-LICENSE.md', 'LICENSE-SCOPE.md', 'MODEL-LICENSE.md',
  'DATASET-LICENSES.md', 'NOTICE', 'TRADEMARKS.md',
  'CONTRIBUTOR-LICENSE-AGREEMENT.md', 'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md', 'third_party/dependency-licenses.json'
];

test('licensing package is complete and internally consistent', () => {
  for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.match(read('LICENSE'), /PolyForm Noncommercial License 1\.0\.0/);
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
  assert.equal(lock.packages[''].license, 'SEE LICENSE IN LICENSE');
  assert.match(read('README.md'), /Commercial use requires a separate signed agreement/);
});

test('locked production dependencies have declared license records', () => {
  const lock = JSON.parse(read('package-lock.json'));
  const inventory = JSON.parse(read('third_party/dependency-licenses.json'));
  const records = new Map(inventory.components.map((item) => [`${item.name}@${item.version}`, item]));
  const productionPackages = Object.entries(lock.packages)
    .filter(([packagePath, metadata]) => packagePath && metadata.dev !== true)
    .map(([packagePath, metadata]) => ({
      name: packagePath.split('node_modules/').at(-1),
      version: metadata.version
    }));

  assert.ok(productionPackages.length > 0);
  for (const dependency of productionPackages) {
    assert.ok(
      records.has(`${dependency.name}@${dependency.version}`),
      `missing license inventory record for ${dependency.name}@${dependency.version}`
    );
  }
});

test('model and dataset boundaries remain explicit', () => {
  const model = read('MODEL-LICENSE.md');
  assert.match(model, /7a56436c27ee6d996a49e7f989d37d7ffff187232277095b176c3c395c432314/);
  assert.match(model, /fret20QualityAuthority=false/);
  assert.match(model, /runtime connection is not authorized/);
  assert.match(read('DATASET-LICENSES.md'), /10\.5281\/zenodo\.3371780/);
});

test('active licensing declarations no longer claim UNLICENSED', () => {
  for (const file of ['package.json', 'package-lock.json', 'README.md', 'AI_CONTEXT.md',
    'docs/package-status.md', 'docs/current-status.md', 'docs/ARCHITECTURE.md',
    'docs/polyphonic-guitar-arrangement-foundation.md']) {
    assert.doesNotMatch(read(file), /UNLICENSED/);
  }
});
