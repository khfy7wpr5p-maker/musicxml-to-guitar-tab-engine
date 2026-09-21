'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectSlurRuntimeIssues,
  recordSlurRuntimeIssues,
} = require('../src/app/polySlurRuntimeDiagnostics');

test('slur diagnostics preserve result and collected issues', () => {
  const issue = Object.freeze({ code: 'TEST_SLUR_ISSUE' });
  const collected = collectSlurRuntimeIssues(() => {
    recordSlurRuntimeIssues([issue]);
    return 'ok';
  });

  assert.equal(collected.result, 'ok');
  assert.deepEqual(collected.issues, [issue]);
  assert.equal(Object.isFrozen(collected), true);
  assert.equal(Object.isFrozen(collected.issues), true);
});

test('slur diagnostics clean up after callback failure and preserve the callback error', () => {
  const failure = new Error('callback failed');

  assert.throws(
    () => collectSlurRuntimeIssues(() => {
      recordSlurRuntimeIssues([{ code: 'BEFORE_FAILURE' }]);
      throw failure;
    }),
    (error) => error === failure,
  );

  const after = collectSlurRuntimeIssues(() => {
    recordSlurRuntimeIssues([{ code: 'AFTER_FAILURE' }]);
    return 'recovered';
  });

  assert.equal(after.result, 'recovered');
  assert.deepEqual(after.issues, [{ code: 'AFTER_FAILURE' }]);
});

test('slur diagnostics keep nested collectors isolated', () => {
  const outer = collectSlurRuntimeIssues(() => {
    recordSlurRuntimeIssues([{ code: 'OUTER_BEFORE' }]);
    const inner = collectSlurRuntimeIssues(() => {
      recordSlurRuntimeIssues([{ code: 'INNER' }]);
      return 'inner-result';
    });
    assert.equal(inner.result, 'inner-result');
    assert.deepEqual(inner.issues, [{ code: 'INNER' }]);
    recordSlurRuntimeIssues([{ code: 'OUTER_AFTER' }]);
    return 'outer-result';
  });

  assert.equal(outer.result, 'outer-result');
  assert.deepEqual(outer.issues, [
    { code: 'OUTER_BEFORE' },
    { code: 'OUTER_AFTER' },
  ]);
});

test('slur diagnostics do not throw from a finally block', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'polySlurRuntimeDiagnostics.js'),
    'utf8',
  );

  assert.doesNotMatch(source, /finally\s*\{[\s\S]*?throw\s+new\s+Error/);
});
