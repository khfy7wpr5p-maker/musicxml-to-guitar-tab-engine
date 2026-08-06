'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CANONICAL_TAB_RESULT_VERSION } = require('../src/contracts/canonicalTabContractMetadata');

function collectLocalRefs(value, refs = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectLocalRefs(entry, refs));
    return refs;
  }
  if (!value || typeof value !== 'object') return refs;
  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref') refs.push(nested);
    collectLocalRefs(nested, refs);
  }
  return refs;
}

function resolveLocalRef(schema, ref) {
  assert.match(ref, /^#\//);
  return ref.slice(2).split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((value, part) => value && value[part], schema);
}

test('declares a complete Draft 2020-12 cost contract with resolvable refs', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'schemas', 'canonical-tab-result.v1.schema.json'),
    'utf8',
  ));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.title, 'CanonicalTabResult 1.0.0');
  assert.equal(schema.properties.schemaVersion.const, CANONICAL_TAB_RESULT_VERSION);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.positionCost.additionalProperties, false);
  assert.equal(schema.$defs.transitionCost.additionalProperties, false);
  assert.deepEqual(schema.$defs.noteEvent.properties.fingeringCost.oneOf, [
    { $ref: '#/$defs/positionCost' },
    { $ref: '#/$defs/transitionCost' },
  ]);
  assert.equal(schema.$defs.positionCost.properties.breakdown.$ref, '#/$defs/positionCostBreakdown');
  assert.equal(schema.$defs.transitionCost.properties.breakdown.$ref, '#/$defs/transitionCostBreakdown');
  assert.equal(schema.$defs.beam.properties.level.maximum, undefined);
  assert.deepEqual(schema.$defs.tuning.properties.pitch.type, ['string', 'null']);

  for (const ref of collectLocalRefs(schema)) {
    assert.notEqual(resolveLocalRef(schema, ref), undefined, `Missing schema ref: ${ref}`);
  }
});

test('validator loads without candidate generator or optimizer imports', () => {
  const script = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request.includes('candidateLayerBuilder') || request.includes('fingeringOptimizer')) {
        throw new Error('forbidden dependency: ' + request);
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    require('./src/contracts/canonicalTabResultContract');
  `;
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
});
