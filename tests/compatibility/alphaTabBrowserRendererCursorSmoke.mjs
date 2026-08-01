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
assert.ok(browserExecutable, 'BROWSER_EXECUTABLE must identify a preinstalled Chrome or Chromium binary.');
assert.ok(fs.existsSync(browserExecutable), `Browser executable does not exist: ${browserExecutable}`);

const alphaTabEntry = require.resolve('@coderline/alphatab');
const alphaTabDist = path.dirname(alphaTabEntry);
const alphaTabScriptName = path.basename(alphaTabEntry);
const screenshotPath = process.env.ALPHATAB_SCREENSHOT_PATH
  || path.join(repositoryRoot, 'alphatab-renderer-cursor.png');
const musicXml = serializeCanonicalTabResultToMusicXml(
  createCanonicalTabCompatibilityFixture(),
  { pretty: true, trailingNewline: true },
);

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.sf2':
      return 'audio/sf2';
    default:
      return 'application/octet-stream';
  }
}

function safeAssetPath(requestPath) {
  const relative = decodeURIComponent(requestPath.replace(/^\/assets\//, ''));
  const resolved = path.resolve(alphaTabDist, relative);
  const prefix = `${alphaTabDist}${path.sep}`;
  if (resolved !== alphaTabDist && !resolved.startsWith(prefix)) {
    return null;
  }
  return resolved;
}

function htmlDocument() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>alphaTab MusicXML renderer and cursor smoke test</title>
  <style>
    html, body { margin: 0; padding: 0; background: white; color: black; }
    #alphaTab { width: 1280px; min-height: 300px; }
    .at-cursor-bar { background: rgba(255, 220, 0, 0.18); }
    .at-cursor-beat { background: rgba(0, 110, 255, 0.8); width: 3px; }
    .at-highlight * { fill: #d22; stroke: #d22; }
  </style>
</head>
<body>
  <div id="alphaTab"></div>
  <script src="/assets/${alphaTabScriptName}"></script>
  <script>
    (() => {
      const state = window.__alphaTabSmoke = {
        done: false,
        failure: null,
        scoreLoaded: false,
        rendered: false,
        midiLoaded: false,
        cursorAttached: 0,
        barPlacements: [],
        beatPlacements: [],
        transitions: [],
        playedBeatIds: [],
        positionTicks: [],
        summary: null
      };

      function fail(error) {
        state.failure = error && error.stack ? error.stack : String(error);
        state.done = true;
      }

      function allBeats(staff) {
        return staff.bars.flatMap(bar => bar.voices.flatMap(voice => voice.beats));
      }

      function musicalBeats(staff) {
        return allBeats(staff).filter(beat =>
          beat.notes.length > 0 || (beat.isRest && !beat.isEmpty)
        );
      }

      function beatIdentity(beat) {
        return {
          id: beat.id,
          barIndex: beat.voice.bar.index,
          beatIndex: beat.index,
          absolutePlaybackStart: beat.absolutePlaybackStart
        };
      }

      const container = document.getElementById('alphaTab');
      const api = new alphaTab.AlphaTabApi(container, {
        core: {
          engine: 'svg',
          useWorkers: false,
          enableLazyLoading: false,
          includeNoteBounds: true,
          fontDirectory: '/assets/font/'
        },
        display: {
          barsPerRow: 2
        },
        player: {
          playerMode: alphaTab.PlayerMode.EnabledExternalMedia,
          enableCursor: true,
          enableElementHighlighting: true,
          enableAnimatedBeatCursor: false
        }
      });

      window.__alphaTabApi = api;
      api.customCursorHandler = {
        onAttach() {
          state.cursorAttached += 1;
        },
        onDetach() {},
        placeBarCursor(barCursor, beatBounds) {
          const bounds = beatBounds.barBounds.masterBarBounds.visualBounds;
          barCursor.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
          state.barPlacements.push({
            x: bounds.x,
            y: bounds.y,
            width: bounds.w,
            height: bounds.h,
            barIndex: beatBounds.beat.voice.bar.index
          });
        },
        placeBeatCursor(beatCursor, beatBounds, startBeatX) {
          const bounds = beatBounds.barBounds.masterBarBounds.visualBounds;
          beatCursor.transitionToX(0, startBeatX);
          beatCursor.setBounds(startBeatX, bounds.y, 2, bounds.h);
          state.beatPlacements.push({
            x: startBeatX,
            y: bounds.y,
            height: bounds.h,
            barIndex: beatBounds.beat.voice.bar.index,
            beatIndex: beatBounds.beat.index
          });
        },
        transitionBeatCursor(beatCursor, beatBounds, startBeatX, endBeatX, duration) {
          beatCursor.transitionToX(duration, endBeatX);
          state.transitions.push({
            startBeatX,
            endBeatX,
            duration,
            barIndex: beatBounds.beat.voice.bar.index,
            beatIndex: beatBounds.beat.index
          });
        }
      };

      api.error.on(fail);
      api.scoreLoaded.on(() => {
        state.scoreLoaded = true;
        maybeExerciseCursor();
      });
      api.postRenderFinished.on(() => {
        state.rendered = true;
        maybeExerciseCursor();
      });
      api.midiLoaded.on(() => {
        state.midiLoaded = true;
        maybeExerciseCursor();
      });
      api.playedBeatChanged.on(beat => {
        if (beat) {
          state.playedBeatIds.push(beatIdentity(beat));
        }
      });
      api.playerPositionChanged.on(args => {
        state.positionTicks.push(args.currentTick);
      });

      let exercising = false;
      async function maybeExerciseCursor() {
        if (exercising || !state.scoreLoaded || !state.rendered || !state.midiLoaded) {
          return;
        }
        exercising = true;
        try {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const score = api.score;
          const track = score.tracks[0];
          const notationStaff = track.staves[0];
          const tablatureStaff = track.staves[1];
          const notationBeats = musicalBeats(notationStaff);
          const tablatureBeats = musicalBeats(tablatureStaff);
          const targetBeats = [notationBeats[0], notationBeats[3], notationBeats[10]];

          for (const beat of targetBeats) {
            api.tickPosition = beat.absolutePlaybackStart;
            await new Promise(resolve => setTimeout(resolve, 80));
          }

          const svgElements = [...container.querySelectorAll('svg')];
          const renderedText = svgElements.map(svg => svg.textContent || '').join(' ');
          const boundsLookup = api.boundsLookup || api.renderer.boundsLookup;
          const notationBounds = notationBeats.flatMap(beat => boundsLookup.findBeats(beat));
          const tablatureBounds = tablatureBeats.flatMap(beat => boundsLookup.findBeats(beat));
          const tablatureNotes = tablatureStaff.bars.flatMap(bar =>
            bar.voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes))
          );

          state.summary = {
            tracks: score.tracks.length,
            staves: track.staves.length,
            measures: score.masterBars.length,
            svgCount: svgElements.length,
            renderedWidth: container.scrollWidth,
            renderedHeight: container.scrollHeight,
            notationBeatBounds: notationBounds.length,
            tablatureBeatBounds: tablatureBounds.length,
            tuning: [...tablatureStaff.tuning],
            notationVisible: notationStaff.showStandardNotation,
            tablatureVisible: tablatureStaff.showTablature,
            doubleDigitFretInModel: tablatureNotes.some(note => note.fret === 10),
            doubleDigitFretTextVisible: /(^|\\D)10(\\D|$)/.test(renderedText),
            cursorAttached: state.cursorAttached,
            barPlacementCount: state.barPlacements.length,
            beatPlacementCount: state.beatPlacements.length,
            cursorBars: [...new Set(state.beatPlacements.map(item => item.barIndex))],
            playedBeatCount: state.playedBeatIds.length,
            tickCacheAvailable: Boolean(api.tickCache),
            actualPlayerMode: api.actualPlayerMode,
            firstTarget: beatIdentity(targetBeats[0]),
            lastTarget: beatIdentity(targetBeats[targetBeats.length - 1])
          };
          state.done = true;
        } catch (error) {
          fail(error);
        }
      }

      fetch('/score.musicxml')
        .then(response => {
          if (!response.ok) {
            throw new Error('Unable to fetch MusicXML fixture: ' + response.status);
          }
          return response.arrayBuffer();
        })
        .then(buffer => {
          if (!api.load(new Uint8Array(buffer))) {
            throw new Error('AlphaTabApi.load rejected the MusicXML byte array.');
          }
        })
        .catch(fail);
    })();
  </script>
</body>
</html>`;
}

const server = http.createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(htmlDocument());
      return;
    }
    if (requestUrl.pathname === '/score.musicxml') {
      response.writeHead(200, {
        'content-type': 'application/vnd.recordare.musicxml+xml; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(musicXml);
      return;
    }
    if (requestUrl.pathname.startsWith('/assets/')) {
      const filePath = safeAssetPath(requestUrl.pathname);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': contentType(filePath),
        'cache-control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(response);
      return;
    }
    response.writeHead(404);
    response.end('Not found');
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.stack : String(error));
  }
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

  const browserMessages = [];
  page.on('console', (message) => {
    browserMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    browserMessages.push(`pageerror: ${error.stack || error.message}`);
  });

  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => window.__alphaTabSmoke?.done === true,
    { timeout: 30_000 },
  );

  const result = await page.evaluate(() => window.__alphaTabSmoke);
  assert.equal(result.failure, null, result.failure || browserMessages.join('\n'));
  assert.ok(result.summary, 'Browser smoke test must expose a summary.');
  assert.equal(result.summary.tracks, 1);
  assert.equal(result.summary.staves, 2);
  assert.equal(result.summary.measures, 5);
  assert.ok(result.summary.svgCount > 0);
  assert.ok(result.summary.renderedWidth > 0);
  assert.ok(result.summary.renderedHeight > 0);
  assert.equal(result.summary.notationVisible, true);
  assert.equal(result.summary.tablatureVisible, true);
  assert.deepEqual(result.summary.tuning, [64, 59, 55, 50, 45, 40]);
  assert.ok(result.summary.notationBeatBounds >= 14);
  assert.ok(result.summary.tablatureBeatBounds >= 14);
  assert.equal(result.summary.doubleDigitFretInModel, true);
  assert.equal(result.summary.doubleDigitFretTextVisible, true);
  assert.ok(result.summary.cursorAttached > 0);
  assert.ok(result.summary.barPlacementCount >= 3);
  assert.ok(result.summary.beatPlacementCount >= 3);
  assert.ok(result.summary.cursorBars.length >= 2, 'Cursor must cross at least one measure boundary.');
  assert.ok(result.summary.playedBeatCount >= 3);
  assert.equal(result.summary.tickCacheAvailable, true);
  assert.equal(result.summary.actualPlayerMode, 4);
  assert.ok(result.summary.lastTarget.absolutePlaybackStart > result.summary.firstTarget.absolutePlaybackStart);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.ok(fs.statSync(screenshotPath).size > 0);

  process.stdout.write(`${JSON.stringify({
    browser: await browser.version(),
    screenshotPath,
    ...result.summary,
  })}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
