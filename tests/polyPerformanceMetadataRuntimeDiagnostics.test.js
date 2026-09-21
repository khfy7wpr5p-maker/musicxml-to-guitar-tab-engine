'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const diagnostics = require('../src/app/polyPerformanceMetadataRuntimeDiagnostics');

test('performance metadata collector cleans up failure and isolates nesting', () => {
  const failure = new Error('performance callback failed');
  assert.throws(() => diagnostics.collectPerformanceMetadataRuntimeIssues(() => {
    diagnostics.recordPerformanceMetadataRuntimeIssues([{ code: 'FAILED_PASS' }]);
    throw failure;
  }), (error) => error === failure);

  const outer = diagnostics.collectPerformanceMetadataRuntimeIssues(() => {
    diagnostics.recordPerformanceMetadataRuntimeIssues([{ code: 'OUTER' }]);
    const inner = diagnostics.collectPerformanceMetadataRuntimeIssues(() => {
      diagnostics.recordPerformanceMetadataRuntimeIssues([{ code: 'INNER' }]);
      return 23;
    });
    assert.deepEqual(inner, { result: 23, issues: [{ code: 'INNER' }] });
    return 'done';
  });

  assert.equal(outer.result, 'done');
  assert.deepEqual(outer.issues, [{ code: 'OUTER' }]);
  assert.equal(Object.isFrozen(outer), true);
  assert.equal(Object.isFrozen(outer.issues), true);
});

test('performance metadata collector has no throw-from-finally path', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'polyPerformanceMetadataRuntimeDiagnostics.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /finally\s*\{[\s\S]*?throw\s+new\s+Error/);
});
