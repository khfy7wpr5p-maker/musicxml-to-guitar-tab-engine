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

  await page.evaluate(() => {
    window.__polyRenderFinishedCount = 0;
    window.__workbench.api.postRenderFinished.on(() => {
      window.__polyRenderFinishedCount += 1;
    });
  });

  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('[data-role="runtime-upload-action"]'),
  ]);
  await chooser.accept([fixturePath]);

  await page.waitForFunction(
    () => window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.status === 'PASS'
      && window.__workbench?.snapshot().runtimeResult?.route === 'POLY_V2'
      && window.__polyRenderFinishedCount > 0
      && (window.__workbench.api.boundsLookup || window.__workbench.api.renderer.boundsLookup)?.isFinished === true
      && (window.__workbench.api.boundsLookup || window.__workbench.api.renderer.boundsLookup)?.staffSystems?.length > 0
      && document.querySelectorAll('[data-role="score"] svg').length > 0,
    {timeout: 30000},
  );

  const clickTarget = await page.evaluate(async () => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes));
    const lookup = window.__workbench.api.boundsLookup || window.__workbench.api.renderer.boundsLookup;
    const surface = window.__workbench.api.canvasElement.element;
    const panel = surface.closest('.workbench-score-panel');
    panel.scrollLeft = 0;
    panel.scrollTop = 0;
    window.scrollTo({top: 0, left: 0});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const surfaceRect = surface.getBoundingClientRect();
    const diagnostics = [];
    for (const note of notes) {
      const noteBounds = (lookup.findBeats(note.beat) || [])
        .flatMap(bounds => Array.isArray(bounds.notes) ? bounds.notes : [])
        .find(bounds => bounds.note === note);
      if (!noteBounds) continue;
      const head = noteBounds.noteHeadBounds;
      const relativeX = head.x + (head.w / 2);
      const relativeY = head.y + (head.h / 2);
      const x = surfaceRect.left + relativeX;
      const y = surfaceRect.top + relativeY;
      const elementAtPoint = document.elementFromPoint(x, y);
      const beatAtPoint = lookup.getBeatAtPos(relativeX, relativeY);
      const noteAtPoint = beatAtPoint ? lookup.getNoteAtPos(beatAtPoint, relativeX, relativeY) : null;
      diagnostics.push({
        midi: note.realValue,
        x,
        y,
        relativeX,
        relativeY,
        noteHeadBounds: {
          x: head.x,
          y: head.y,
          w: head.w,
          h: head.h,
        },
        beatRealBounds: {
          x: noteBounds.beatBounds.realBounds.x,
          y: noteBounds.beatBounds.realBounds.y,
          w: noteBounds.beatBounds.realBounds.w,
          h: noteBounds.beatBounds.realBounds.h,
        },
        barRealBounds: {
          x: noteBounds.beatBounds.barBounds.realBounds.x,
          y: noteBounds.beatBounds.barBounds.realBounds.y,
          w: noteBounds.beatBounds.barBounds.realBounds.w,
          h: noteBounds.beatBounds.barBounds.realBounds.h,
        },
        systemRealBounds: {
          x: noteBounds.beatBounds.barBounds.masterBarBounds.staffSystemBounds.realBounds.x,
          y: noteBounds.beatBounds.barBounds.masterBarBounds.staffSystemBounds.realBounds.y,
          w: noteBounds.beatBounds.barBounds.masterBarBounds.staffSystemBounds.realBounds.w,
          h: noteBounds.beatBounds.barBounds.masterBarBounds.staffSystemBounds.realBounds.h,
        },
        element: elementAtPoint?.tagName || null,
        insideSurface: Boolean(elementAtPoint && surface.contains(elementAtPoint)),
        hitMidi: noteAtPoint?.realValue ?? null,
        exactHit: noteAtPoint === note,
      });
      if (!elementAtPoint || !surface.contains(elementAtPoint)) continue;
      return {
        x,
        y,
        midi: note.realValue,
        renderedElement: elementAtPoint.tagName,
        alphaTabExactHit: noteAtPoint === note,
        voiceOrdinal: notation.bars[0].voices.indexOf(note.beat.voice),
        playbackStart: note.beat.absolutePlaybackStart,
      };
    }
    throw new Error(`alphaTab did not expose an unobscured, physically clickable notation note: ${JSON.stringify({
      surface: {
        left: surfaceRect.left,
        top: surfaceRect.top,
        width: surfaceRect.width,
        height: surfaceRect.height,
      },
      diagnostics,
      staffSystems: lookup.staffSystems.map(system => ({
        x: system.realBounds.x,
        y: system.realBounds.y,
        w: system.realBounds.w,
        h: system.realBounds.h,
      })),
    })}`);
  });

  assert.ok(clickTarget.x >= 0 && clickTarget.x <= 1440, 'Rendered note must be horizontally visible.');
  assert.ok(clickTarget.y >= 0 && clickTarget.y <= 1000, 'Rendered note must be vertically visible.');
  assert.equal(clickTarget.renderedElement, 'text');
  const expectedByRendererIdentity = {
    '0:0:52': {
      sourceEventId: 'P1:measure:0:note:0',
      sourceGroupId: 'P1:measure:0:simultaneous:0',
      sourceGroupEventIds: ['P1:measure:0:note:0', 'P1:measure:0:note:1', 'P1:measure:0:note:5'],
      written: 'E3',
    },
    '0:0:55': {
      sourceEventId: 'P1:measure:0:note:1',
      sourceGroupId: 'P1:measure:0:simultaneous:0',
      sourceGroupEventIds: ['P1:measure:0:note:0', 'P1:measure:0:note:1', 'P1:measure:0:note:5'],
      written: 'G3',
    },
    '0:960:54': {
      sourceEventId: 'P1:measure:0:note:2',
      sourceGroupId: null,
      sourceGroupEventIds: ['P1:measure:0:note:2'],
      written: 'F#3',
    },
    '0:2880:57': {
      sourceEventId: 'P1:measure:0:note:4',
      sourceGroupId: 'P1:measure:0:simultaneous:12',
      sourceGroupEventIds: ['P1:measure:0:note:4', 'P1:measure:0:note:7'],
      written: 'A3',
    },
    '1:0:48': {
      sourceEventId: 'P1:measure:0:note:5',
      sourceGroupId: 'P1:measure:0:simultaneous:0',
      sourceGroupEventIds: ['P1:measure:0:note:0', 'P1:measure:0:note:1', 'P1:measure:0:note:5'],
      written: 'C3',
    },
    '1:1920:52': {
      sourceEventId: 'P1:measure:0:note:6',
      sourceGroupId: null,
      sourceGroupEventIds: ['P1:measure:0:note:6'],
      written: 'E3',
    },
    '1:2880:53': {
      sourceEventId: 'P1:measure:0:note:7',
      sourceGroupId: 'P1:measure:0:simultaneous:12',
      sourceGroupEventIds: ['P1:measure:0:note:4', 'P1:measure:0:note:7'],
      written: 'F3',
    },
  };
  const rendererIdentity = `${clickTarget.voiceOrdinal}:${clickTarget.playbackStart}:${clickTarget.midi}`;
  const expectedSelection = expectedByRendererIdentity[rendererIdentity];
  assert.ok(expectedSelection, `Unexpected alphaTab renderer identity: ${rendererIdentity}`);
  await page.mouse.click(clickTarget.x, clickTarget.y);
  await page.waitForFunction(
    expected => window.__workbench?.snapshot().selectedEvent?.sourceEventId === expected.sourceEventId
      && document.querySelector('[data-role="selected-note"]')?.textContent.includes(expected.written),
    {timeout: 10000},
    expectedSelection,
  );

  const mapped = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    selectedNoteText: document.querySelector('[data-role="selected-note"]')?.textContent,
    fingeringPitchText: document.querySelector('[data-role="fingering-pitch"]')?.textContent,
  }));

  assert.equal(mapped.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(mapped.snapshot.selectedEvent.sourceEventId, expectedSelection.sourceEventId);
  assert.equal(mapped.snapshot.selectedEvent.sourceGroupId, expectedSelection.sourceGroupId);
  assert.deepEqual(mapped.snapshot.selectedEvent.sourceGroupEventIds, expectedSelection.sourceGroupEventIds);
  assert.ok(mapped.selectedNoteText.includes(expectedSelection.written));
  assert.equal(mapped.fingeringPitchText, expectedSelection.written);
  assert.equal(mapped.snapshot.applyEditDisabled, false);

  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    expected => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.route === 'POLY_V2'
      && window.__workbench?.snapshot().selectedEvent?.sourceEventId === expected.sourceEventId
      && window.__workbench?.snapshot().selectedEvent?.pitch?.written === expected.written,
    {timeout: 30000},
    expectedSelection,
  );

  const edited = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    svgCount: document.querySelectorAll('[data-role="score"] svg').length,
    issueText: document.querySelector('[data-role="issues"]').textContent,
  }));

  assert.equal(edited.snapshot.runtimeResult.status, 'PASS');
  assert.equal(edited.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(edited.snapshot.revisionNumber, 1);
  assert.equal(edited.snapshot.selectedEvent.pitch.written, expectedSelection.written);
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
