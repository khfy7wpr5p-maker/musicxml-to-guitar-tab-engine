import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const { createRuntimeHttpServer } = require('../../src/app/runtimeHttpHost');

const browserExecutable = process.env.BROWSER_EXECUTABLE;
assert.ok(browserExecutable && fs.existsSync(browserExecutable));

const alphaTabEntry = require.resolve('@coderline/alphatab');
const alphaTabDist = path.dirname(alphaTabEntry);
const fixturePath = path.join(repositoryRoot, 'tests/fixtures/pa12-polyphonic-e2e.musicxml');
const screenshotPath = process.env.ALPHATAB_RUNTIME_HOST_POLY_SCREENSHOT_PATH
  || path.resolve(repositoryRoot, 'alphatab-runtime-host-poly-v2-e2e.png');

const server = createRuntimeHttpServer({
  repositoryRoot,
  alphaTabEntry,
  alphaTabDist,
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert.ok(address && typeof address === 'object');

const browser = await puppeteer.launch({
  executablePath: browserExecutable,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 1000, deviceScaleFactor: 1});
  const messages = [];
  const apiRequests = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(`${request.method()} ${url.pathname}`);
  });

  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(`${origin}/workbench/`, {waitUntil: 'networkidle0', timeout: 30000});
  await page.waitForFunction(() => Boolean(window.__workbenchHost && window.__workbench), {timeout: 10000});

  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('[data-role="runtime-upload-action"]'),
  ]);
  await chooser.accept([fixturePath]);

  await page.waitForFunction(
    () => window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.status === 'PASS'
      && window.__workbench?.snapshot().runtimeResult?.route === 'POLY_V2'
      && document.querySelectorAll('[data-role="score"] svg').length > 0,
    {timeout: 30000},
  );

  const mapped = await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes));
    const note = notes.find(candidate => candidate.realValue === 60);
    const accepted = window.__workbench.selectNote(note);
    return {accepted, snapshot: window.__workbench.snapshot()};
  });

  assert.equal(mapped.accepted, true);
  assert.equal(mapped.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(mapped.snapshot.selectedEvent.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(mapped.snapshot.selectedEvent.sourceGroupId, 'P1:measure:0:simultaneous:0');
  assert.deepEqual(
    mapped.snapshot.selectedEvent.sourceGroupEventIds,
    ['P1:measure:0:note:0', 'P1:measure:0:note:4'],
  );
  assert.equal(mapped.snapshot.applyEditDisabled, false);

  await page.select('[data-role="edit-step"]', 'E');
  await page.select('[data-role="edit-alter"]', '0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.route === 'POLY_V2'
      && window.__workbench?.snapshot().selectedEvent?.pitch?.written === 'E4',
    {timeout: 30000},
  );

  const edited = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    svgCount: document.querySelectorAll('[data-role="score"] svg').length,
    issueText: document.querySelector('[data-role="issues"]').textContent,
  }));

  assert.equal(edited.snapshot.runtimeResult.status, 'PASS');
  assert.equal(edited.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(edited.snapshot.revisionNumber, 1);
  assert.equal(edited.snapshot.selectedEvent.pitch.written, 'E4');
  assert.ok(edited.svgCount > 0);
  assert.match(edited.issueText, /No blocking issues/);
  assert.deepEqual(apiRequests.filter(item => item === 'POST /api/upload'), ['POST /api/upload']);
  assert.equal(apiRequests.filter(item => item === 'POST /api/edit/poly-v2').length, 1);
  assert.equal(apiRequests.filter(item => item === 'POST /api/edit').length, 0);

  await page.screenshot({path: screenshotPath, fullPage: true});

  process.stdout.write(`${JSON.stringify({
    browser: await browser.version(),
    route: edited.snapshot.runtimeResult.route,
    revisionNumber: edited.snapshot.runtimeResult.revisionNumber,
    sourceEventId: edited.snapshot.selectedEvent.sourceEventId,
    sourceGroupId: edited.snapshot.selectedEvent.sourceGroupId,
    apiRequests,
    browserMessages: messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

// Verification-branch-only export: reuse the existing artifact path to carry the
// exact CI checkout plus installed dependencies back to the local corpus runner.
// This branch is never merged; production runtime sources remain identical to main.
if (process.env.GITHUB_ACTIONS === 'true' && process.env.ALPHATAB_RUNTIME_HOST_POLY_SCREENSHOT_PATH) {
  const { execFileSync } = await import('node:child_process');
  execFileSync(
    'tar',
    ['-czf', process.env.ALPHATAB_RUNTIME_HOST_POLY_SCREENSHOT_PATH, '--exclude=.git', '.'],
    { cwd: repositoryRoot, stdio: 'ignore' },
  );
}
