import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { browserCoverageToLcov } from './compatibility/browserCoverageLcov.mjs';

test('browser coverage LCOV keeps an unexecuted nested function line uncovered', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edtab-browser-coverage-'));
  const webRoot = path.join(root, 'web/guitar-tab-workbench');
  fs.mkdirSync(webRoot, {recursive: true});
  const source = [
    '(function () {',
    '  function used() { return 1; }',
    '  function unused() { return 2; }',
    '  used();',
    '}());',
  ].join('\n');
  fs.writeFileSync(path.join(webRoot, 'workbench.js'), source, 'utf8');

  const unusedStart = source.indexOf('function unused');
  const unusedEnd = source.indexOf('  used();');
  const lcov = browserCoverageToLcov([{
    url: 'http://127.0.0.1:1234/workbench/workbench.js',
    text: source,
    rawScriptCoverage: {
      functions: [
        {ranges: [{startOffset: 0, endOffset: source.length, count: 1}]},
        {ranges: [{startOffset: unusedStart, endOffset: unusedEnd, count: 0}]},
      ],
    },
  }], root);

  assert.match(lcov, /SF:web\/guitar-tab-workbench\/workbench\.js/);
  assert.match(lcov, /DA:2,1/);
  assert.match(lcov, /DA:3,0/);
  assert.match(lcov, /DA:4,1/);
});
