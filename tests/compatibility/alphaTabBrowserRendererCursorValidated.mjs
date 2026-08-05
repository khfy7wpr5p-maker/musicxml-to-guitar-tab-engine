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
const screenshotPath = process.env.ALPHATAB_SCREENSHOT_PATH
  || path.resolve(__dirname, '../../alphatab-renderer-cursor.png');
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
<style>
html,body{margin:0;background:#fff}#alphaTab{width:1280px;min-height:300px}
.at-cursor-bar{background:rgba(255,220,0,.18)}
.at-cursor-beat{background:rgba(0,110,255,.8);width:3px}
.at-highlight *{fill:#d22;stroke:#d22}
</style>
<div id="alphaTab"></div>
<script src="/assets/${alphaTabScript}"></script>
<script>
(() => {
  const result = window.__result = {
    done:false,error:null,loaded:false,rendered:false,midi:false,
    barPlacements:[],beatPlacements:[],positionTicks:[],summary:null
  };
  const fail = e => { result.error = e?.stack || String(e); result.done = true; };
  const allBeats = staff => staff.bars.flatMap(bar =>
    bar.voices.flatMap(voice => voice.beats)
  );
  const musical = staff => allBeats(staff).filter(beat =>
    beat.notes.length > 0 || (beat.isRest && !beat.isEmpty)
  );

  const container = document.getElementById('alphaTab');
  const api = new alphaTab.AlphaTabApi(container, {
    core:{
      engine:'svg',useWorkers:false,enableLazyLoading:false,
      includeNoteBounds:true,fontDirectory:'/assets/font/'
    },
    display:{barsPerRow:2},
    player:{
      enablePlayer:true,
      playerMode:alphaTab.PlayerMode.EnabledExternalMedia,
      enableCursor:true,
      enableElementHighlighting:true,
      enableAnimatedBeatCursor:false
    }
  });

  const cursorHandler = {
    onAttach(){},onDetach(){},
    placeBarCursor(cursor, beatBounds){
      const bounds = beatBounds.barBounds.masterBarBounds.visualBounds;
      cursor.setBounds(bounds.x,bounds.y,bounds.w,bounds.h);
      result.barPlacements.push({bar:beatBounds.beat.voice.bar.index,x:bounds.x,y:bounds.y});
    },
    placeBeatCursor(cursor, beatBounds, startX){
      const bounds = beatBounds.barBounds.masterBarBounds.visualBounds;
      cursor.transitionToX(0,startX);
      cursor.setBounds(startX,bounds.y,2,bounds.h);
      result.beatPlacements.push({
        bar:beatBounds.beat.voice.bar.index,
        beat:beatBounds.beat.index,x:startX,y:bounds.y
      });
    },
    transitionBeatCursor(cursor, beatBounds, startX, endX, duration){
      cursor.transitionToX(duration,endX);
    }
  };
  api.customCursorHandler = cursorHandler;
  api.error.on(fail);
  api.scoreLoaded.on(() => { result.loaded = true; run(); });
  api.postRenderFinished.on(() => { result.rendered = true; run(); });
  api.midiLoaded.on(() => {
    result.midi = true;
    api.customCursorHandler = cursorHandler;
    run();
  });
  api.playerPositionChanged.on(args => result.positionTicks.push(args.currentTick));

  let started = false;
  async function run(){
    if(started || !result.loaded || !result.rendered || !result.midi) return;
    started = true;
    try{
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const score = api.score;
      const track = score.tracks[0];
      const notation = track.staves[0];
      const tab = track.staves[1];
      const notationBeats = musical(notation);
      const tabBeats = musical(tab);
      const targets = [notationBeats[0], notationBeats[3], notationBeats[10]];
      for(const beat of targets){
        api.tickPosition = beat.absolutePlaybackStart;
        await new Promise(resolve => setTimeout(resolve,120));
      }

      const svg = [...container.querySelectorAll('svg')];
      const lookup = api.boundsLookup || api.renderer.boundsLookup;
      const tabNotes = tab.bars.flatMap(bar =>
        bar.voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes))
      );
      const svgText = svg.map(element => element.textContent || '').join(' ');
      result.summary = {
        tracks:score.tracks.length,
        staves:track.staves.length,
        measures:score.masterBars.length,
        svgCount:svg.length,
        width:container.scrollWidth,
        height:container.scrollHeight,
        notationBeatBounds:notationBeats.flatMap(beat => lookup.findBeats(beat)).length,
        tabBeatBounds:tabBeats.flatMap(beat => lookup.findBeats(beat)).length,
        notationVisible:notation.showStandardNotation,
        tabVisible:tab.showTablature,
        tuning:[...tab.tuning],
        fret10Model:tabNotes.some(note => note.fret === 10),
        fret10Text:/(^|\\D)10(\\D|$)/.test(svgText),
        barPlacementCount:result.barPlacements.length,
        beatPlacementCount:result.beatPlacements.length,
        cursorBars:[...new Set(result.beatPlacements.map(item => item.bar))],
        positionTicks:result.positionTicks,
        defaultBarCursors:document.querySelectorAll('.at-cursor-bar').length,
        defaultBeatCursors:document.querySelectorAll('.at-cursor-beat').length,
        tickCache:Boolean(api.tickCache),
        playerMode:api.actualPlayerMode,
        firstTick:targets[0].absolutePlaybackStart,
        lastTick:targets[targets.length-1].absolutePlaybackStart
      };
      result.done = true;
    }catch(error){ fail(error); }
  }

  fetch('/score.musicxml')
    .then(response => response.arrayBuffer())
    .then(buffer => {
      if(!api.load(new Uint8Array(buffer))) throw new Error('MusicXML load was rejected.');
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
        : extension === '.woff2' ? 'font/woff2'
          : extension === '.woff' ? 'font/woff' : 'application/octet-stream';
      response.writeHead(200, { 'content-type': type });
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
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));
  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil:'networkidle0',timeout:30000
  });
  await page.waitForFunction(() => window.__result?.done === true, {timeout:30000});
  const result = await page.evaluate(() => window.__result);
  await page.screenshot({path:screenshotPath,fullPage:true});
  process.stdout.write(`${JSON.stringify({
    browser:await browser.version(),screenshotPath,browserMessages:messages,...result
  })}\n`);

  assert.equal(result.error,null,result.error || messages.join('\n'));
  const summary = result.summary;
  assert.ok(summary);
  assert.equal(summary.tracks,1);
  assert.equal(summary.staves,2);
  assert.equal(summary.measures,5);
  assert.ok(summary.svgCount > 0 && summary.width > 0 && summary.height > 0);
  assert.ok(summary.notationBeatBounds >= 14 && summary.tabBeatBounds >= 14);
  assert.equal(summary.notationVisible,true);
  assert.equal(summary.tabVisible,true);
  assert.deepEqual(summary.tuning,[64,59,55,50,45,40]);
  assert.equal(summary.fret10Model,true);
  assert.equal(summary.fret10Text,true);
  assert.equal(summary.tickCache,true);
  assert.equal(summary.playerMode,4);
  assert.ok(summary.barPlacementCount >= 3);
  assert.ok(summary.beatPlacementCount >= 3);
  assert.ok(summary.cursorBars.length >= 2);
  assert.ok(summary.defaultBarCursors >= 1 && summary.defaultBeatCursors >= 1);
  assert.ok(summary.positionTicks.length >= 3);
  assert.ok(summary.lastTick > summary.firstTick);
  assert.ok(fs.statSync(screenshotPath).size > 0);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
