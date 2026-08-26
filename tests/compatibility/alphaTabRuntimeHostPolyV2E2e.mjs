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
const fixturePath = path.join(repositoryRoot, 'tests/fixtures/runtime-realworld-guitar-poly.musicxml');
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

  const clickTarget = await page.evaluate(async () => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes));
    const note = notes.find(candidate => candidate.realValue === 52);
    if (!note) throw new Error('The first sounding E3 note was not imported by alphaTab.');

    const lookup = window.__workbench.api.boundsLookup || window.__workbench.api.renderer.boundsLookup;
    const beatBounds = lookup.findBeats(note.beat) || [];
    const noteBounds = beatBounds
      .flatMap(bounds => Array.isArray(bounds.notes) ? bounds.notes : [])
      .find(bounds => bounds.note === note);
    if (!noteBounds) throw new Error('alphaTab did not expose clickable geometry for sounding E3.');

    const surface = window.__workbench.api.canvasElement.element;
    const panel = surface.closest('.workbench-score-panel');
    const head = noteBounds.noteHeadBounds;
    panel.scrollLeft = Math.max(0, head.x + (head.w / 2) - (panel.clientWidth / 2));
    panel.scrollTop = Math.max(0, head.y + (head.h / 2) - (panel.clientHeight / 2));
    window.scrollTo({top: 0, left: 0});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const surfaceRect = surface.getBoundingClientRect();
    const x = surfaceRect.left + head.x + (head.w / 2);
    const y = surfaceRect.top + head.y + (head.h / 2);
    const elementAtPoint = document.elementFromPoint(x, y);
    if (!elementAtPoint || !surface.contains(elementAtPoint)) {
      throw new Error('The alphaTab note-head coordinate is obscured in the browser viewport.');
    }
    const beatAtPoint = lookup.getBeatAtPos(x - surfaceRect.left, y - surfaceRect.top);
    const noteAtPoint = beatAtPoint
      ? lookup.getNoteAtPos(beatAtPoint, x - surfaceRect.left, y - surfaceRect.top)
      : null;
    if (noteAtPoint !== note) {
      throw new Error('The physical click coordinate does not resolve to the intended alphaTab note.');
    }
    return {
      x,
      y,
    };
  });

  assert.ok(clickTarget.x >= 0 && clickTarget.x <= 1440, 'Rendered note must be horizontally visible.');
  assert.ok(clickTarget.y >= 0 && clickTarget.y <= 1000, 'Rendered note must be vertically visible.');
  await page.mouse.click(clickTarget.x, clickTarget.y);
  await page.waitForFunction(
    () => window.__workbench?.snapshot().selectedEvent?.sourceEventId === 'P1:measure:0:note:0'
      && document.querySelector('[data-role="selected-note"]')?.textContent.includes('E3'),
    {timeout: 10000},
  );

  const mapped = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    selectedNoteText: document.querySelector('[data-role="selected-note"]')?.textContent,
    fingeringPitchText: document.querySelector('[data-role="fingering-pitch"]')?.textContent,
  }));

  assert.equal(mapped.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(mapped.snapshot.selectedEvent.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(mapped.snapshot.selectedEvent.sourceGroupId, 'P1:measure:0:simultaneous:0');
  assert.deepEqual(
    mapped.snapshot.selectedEvent.sourceGroupEventIds,
    ['P1:measure:0:note:0', 'P1:measure:0:note:1', 'P1:measure:0:note:5'],
  );
  assert.match(mapped.selectedNoteText, /E3/);
  assert.equal(mapped.fingeringPitchText, 'E3');
  assert.equal(mapped.snapshot.applyEditDisabled, false);

  await page.select('[data-role="edit-step"]', 'E');
  await page.select('[data-role="edit-alter"]', '0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '3'; });
  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.route === 'POLY_V2'
      && window.__workbench?.snapshot().selectedEvent?.pitch?.written === 'E3',
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
  assert.equal(edited.snapshot.selectedEvent.pitch.written, 'E3');
  assert.ok(edited.svgCount > 0);
  assert.match(edited.issueText, /RUNTIME_GUITAR_NOTATION_NORMALIZED/);
  assert.deepEqual(apiRequests.filter(item => item === 'POST /api/upload'), ['POST /api/upload']);
  assert.equal(apiRequests.filter(item => item === 'POST /api/edit/poly-v2').length, 1);
  assert.equal(apiRequests.filter(item => item === 'POST /api/edit').length, 0);

  await page.screenshot({path: screenshotPath, fullPage: true});

  process.stdout.write(`${JSON.stringify({
    browser: await browser.version(),
    route: edited.snapshot.runtimeResult.route,
    revisionNumber: edited.snapshot.revisionNumber,
    sourceEventId: edited.snapshot.selectedEvent.sourceEventId,
    sourceGroupId: edited.snapshot.selectedEvent.sourceGroupId,
    pointerClick: clickTarget,
    apiRequests,
    browserMessages: messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
