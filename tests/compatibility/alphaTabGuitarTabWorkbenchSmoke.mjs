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
const {
  processMusicXmlUpload,
} = require('../../src/app/musicXmlUploadRuntime');

const browserExecutable = process.env.BROWSER_EXECUTABLE;
assert.ok(browserExecutable && fs.existsSync(browserExecutable));

const alphaTabEntry = require.resolve('@coderline/alphatab');
const alphaTabDist = path.dirname(alphaTabEntry);
const screenshotPath = process.env.ALPHATAB_WORKBENCH_SCREENSHOT_PATH
  || path.resolve(repositoryRoot, 'alphatab-guitar-tab-workbench.png');
const workbenchScript = fs.readFileSync(
  path.join(repositoryRoot, 'web/guitar-tab-workbench/workbench.js'),
  'utf8',
);
const workbenchCss = fs.readFileSync(
  path.join(repositoryRoot, 'web/guitar-tab-workbench/workbench.css'),
  'utf8',
);
const sourceMusicXml = serializeCanonicalTabResultToMusicXml(
  createCanonicalTabCompatibilityFixture(),
  { pretty: true, trailingNewline: true },
);

function resolveAlphaTabAsset(relativePath) {
  const filePath = path.resolve(alphaTabDist, decodeURIComponent(relativePath));
  return filePath === alphaTabDist || filePath.startsWith(`${alphaTabDist}${path.sep}`)
    ? filePath
    : null;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.sf2') return 'audio/sf2';
  return 'application/octet-stream';
}

function testPage() {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/workbench/workbench.css">
<main class="workbench" data-guitar-tab-workbench>
  <header class="workbench-toolbar">
    <div class="workbench-title-group"><h1>Guitar TAB Workbench</h1><p>Compatibility smoke</p></div>
    <label class="workbench-file-label"><span>Open MusicXML</span><input data-role="musicxml-file" type="file" accept=".musicxml,.xml"></label>
    <div class="workbench-transport"><button data-role="play" type="button" disabled>Play</button><button data-role="stop" type="button" disabled>Stop</button></div>
  </header>
  <section class="workbench-meta">
    <span>Document: <strong data-role="document-status"></strong></span>
    <span>Route: <strong data-role="route-status"></strong></span>
    <span>Cursor: <strong data-role="cursor-status"></strong></span>
  </section>
  <div class="workbench-grid">
    <section class="workbench-score-panel"><div class="workbench-score" data-role="score"></div></section>
    <aside class="workbench-issues"><div class="workbench-issues__heading"><h2>Issues</h2><span data-role="issue-count"></span></div><ol data-role="issues"></ol></aside>
  </div>
</main>
<script src="/assets/alphatab.js"></script>
<script src="/workbench/workbench.js"></script>
<script>
(() => {
  const state = window.__workbenchSmoke = {done:false,error:null,uploadCalls:0,postRender:false};
  const fail = error => { state.error = error?.stack || String(error); state.done = true; };
  const upload = async file => {
    state.uploadCalls += 1;
    const response = await fetch('/api/upload?fileName=' + encodeURIComponent(file.name), {
      method:'POST', headers:{'content-type':'application/octet-stream'}, body:await file.arrayBuffer()
    });
    const payload = await response.json();
    if(!response.ok) throw new Error(payload?.message || 'upload failed');
    return payload;
  };
  try {
    const root = document.querySelector('[data-guitar-tab-workbench]');
    const workbench = window.__workbench = GuitarTabWorkbench.mount({
      root,
      alphaTab:window.alphaTab,
      upload,
      assetBaseUrl:'/assets',
      scriptFileUrl:window.location.origin + '/assets/alphatab.js',
      playerMode:window.alphaTab.PlayerMode.EnabledExternalMedia,
    });
    workbench.api.error.on(fail);
    workbench.api.postRenderFinished.on(() => { state.postRender = true; });
  } catch(error) { fail(error); }
})();
</script>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(testPage());
    return;
  }
  if (url.pathname === '/workbench/workbench.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(workbenchScript);
    return;
  }
  if (url.pathname === '/workbench/workbench.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    response.end(workbenchCss);
    return;
  }
  if (url.pathname === '/fixture.musicxml') {
    response.writeHead(200, {
      'content-type': 'application/vnd.recordare.musicxml+xml; charset=utf-8',
    });
    response.end(sourceMusicXml);
    return;
  }
  if (url.pathname === '/api/upload' && request.method === 'POST') {
    const fileName = url.searchParams.get('fileName') || '';
    const chunks = [];
    let total = 0;
    let aborted = false;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > 5 * 1024 * 1024) {
        aborted = true;
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (aborted) return;
      try {
        const result = processMusicXmlUpload({
          fileName,
          bytes: Buffer.concat(chunks),
        });
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ message: error?.message || String(error) }));
      }
    });
    return;
  }
  if (url.pathname === '/assets/alphatab.js') {
    response.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'content-length': fs.statSync(alphaTabEntry).size,
    });
    fs.createReadStream(alphaTabEntry).pipe(response);
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const relativePath = url.pathname.slice('/assets/'.length);
    const filePath = resolveAlphaTabAsset(relativePath);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      response.writeHead(200, {
        'content-type': contentType(filePath),
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
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));

  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil:'networkidle0',timeout:30000,
  });
  await page.waitForFunction(() => Boolean(window.__workbench), {timeout:10000});

  await page.evaluate(async () => {
    const response = await fetch('/fixture.musicxml');
    const bytes = await response.arrayBuffer();
    const file = new File([bytes], 'fixture.musicxml', {type:'application/vnd.recordare.musicxml+xml'});
    await window.__workbench.loadFile(file);
  });

  await page.waitForFunction(
    () => window.__workbench?.snapshot().scoreLoaded === true && window.__workbenchSmoke?.postRender === true,
    {timeout:30000},
  );
  await new Promise(resolve => setTimeout(resolve, 250));

  const passState = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const track = window.__workbench.api.score.tracks[0];
    return {
      snapshot,
      uploadCalls:window.__workbenchSmoke.uploadCalls,
      notationVisible:track.staves[0].showStandardNotation,
      tabVisible:track.staves[1].showTablature,
      tuning:[...track.staves[1].tuning],
      svgCount:document.querySelectorAll('[data-role="score"] svg').length,
      issueText:document.querySelector('[data-role="issues"]').textContent,
    };
  });

  assert.equal(passState.snapshot.runtimeResult.status,'PASS');
  assert.equal(passState.uploadCalls,1);
  assert.equal(passState.snapshot.scoreTracks,1);
  assert.equal(passState.snapshot.scoreStaves,2);
  assert.equal(passState.snapshot.scoreMeasures,5);
  assert.equal(passState.notationVisible,true);
  assert.equal(passState.tabVisible,true);
  assert.deepEqual(passState.tuning,[64,59,55,50,45,40]);
  assert.ok(passState.svgCount > 0);
  assert.match(passState.issueText,/No blocking issues/);

  const focused = await page.evaluate(() => {
    const result = window.__workbench.focusMeasure({measureIndex:2});
    return {result,snapshot:window.__workbench.snapshot(),text:document.querySelector('[data-role="cursor-status"]').textContent};
  });
  assert.equal(focused.result,true);
  assert.equal(focused.snapshot.currentMeasureIndex,2);
  assert.match(focused.text,/Measure 3/);

  await page.evaluate(() => {
    window.__workbench.loadRuntimeResult({
      status:'BLOCKED',
      route:'POLY_V2',
      preflight:{issues:[{
        severity:'error',
        category:'playability',
        code:'UNPLAYABLE_TEST_NOTE',
        message:'A test note cannot be placed safely.',
        location:{measure:4,measureIndex:3,eventIndex:1,sourceEventId:'test-event'},
      }]},
      musicXml:null,
    });
  });
  const blockedState = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    issueText:document.querySelector('[data-role="issues"]').textContent,
    issueButtonCount:document.querySelectorAll('.workbench-issue__button').length,
  }));
  assert.equal(blockedState.snapshot.runtimeResult.status,'BLOCKED');
  assert.equal(blockedState.snapshot.issueCount,1);
  assert.equal(blockedState.issueButtonCount,1);
  assert.match(blockedState.issueText,/UNPLAYABLE_TEST_NOTE/);
  assert.match(blockedState.issueText,/measure 4/);

  await page.click('.workbench-issue__button');
  const issueFocus = await page.evaluate(() => window.__workbench.snapshot());
  assert.equal(issueFocus.currentMeasureIndex,3);

  await page.screenshot({path:screenshotPath,fullPage:true});
  assert.ok(fs.statSync(screenshotPath).size > 0);

  const finalState = await page.evaluate(() => ({
    workbench:window.__workbench.snapshot(),
    smoke:window.__workbenchSmoke,
  }));
  process.stdout.write(`${JSON.stringify({
    browser:await browser.version(),
    screenshotPath,
    browserMessages:messages,
    ...finalState,
  })}\n`);
  assert.equal(finalState.smoke.error,null,finalState.smoke.error || messages.join('\n'));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
