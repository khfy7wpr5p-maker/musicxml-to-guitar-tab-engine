'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const diagnostics = require('../src/app/polyFingeringRuntimeDiagnostics');

function exactConstraints(count = 1) {
  return Object.freeze({
    documentType: 'ExactGuitarFingeringConstraints',
    contractVersion: '1.0.0',
    authority: 'EXPLICIT_SOURCE_GUITAR_FINGERING_ONLY',
    constraintCount: count,
  });
}

test('fingering collector preserves issues, exact constraints, and nesting', () => {
  const constraints = exactConstraints();
  const outer = diagnostics.collectFingeringRuntimeIssues(() => {
    diagnostics.recordFingeringRuntimeIssues([{ code: 'OUTER' }]);
    diagnostics.recordExactGuitarFingeringConstraints(constraints);
    assert.equal(diagnostics.currentExactGuitarFingeringConstraints(), constraints);

    const inner = diagnostics.collectFingeringRuntimeIssues(() => {
      diagnostics.recordFingeringRuntimeIssues([{ code: 'INNER' }]);
      return 41;
    });
    assert.deepEqual(inner.issues, [{ code: 'INNER' }]);
    assert.equal(inner.exactFingeringConstraints, null);
    return 'done';
  });

  assert.equal(outer.result, 'done');
  assert.deepEqual(outer.issues, [{ code: 'OUTER' }]);
  assert.equal(outer.exactFingeringConstraints, constraints);
  assert.equal(diagnostics.currentExactGuitarFingeringConstraints(), null);
});

test('fingering collector cleans up after callback failure and rethrows the same error', () => {
  const failure = new Error('fingering callback failed');
  assert.throws(() => diagnostics.collectFingeringRuntimeIssues(() => {
    diagnostics.recordExactGuitarFingeringConstraints(exactConstraints());
    throw failure;
  }), (error) => error === failure);

  const recovered = diagnostics.collectFingeringRuntimeIssues(() => 'recovered');
  assert.equal(recovered.result, 'recovered');
  assert.equal(recovered.exactFingeringConstraints, null);
});

test('fingering collector has no throw-from-finally path', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'polyFingeringRuntimeDiagnostics.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /finally\s*\{[\s\S]*?throw\s+new\s+Error/);
});
