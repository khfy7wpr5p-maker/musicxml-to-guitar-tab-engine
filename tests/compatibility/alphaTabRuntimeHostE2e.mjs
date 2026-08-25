import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
function createLongMusicXml() {
  const pitches = ['C', 'D', 'E', 'G', 'A', 'F', 'E', 'D'];
  const measures = [];
  for (let measure = 1; measure <= 16; measure += 1) {
    const attributes = measure === 1
      ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>'
      : '';
    const notes = Array.from({length: 4}, (_, index) => {
      const step = pitches[(measure + index - 1) % pitches.length];
      return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
    }).join('');
    measures.push(`<measure number="${measure}">${attributes}${notes}</measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}

const fixturePath = path.join(os.tmpdir(), `runtime-host-long-score-${process.pid}.musicxml`);
fs.writeFileSync(fixturePath, createLongMusicXml(), 'utf8');
const screenshotPath = process.env.ALPHATAB_RUNTIME_HOST_SCREENSHOT_PATH
  || path.resolve(repositoryRoot, 'alphatab-runtime-host-e2e.png');

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
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
  ],
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

  const initial = await page.evaluate(() => ({
    mode: window.__workbenchHost.mode,
    uploadHidden: document.querySelector('[data-role="runtime-upload-action"]').hidden,
    badge: document.querySelector('[data-role="mode-badge"]').textContent,
  }));
  assert.equal(initial.mode, 'runtime');
  assert.equal(initial.uploadHidden, false);
  assert.equal(initial.badge, 'RUNTIME');

  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('[data-role="runtime-upload-action"]'),
  ]);
  await chooser.accept([fixturePath]);

  await page.waitForFunction(
    () => window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.status === 'PASS'
      && document.querySelectorAll('[data-role="score"] svg').length > 0,
    {timeout: 30000},
  );

  const loaded = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const track = window.__workbench.api.score.tracks[0];
    const panel = document.querySelector('.workbench-score-panel');
    const score = document.querySelector('[data-role="score"]');
    return {
      snapshot,
      notationVisible: track.staves[0].showStandardNotation,
      tabVisible: track.staves[1].showTablature,
      svgCount: score.querySelectorAll('svg').length,
      panelClientHeight: panel.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      scoreScrollHeight: score.scrollHeight,
    };
  });

  assert.equal(loaded.snapshot.runtimeResult.route, 'MONO_V1');
  assert.equal(loaded.snapshot.scoreMeasures, 16);
  assert.equal(loaded.notationVisible, true);
  assert.equal(loaded.tabVisible, true);
  assert.ok(loaded.svgCount > 0);
  assert.ok(loaded.scoreScrollHeight > 0);
  assert.deepEqual(apiRequests.filter(item => item === 'POST /api/upload'), ['POST /api/upload']);

  const selected = await page.evaluate(() => {
    const note = window.__workbench.api.score.tracks[0].staves[0].bars[0].voices[0].beats[1].notes[0];
    return window.__workbench.selectNote(note);
  });
  assert.equal(selected, true);

  await page.select('[data-role="edit-step"]', 'G');
  await page.select('[data-role="edit-alter"]', '0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().selectedEvent?.pitch?.written === 'G4',
    {timeout: 30000},
  );

  const edited = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    return {
      snapshot,
      svgCount: document.querySelectorAll('[data-role="score"] svg').length,
      issueText: document.querySelector('[data-role="issues"]').textContent,
    };
  });
  assert.equal(edited.snapshot.runtimeResult.status, 'PASS');
  assert.equal(edited.snapshot.runtimeResult.route, 'MONO_V1');
  assert.equal(edited.snapshot.revisionNumber, 1);
  assert.equal(edited.snapshot.selectedEvent.pitch.written, 'G4');
  assert.ok(edited.svgCount > 0);
  assert.match(edited.issueText, /No blocking issues/);
  assert.equal(apiRequests.filter(item => item === 'POST /api/edit').length, 1);

  await page.click('[data-role="fit-width"]');
  await page.screenshot({path: screenshotPath, fullPage: true});

  process.stdout.write(`${JSON.stringify({
    browser: await browser.version(),
    route: edited.snapshot.runtimeResult.route,
    measures: edited.snapshot.scoreMeasures,
    revisionNumber: edited.snapshot.revisionNumber,
    apiRequests,
    layout: {
      panelClientHeight: loaded.panelClientHeight,
      panelScrollHeight: loaded.panelScrollHeight,
      scoreScrollHeight: loaded.scoreScrollHeight,
    },
    browserMessages: messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(fixturePath, {force: true});
}
