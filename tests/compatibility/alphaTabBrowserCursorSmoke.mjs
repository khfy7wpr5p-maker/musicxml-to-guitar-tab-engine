import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const {
  serializeCanonicalTabResultToMusicXml,
} = require('../../src/writers/canonicalTabMusicXmlWriter');
const {
  createCanonicalTabCompatibilityFixture,
} = require('../fixtures/compatibility/canonicalTabCompatibilityFixture');

const browserExecutable = process.env.BROWSER_EXECUTABLE;
assert.ok(browserExecutable && fs.existsSync(browserExecutable));

const alphaTabEntry = require.resolve('@coderline/alphatab');
const alphaTabDist = path.dirname(alphaTabEntry);
const alphaTabScript = path.basename(alphaTabEntry);
const screenshotPath = process.env.ALPHATAB_SCREENSHOT_PATH
  || path.join(repositoryRoot, 'alphatab-renderer-cursor.png');
const xml = serializeCanonicalTabResultToMusicXml(
  createCanonicalTabCompatibilityFixture(),
  { pretty: true, trailingNewline: true },
);

function assetPath(urlPath) {
  const relative = decodeURIComponent(urlPath.slice('/assets/'.length));
  const resolved = path.resolve(alphaTabDist, relative);
  return resolved === alphaTabDist || resolved.startsWith(`${alphaTabDist}${path.sep}`)
    ? resolved
    : null;
}

function assetType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.ttf') return 'font/ttf';
  if (extension === '.otf') return 'font/otf';
  return 'application/octet-stream';
}

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: white; }
  #alphaTab { width: 1280px; min-height: 300px; }
  .at-cursor-bar { background: rgba(255, 220, 0, .18); }
  .at-cursor-beat { background: rgba(0, 110, 255, .8); width: 3px; }
  .at-highlight * { fill: #d22; stroke: #d22; }
</style>
<div id="alphaTab"></div>
<script src="/assets/${alphaTabScript}"></script>
<script>
(() => {
  const state = window.__alphaTabSmoke = {
    done: false,
    error: null,
    loaded: false,
    rendered: false,
    midi: false,
    attached: 0,
    bars: [],
    beats: [],
    played: [],
    positions: [],
    summary: null
  };

  const fail = error => {
    state.error = error && error.stack ? error.stack : String(error);
    state.done = true;
  };
  const allBeats = staff => staff.bars.flatMap(bar =>
    bar.voices.flatMap(voice => voice.beats)
  );
  const musicalBeats = staff => allBeats(staff).filter(beat =>
    beat.notes.length > 0 || (beat.isRest && !beat.isEmpty)
  );

  const container = document.getElementById('alphaTab');
  const api = new alphaTab.AlphaTabApi(container, {
    core: {
      engine: 'svg',
      useWorkers: false,
      enableLazyLoading: false,
      includeNoteBounds: true,
      fontDirectory: '/assets/font/'
    },
    display: { barsPerRow: 2 },
    player: {
      enablePlayer: true,
      playerMode: alphaTab.PlayerMode.EnabledExternalMedia,
      enableCursor: true,
      enableElementHighlighting: true,
      enableAnimatedBeatCursor: false
    }
  });
  window.__alphaTabApi = api;

  const cursorHandler = {
    onAttach() { state.attached += 1; },
    onDetach() {},
    placeBarCursor(cursor, beatBounds) {
      const bounds = beatBounds.barBounds.masterBarBounds.visualBounds;
      cursor.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
      state.bars.push({ bar: beatBounds.beat.voice.bar.index, x: bounds.x, y: bounds.y });
    },
    placeBeatCursor(cursor, beatBounds, startX) {
      const bounds = beatBounds.barBounds.masterBarBounds.visualBounds;
      cursor.transitionToX(0, startX);
      cursor.setBounds(startX, bounds.y, 2, bounds.h);
      state.beats.push({
        bar: beatBounds.beat.voice.bar.index,
        beat: beatBounds.beat.index,
        x: startX,
        y: bounds.y
      });
    },
    transitionBeatCursor(cursor, beatBounds, startX, endX, duration) {
      cursor.transitionToX(duration, endX);
    }
  };
  api.customCursorHandler = cursorHandler;

  api.error.on(fail);
  api.scoreLoaded.on(() => { state.loaded = true; run(); });
  api.postRenderFinished.on(() => { state.rendered = true; run(); });
  api.midiLoaded.on(() => {
    state.midi = true;
    api.customCursorHandler = cursorHandler;
    run();
  });
  api.playedBeatChanged.on(beat => {
    if (beat) state.played.push({ bar: beat.voice.bar.index, beat: beat.index });
  });
  api.playerPositionChanged.on(args => state.positions.push(args.currentTick));

  let started = false;
  async function run() {
    if (started || !state.loaded || !state.rendered || !state.midi) return;
    started = true;
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const score = api.score;
      const track = score.tracks[0];
      const notation = track.staves[0];
      const tab = track.staves[1];
      const notationBeats = musicalBeats(notation);
      const tabBeats = musicalBeats(tab);
      const targets = [notationBeats[0], notationBeats[3], notationBeats[10]];

      for (const beat of targets) {
        api.tickPosition = beat.absolutePlaybackStart;
        await new Promise(resolve => setTimeout(resolve, 120));
      }

      const svgs = [...container.querySelectorAll('svg')];
      const lookup = api.boundsLookup || api.renderer.boundsLookup;
      const tabNotes = tab.bars.flatMap(bar =>
        bar.voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes))
      );
      const text = svgs.map(svg => svg.textContent || '').join(' ');
      state.summary = {
        tracks: score.tracks.length,
        staves: track.staves.length,
        measures: score.masterBars.length,
        svgCount: svgs.length,
        width: container.scrollWidth,
        height: container.scrollHeight,
        notationBounds: notationBeats.flatMap(beat => lookup.findBeats(beat)).length,
        tabBounds: tabBeats.flatMap(beat => lookup.findBeats(beat)).length,
        notationVisible: notation.showStandardNotation,
        tabVisible: tab.showTablature,
        tuning: [...tab.tuning],
        fret10Model: tabNotes.some(note => note.fret === 10),
        fret10Text: /(^|\\D)10(\\D|$)/.test(text),
        attached: state.attached,
        barPlacements: state.bars.length,
        beatPlacements: state.beats.length,
        cursorBars: [...new Set(state.beats.map(value => value.bar))],
        playedBeats: state.played.length,
        tickCache: Boolean(api.tickCache),
        playerMode: api.actualPlayerMode,
        firstTick: targets[0].absolutePlaybackStart,
        lastTick: targets[targets.length - 1].absolutePlaybackStart,
        defaultBarCursorCount: document.querySelectorAll('.at-cursor-bar').length,
        defaultBeatCursorCount: document.querySelectorAll('.at-cursor-beat').length
      };
      state.done = true;
    } catch (error) {
      fail(error);
    }
  }

  fetch('/score.musicxml')
    .then(response => response.arrayBuffer())
    .then(buffer => {
      if (!api.load(new Uint8Array(buffer))) {
        throw new Error('AlphaTabApi.load rejected MusicXML data.');
      }
    })
    .catch(fail);
})();
</script>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  if (url.pathname === '/score.musicxml') {
    response.writeHead(200, {
      'content-type': 'application/vnd.recordare.musicxml+xml; charset=utf-8',
    });
    response.end(xml);
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const filePath = assetPath(url.pathname);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      response.writeHead(200, { 'content-type': assetType(filePath) });
      fs.createReadStream(filePath).pipe(response);
      return;
    }
  }
  response.writeHead(404);
  response.end('Not found');
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
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));

  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await page.waitForFunction(() => window.__alphaTabSmoke?.done === true, {
    timeout: 30_000,
  });

  const result = await page.evaluate(() => window.__alphaTabSmoke);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const evidence = {
    browser: await browser.version(),
    screenshotPath,
    browserMessages: messages,
    ...result,
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);

  assert.equal(result.error, null, result.error || messages.join('\n'));
  assert.ok(result.summary);
  assert.equal(result.summary.tracks, 1);
  assert.equal(result.summary.staves, 2);
  assert.equal(result.summary.measures, 5);
  assert.ok(result.summary.svgCount > 0);
  assert.ok(result.summary.width > 0 && result.summary.height > 0);
  assert.ok(result.summary.notationBounds >= 14);
  assert.ok(result.summary.tabBounds >= 14);
  assert.equal(result.summary.notationVisible, true);
  assert.equal(result.summary.tabVisible, true);
  assert.deepEqual(result.summary.tuning, [64, 59, 55, 50, 45, 40]);
  assert.equal(result.summary.fret10Model, true);
  assert.equal(result.summary.fret10Text, true);
  assert.equal(result.summary.tickCache, true);
  assert.equal(result.summary.playerMode, 4);
  assert.ok(result.summary.attached > 0);
  assert.ok(result.summary.barPlacements >= 3);
  assert.ok(result.summary.beatPlacements >= 3);
  assert.ok(result.summary.cursorBars.length >= 2);
  assert.ok(result.summary.playedBeats >= 3);
  assert.ok(result.summary.lastTick > result.summary.firstTick);
  assert.ok(fs.statSync(screenshotPath).size > 0);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
