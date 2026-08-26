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
const { processMusicXmlUpload } = require('../../src/app/musicXmlUploadRuntime');
const { processMusicXmlNoteEdit } = require('../../src/app/musicXmlNoteEditRuntime');

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
const sourceMusicXml = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/parser-single-voice.musicxml'),
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
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.sf2') return 'audio/sf2';
  return 'application/octet-stream';
}

function pageHtml() {
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
    <aside class="workbench-sidebar">
      <section class="workbench-editor">
        <strong data-role="selected-note">None</strong>
        <p data-role="edit-status"></p>
        <select data-role="edit-step" disabled><option>A</option><option>B</option><option selected>C</option><option>D</option><option>E</option><option>F</option><option>G</option></select>
        <select data-role="edit-alter" disabled><option value="-2">bb</option><option value="-1">b</option><option value="0" selected>natural</option><option value="1">#</option><option value="2">##</option></select>
        <input data-role="edit-octave" type="number" min="-1" max="9" value="4" disabled>
        <button data-role="apply-edit" type="button" disabled>Apply & regenerate TAB</button>
        <button data-role="cancel-edit" type="button" disabled>Clear selection</button>
      </section>
      <section class="workbench-issues">
        <div class="workbench-issues__heading"><h2>Issues</h2><span data-role="issue-count"></span></div>
        <ol data-role="issues"></ol>
      </section>
    </aside>
  </div>
</main>
<script src="/assets/alphatab.js"></script>
<script src="/workbench/workbench.js"></script>
<script>
(() => {
  const smoke = window.__workbenchSmoke = {error:null,uploadCalls:0,editCalls:0};
  const upload = async (file, ownedBytes) => {
    smoke.uploadCalls += 1;
    const response = await fetch('/api/upload?fileName=' + encodeURIComponent(file.name), {
      method:'POST', headers:{'content-type':'application/octet-stream'}, body:ownedBytes
    });
    const payload = await response.json();
    if(!response.ok) throw new Error(payload?.message || 'upload failed');
    return payload;
  };
  const edit = async request => {
    smoke.editCalls += 1;
    const response = await fetch(
      '/api/edit?fileName=' + encodeURIComponent(request.fileName)
        + '&sha=' + encodeURIComponent(request.expectedInputSha256),
      {
        method:'POST',
        headers:{'content-type':'application/octet-stream','x-st-edit-commands':JSON.stringify(request.commands)},
        body:request.bytes,
      },
    );
    const payload = await response.json();
    if(!response.ok) throw new Error(payload?.message || 'edit failed');
    return payload;
  };
  try {
    window.__workbench = GuitarTabWorkbench.mount({
      root:document.querySelector('[data-guitar-tab-workbench]'),
      alphaTab:window.alphaTab,
      upload,
      edit,
      assetBaseUrl:'/assets',
      scriptFileUrl:window.location.origin + '/assets/alphatab.js',
      playerMode:window.alphaTab.PlayerMode.EnabledExternalMedia,
    });
    window.__workbench.api.error.on(error => { smoke.error = error?.stack || String(error); });
  } catch(error) { smoke.error = error?.stack || String(error); }
})();
</script>`;
}

function collectBody(request, response, complete) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size <= 5 * 1024 * 1024) chunks.push(chunk);
  });
  request.on('end', () => {
    if (size > 5 * 1024 * 1024) {
      response.writeHead(413, {'content-type':'application/json; charset=utf-8'});
      response.end(JSON.stringify({message:'request too large'}));
      return;
    }
    complete(Buffer.concat(chunks));
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, {'content-type':'text/html; charset=utf-8'});
    response.end(pageHtml());
    return;
  }
  if (url.pathname === '/fixture.musicxml') {
    response.writeHead(200, {
      'content-type':'application/vnd.recordare.musicxml+xml',
      'content-length':sourceMusicXml.length,
    });
    response.end(sourceMusicXml);
    return;
  }
  if (url.pathname === '/workbench/workbench.js') {
    response.writeHead(200, {'content-type':'text/javascript; charset=utf-8'});
    response.end(workbenchScript);
    return;
  }
  if (url.pathname === '/workbench/workbench.css') {
    response.writeHead(200, {'content-type':'text/css; charset=utf-8'});
    response.end(workbenchCss);
    return;
  }
  if (url.pathname === '/api/upload' && request.method === 'POST') {
    collectBody(request, response, (bytes) => {
      try {
        const result = processMusicXmlUpload({fileName:url.searchParams.get('fileName') || '',bytes});
        response.writeHead(200, {'content-type':'application/json; charset=utf-8'});
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, {'content-type':'application/json; charset=utf-8'});
        response.end(JSON.stringify({message:error?.message || String(error)}));
      }
    });
    return;
  }
  if (url.pathname === '/api/edit' && request.method === 'POST') {
    collectBody(request, response, (bytes) => {
      try {
        const result = processMusicXmlNoteEdit({
          fileName:url.searchParams.get('fileName') || '',
          bytes,
          expectedInputSha256:url.searchParams.get('sha') || '',
          commands:JSON.parse(String(request.headers['x-st-edit-commands'] || 'null')),
        });
        response.writeHead(200, {'content-type':'application/json; charset=utf-8'});
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, {'content-type':'application/json; charset=utf-8'});
        response.end(JSON.stringify({message:error?.message || String(error)}));
      }
    });
    return;
  }
  if (url.pathname === '/assets/alphatab.js') {
    response.writeHead(200, {
      'content-type':'text/javascript; charset=utf-8',
      'content-length':fs.statSync(alphaTabEntry).size,
    });
    fs.createReadStream(alphaTabEntry).pipe(response);
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const filePath = resolveAlphaTabAsset(url.pathname.slice('/assets/'.length));
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      response.writeHead(200, {
        'content-type':contentType(filePath),
        'content-length':fs.statSync(filePath).size,
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
  executablePath:browserExecutable,
  headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));

  await page.goto(`http://127.0.0.1:${address.port}/`, {waitUntil:'networkidle0',timeout:30000});
  await page.waitForFunction(() => Boolean(window.__workbench), {timeout:10000});

  const loaded = await page.evaluate(async () => {
    const response = await fetch('/fixture.musicxml');
    const file = new File([await response.arrayBuffer()], 'fixture.musicxml', {
      type:'application/vnd.recordare.musicxml+xml',
    });
    return window.__workbench.loadFile(file);
  });
  assert.equal(loaded,true);

  await page.waitForFunction(
    () => window.__workbenchSmoke?.error
      || (window.__workbench?.snapshot().scoreLoaded === true
        && document.querySelectorAll('[data-role="score"] svg').length > 0),
    {timeout:30000},
  );

  const passState = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const track = window.__workbench.api.score.tracks[0];
    return {
      snapshot,
      uploadCalls:window.__workbenchSmoke.uploadCalls,
      error:window.__workbenchSmoke.error,
      notationVisible:track.staves[0].showStandardNotation,
      tabVisible:track.staves[1].showTablature,
      tuning:[...track.staves[1].tuning],
      svgCount:document.querySelectorAll('[data-role="score"] svg').length,
      issueText:document.querySelector('[data-role="issues"]').textContent,
    };
  });
  assert.equal(passState.error,null,passState.error || messages.join('\n'));
  assert.equal(passState.uploadCalls,1);
  assert.equal(passState.snapshot.runtimeResult.status,'PASS');
  assert.equal(passState.snapshot.runtimeResult.route,'MONO_V1');
  assert.match(passState.snapshot.sourceSha256,/^[0-9a-f]{64}$/);
  assert.equal(passState.snapshot.scoreTracks,1);
  assert.equal(passState.snapshot.scoreStaves,2);
  assert.equal(passState.snapshot.scoreMeasures,2);
  assert.equal(passState.notationVisible,true);
  assert.equal(passState.tabVisible,true);
  assert.deepEqual(passState.tuning,[64,59,55,50,45,40]);
  assert.ok(passState.svgCount > 0);
  assert.match(passState.issueText,/No blocking issues/);

  const selected = await page.evaluate(() => {
    const note = window.__workbench.api.score.tracks[0].staves[0].bars[0].voices[0].beats[1].notes[0];
    const before = window.__workbench.snapshot().runtimeResult.canonicalTabResult.measures[0].events[1];
    const accepted = window.__workbench.selectNote(note);
    return {accepted,beforePosition:before.selectedPosition,snapshot:window.__workbench.snapshot()};
  });
  assert.equal(selected.accepted,true);
  assert.equal(selected.snapshot.selectedEvent.eventId,'m1-e1');
  assert.equal(selected.snapshot.selectedEvent.pitch.written,'D#3');
  assert.equal(selected.snapshot.applyEditDisabled,false);

  await page.select('[data-role="edit-step"]','G');
  await page.select('[data-role="edit-alter"]','0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');
  await page.waitForFunction(
    () => window.__workbenchSmoke?.error
      || (window.__workbench?.snapshot().revisionNumber === 1
        && window.__workbench?.snapshot().scoreLoaded === true
        && window.__workbench?.snapshot().selectedEvent?.pitch?.written === 'G3'),
    {timeout:30000},
  );

  const edited = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const event = snapshot.runtimeResult.canonicalTabResult.measures[0].events[1];
    return {
      snapshot,
      eventPosition:event.selectedPosition,
      editCalls:window.__workbenchSmoke.editCalls,
      svgCount:document.querySelectorAll('[data-role="score"] svg').length,
    };
  });
  assert.equal(edited.editCalls,1);
  assert.equal(edited.snapshot.revisionNumber,1);
  assert.equal(edited.snapshot.revisionCommandCount,1);
  assert.equal(edited.snapshot.runtimeResult.canonicalTabResult.measures[0].events[1].pitch.written,'G3');
  assert.notDeepEqual(edited.eventPosition,selected.beforePosition);
  assert.ok(edited.svgCount > 0);

  await page.select('[data-role="edit-step"]','C');
  await page.select('[data-role="edit-alter"]','0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '8'; });
  await page.click('[data-role="apply-edit"]');
  await page.waitForFunction(
    () => window.__workbenchSmoke?.editCalls === 2
      && /Blocked/.test(document.querySelector('[data-role="edit-status"]').textContent),
    {timeout:30000},
  );

  const blockedEdit = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    issueText:document.querySelector('[data-role="issues"]').textContent,
    scoreVisible:!document.querySelector('[data-role="score"]').hidden,
  }));
  assert.equal(blockedEdit.snapshot.revisionNumber,1);
  assert.equal(blockedEdit.snapshot.revisionCommandCount,1);
  assert.equal(blockedEdit.snapshot.scoreLoaded,true);
  assert.equal(blockedEdit.snapshot.runtimeResult.canonicalTabResult.measures[0].events[1].pitch.written,'G3');
  assert.equal(blockedEdit.scoreVisible,true);
  assert.match(blockedEdit.issueText,/UNPLAYABLE_NOTE/);

  const tiedSelection = await page.evaluate(() => {
    const note = window.__workbench.api.score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
    const accepted = window.__workbench.selectNote(note);
    return {
      accepted,
      snapshot:window.__workbench.snapshot(),
      status:document.querySelector('[data-role="edit-status"]').textContent,
    };
  });
  assert.equal(tiedSelection.accepted,true);
  assert.equal(tiedSelection.snapshot.selectedEvent.eventId,'m1-e0');
  assert.equal(tiedSelection.snapshot.selectedEvent.tied,true);
  assert.equal(tiedSelection.snapshot.applyEditDisabled,false);
  assert.match(tiedSelection.status,/tied chain/i);

  await page.select('[data-role="edit-step"]','D');
  await page.select('[data-role="edit-alter"]','0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');
  await page.waitForFunction(
    () => window.__workbenchSmoke?.editCalls === 3
      && /Blocked/.test(document.querySelector('[data-role="edit-status"]').textContent),
    {timeout:30000},
  );

  const blockedTieEdit = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    issueText:document.querySelector('[data-role="issues"]').textContent,
    scoreVisible:!document.querySelector('[data-role="score"]').hidden,
  }));
  assert.equal(blockedTieEdit.snapshot.revisionNumber,1);
  assert.equal(blockedTieEdit.snapshot.revisionCommandCount,1);
  assert.equal(blockedTieEdit.snapshot.scoreLoaded,true);
  assert.equal(blockedTieEdit.snapshot.runtimeResult.canonicalTabResult.measures[0].events[1].pitch.written,'G3');
  assert.equal(blockedTieEdit.scoreVisible,true);
  assert.match(blockedTieEdit.issueText,/INVALID_TIE_CHAIN/);

  await page.evaluate(() => {
    const current = window.__workbench.snapshot().runtimeResult;
    window.__workbench.loadRuntimeResult({
      ...current,
      preflight:{...current.preflight,status:'WARNING',issues:[{
        severity:'warning',category:'quality',code:'TEST_MEASURE_WARNING',message:'Review this measure.',
        location:{measure:2,measureIndex:1,eventIndex:1},
      }]},
    });
  });
  await page.waitForFunction(() => window.__workbench?.snapshot().scoreLoaded === true, {timeout:30000});
  await page.click('.workbench-issue__button');
  const warningFocus = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    cursorText:document.querySelector('[data-role="cursor-status"]').textContent,
  }));
  assert.equal(warningFocus.snapshot.currentMeasureIndex,1);
  assert.match(warningFocus.cursorText,/Measure 2/);

  await page.evaluate(() => {
    window.__workbench.loadRuntimeResult({
      status:'BLOCKED',route:'MONO_V1',preflight:{issues:[{
        severity:'error',category:'content',code:'UNPLAYABLE_TEST_NOTE',
        message:'A test note cannot be placed safely.',location:{measure:2,eventIndex:1},
      }]},musicXml:null,
    });
  });
  const blockedLoad = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    issueText:document.querySelector('[data-role="issues"]').textContent,
    focusResult:window.__workbench.focusMeasure({measureIndex:1}),
  }));
  assert.equal(blockedLoad.snapshot.runtimeResult.status,'BLOCKED');
  assert.equal(blockedLoad.snapshot.scoreLoaded,false);
  assert.equal(blockedLoad.snapshot.scoreHidden,true);
  assert.equal(blockedLoad.snapshot.scoreTracks,0);
  assert.equal(blockedLoad.snapshot.playDisabled,true);
  assert.equal(blockedLoad.snapshot.stopDisabled,true);
  assert.equal(blockedLoad.focusResult,false);
  assert.match(blockedLoad.issueText,/UNPLAYABLE_TEST_NOTE/);

  await page.screenshot({path:screenshotPath,fullPage:true});
  assert.ok(fs.statSync(screenshotPath).size > 0);

  process.stdout.write(`${JSON.stringify({
    browser:await browser.version(),
    screenshotPath,
    pass:passState.snapshot,
    edited:edited.snapshot,
    blockedEdit:blockedEdit.snapshot,
    blockedTieEdit:blockedTieEdit.snapshot,
    warningFocus:warningFocus.snapshot,
    blockedLoad:blockedLoad.snapshot,
    browserMessages:messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
