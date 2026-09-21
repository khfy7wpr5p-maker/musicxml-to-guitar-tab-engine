'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const diagnostics = require('../src/app/polySourceNotationRuntimeDiagnostics');

test('source notation collector survives failure without leaking diagnostic state', () => {
  const failure = new Error('source notation callback failed');

  assert.throws(() => diagnostics.collectSourceNotationRuntimeIssues(() => {
    diagnostics.recordSourceNotationRuntimeIssues([{ code: 'DISCARDED_WITH_FAILURE' }]);
    throw failure;
  }), (error) => error === failure);

  const outer = diagnostics.collectSourceNotationRuntimeIssues(() => {
    diagnostics.recordSourceNotationRuntimeIssues([{ code: 'OUTER' }]);
    const inner = diagnostics.collectSourceNotationRuntimeIssues(() => {
      diagnostics.recordSourceNotationRuntimeIssues([{ code: 'INNER' }]);
      return 17;
    });
    assert.deepEqual(inner, {
      result: 17,
      issues: [{ code: 'INNER' }],
    });
    return 'done';
  });

  assert.equal(outer.result, 'done');
  assert.deepEqual(outer.issues, [{ code: 'OUTER' }]);
  assert.equal(Object.isFrozen(outer), true);
  assert.equal(Object.isFrozen(outer.issues), true);
});

test('source notation collector has no throw-from-finally path', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'polySourceNotationRuntimeDiagnostics.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /finally\s*\{[\s\S]*?throw\s+new\s+Error/);
});
