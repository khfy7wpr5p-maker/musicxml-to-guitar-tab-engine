import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const bundledSoundFont = path.join(alphaTabDist, 'soundfont', 'sonivox.sf2');
assert.ok(fs.existsSync(bundledSoundFont), 'The pinned alphaTab package must contain sonivox.sf2.');
assert.ok(fs.statSync(bundledSoundFont).size > 0);

const musicXml = serializeCanonicalTabResultToMusicXml(
  createCanonicalTabCompatibilityFixture(),
  { pretty: true, trailingNewline: true },
);

function resolveAsset(urlPath) {
  const filePath = path.resolve(
    alphaTabDist,
    decodeURIComponent(urlPath.slice('/assets/'.length)),
  );
  return filePath === alphaTabDist || filePath.startsWith(`${alphaTabDist}${path.sep}`)
    ? filePath
    : null;
}

const pageHtml = `<!doctype html>
<meta charset="utf-8">
<button id="start" disabled>Start playback</button>
<div id="alphaTab" style="width:900px"></div>
<script src="/assets/${alphaTabScript}"></script>
<script>
(() => {
  const state = window.__synthSmoke = {
    done:false,error:null,scoreLoaded:false,midiLoaded:false,
    soundFontLoaded:false,playerReady:false,playReturned:null,
    playerStates:[],positionTicks:[],soundFontProgress:[],summary:null
  };
  const fail = error => {
    state.error = error?.stack || String(error);
    state.done = true;
  };

  const api = new alphaTab.AlphaTabApi(document.getElementById('alphaTab'), {
    core:{
      engine:'svg',useWorkers:false,enableLazyLoading:false,
      fontDirectory:'/assets/font/',scriptFile:'/assets/${alphaTabScript}'
    },
    player:{
      enablePlayer:true,
      playerMode:alphaTab.PlayerMode.EnabledSynthesizer,
      soundFont:'/assets/soundfont/sonivox.sf2',
      enableCursor:false,
      enableElementHighlighting:false
    }
  });
  window.__alphaTabSynthApi = api;

  const startButton = document.getElementById('start');
  api.error.on(fail);
  api.scoreLoaded.on(() => { state.scoreLoaded = true; });
  api.midiLoaded.on(() => { state.midiLoaded = true; });
  api.soundFontLoad.on(event => {
    state.soundFontProgress.push({loaded:event.loaded,total:event.total});
  });
  api.soundFontLoaded.on(() => { state.soundFontLoaded = true; });
  api.playerReady.on(() => {
    state.playerReady = true;
    startButton.disabled = false;
  });
  api.playerStateChanged.on(event => {
    state.playerStates.push(event.state);
  });
  api.playerPositionChanged.on(event => {
    state.positionTicks.push(event.currentTick);
  });

  startButton.addEventListener('click', () => {
    try {
      state.playReturned = api.play();
      setTimeout(() => {
        api.stop();
        setTimeout(() => {
          state.summary = {
            ready:api.isReadyForPlayback,
            actualPlayerMode:api.actualPlayerMode,
            endTick:api.endTick,
            endTime:api.endTime,
            playerState:api.playerState,
            scoreTracks:api.score?.tracks.length || 0,
            scoreMeasures:api.score?.masterBars.length || 0
          };
          state.done = true;
        }, 250);
      }, 1200);
    } catch(error) {
      fail(error);
    }
  });

  fetch('/score.musicxml')
    .then(response => response.arrayBuffer())
    .then(buffer => {
      if(!api.load(new Uint8Array(buffer))) {
        throw new Error('MusicXML load was rejected.');
      }
    })
    .catch(fail);
})();
</script>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(pageHtml);
    return;
  }
  if (url.pathname === '/score.musicxml') {
    response.writeHead(200, {
      'content-type': 'application/vnd.recordare.musicxml+xml; charset=utf-8',
    });
    response.end(musicXml);
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const filePath = resolveAsset(url.pathname);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const extension = path.extname(filePath).toLowerCase();
      const type = extension === '.js' || extension === '.mjs'
        ? 'text/javascript; charset=utf-8'
        : extension === '.sf2' ? 'audio/sf2'
          : extension === '.woff2' ? 'font/woff2'
            : extension === '.woff' ? 'font/woff' : 'application/octet-stream';
      response.writeHead(200, {
        'content-type': type,
        'content-length': fs.statSync(filePath).size,
      });
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
  args:[
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  const page = await browser.newPage();
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));

  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil:'networkidle0',timeout:30000
  });
  await page.waitForFunction(
    () => window.__synthSmoke?.playerReady === true || window.__synthSmoke?.error,
    {timeout:30000},
  );
  const readyState = await page.evaluate(() => window.__synthSmoke);
  assert.equal(readyState.error,null,readyState.error || messages.join('\n'));
  assert.equal(readyState.playerReady,true);

  await page.click('#start');
  await page.waitForFunction(() => window.__synthSmoke?.done === true, {timeout:10000});
  const result = await page.evaluate(() => window.__synthSmoke);
  process.stdout.write(`${JSON.stringify({
    browser:await browser.version(),
    bundledSoundFontBytes:fs.statSync(bundledSoundFont).size,
    browserMessages:messages,
    ...result
  })}\n`);

  assert.equal(result.error,null,result.error || messages.join('\n'));
  assert.equal(result.scoreLoaded,true);
  assert.equal(result.midiLoaded,true);
  assert.equal(result.soundFontLoaded,true);
  assert.equal(result.playerReady,true);
  assert.equal(result.playReturned,true);
  assert.ok(result.soundFontProgress.length > 0);
  assert.ok(result.playerStates.length >= 2);
  assert.ok(result.positionTicks.some(tick => tick > 0));
  assert.ok(result.summary);
  assert.equal(result.summary.ready,true);
  assert.ok(result.summary.endTick > 0);
  assert.ok(result.summary.endTime > 0);
  assert.equal(result.summary.scoreTracks,1);
  assert.equal(result.summary.scoreMeasures,5);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
