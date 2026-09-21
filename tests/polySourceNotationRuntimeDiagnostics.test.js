'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectSourceNotationRuntimeIssues,
  recordSourceNotationRuntimeIssues,
} = require('../src/app/polySourceNotationRuntimeDiagnostics');

test('source notation diagnostics preserve result and collected issues', () => {
  const issue = Object.freeze({ code: 'TEST_SOURCE_NOTATION_ISSUE' });
  const collected = collectSourceNotationRuntimeIssues(() => {
    recordSourceNotationRuntimeIssues([issue]);
    return 'ok';
  });

  assert.equal(collected.result, 'ok');
  assert.deepEqual(collected.issues, [issue]);
  assert.equal(Object.isFrozen(collected), true);
  assert.equal(Object.isFrozen(collected.issues), true);
});

test('source notation diagnostics clean up after callback failure', () => {
  const failure = new Error('callback failed');
  assert.throws(
    () => collectSourceNotationRuntimeIssues(() => {
      recordSourceNotationRuntimeIssues([{ code: 'BEFORE_FAILURE' }]);
      throw failure;
    }),
    (error) => error === failure,
  );

  const after = collectSourceNotationRuntimeIssues(() => {
    recordSourceNotationRuntimeIssues([{ code: 'AFTER_FAILURE' }]);
    return 'recovered';
  });
  assert.equal(after.result, 'recovered');
  assert.deepEqual(after.issues, [{ code: 'AFTER_FAILURE' }]);
});

test('source notation diagnostics keep nested collectors isolated', () => {
  const outer = collectSourceNotationRuntimeIssues(() => {
    recordSourceNotationRuntimeIssues([{ code: 'OUTER_BEFORE' }]);
    const inner = collectSourceNotationRuntimeIssues(() => {
      recordSourceNotationRuntimeIssues([{ code: 'INNER' }]);
      return 'inner';
    });
    assert.deepEqual(inner.issues, [{ code: 'INNER' }]);
    recordSourceNotationRuntimeIssues([{ code: 'OUTER_AFTER' }]);
    return 'outer';
  });

  assert.equal(outer.result, 'outer');
  assert.deepEqual(outer.issues, [{ code: 'OUTER_BEFORE' }, { code: 'OUTER_AFTER' }]);
});

test('source notation diagnostics do not throw from a finally block', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'polySourceNotationRuntimeDiagnostics.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /finally\s*\{[\s\S]*?throw\s+new\s+Error/);
});
