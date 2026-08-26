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
const workbenchScript = fs.readFileSync(
  path.join(repositoryRoot, 'web/guitar-tab-workbench/workbench.js'),
  'utf8',
);
const workbenchCss = fs.readFileSync(
  path.join(repositoryRoot, 'web/guitar-tab-workbench/workbench.css'),
  'utf8',
);

const tiedMusicXml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><tie type="start"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><tie type="stop"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`);

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
  return 'application/octet-stream';
}

function pageHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/workbench/workbench.css">
<main class="workbench" data-guitar-tab-workbench>
  <header class="workbench-toolbar">
    <div class="workbench-title-group"><h1>Guitar TAB Workbench</h1><p>Tie-chain browser smoke</p></div>
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
  const smoke = window.__tieSmoke = {error:null,uploadCalls:0,editCalls:0};
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
  if (url.pathname === '/tie.musicxml') {
    response.writeHead(200, {
      'content-type':'application/vnd.recordare.musicxml+xml',
      'content-length':tiedMusicXml.length,
    });
    response.end(tiedMusicXml);
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
        const result = processMusicXmlUpload({
          fileName:url.searchParams.get('fileName') || '',
          bytes,
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
  if (url.pathname === '/api/edit' && request.method === 'POST') {
    collectBody(request, response, (bytes) => {
      try {
        const commands = JSON.parse(String(request.headers['x-st-edit-commands'] || 'null'));
        const result = processMusicXmlNoteEdit({
          fileName:url.searchParams.get('fileName') || '',
          bytes,
          expectedInputSha256:url.searchParams.get('sha') || '',
          commands,
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
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));

  await page.goto(`http://127.0.0.1:${address.port}/`, {waitUntil:'networkidle0',timeout:30000});
  await page.waitForFunction(() => Boolean(window.__workbench), {timeout:10000});

  const loaded = await page.evaluate(async () => {
    const response = await fetch('/tie.musicxml');
    const file = new File([await response.arrayBuffer()], 'valid-tie.musicxml', {
      type:'application/vnd.recordare.musicxml+xml',
    });
    return window.__workbench.loadFile(file);
  });
  assert.equal(loaded,true);

  await page.waitForFunction(
    () => window.__tieSmoke?.error
      || (window.__workbench?.snapshot().scoreLoaded === true
        && document.querySelectorAll('[data-role="score"] svg').length > 0),
    {timeout:30000},
  );

  const selected = await page.evaluate(() => {
    const note = window.__workbench.api.score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
    const accepted = window.__workbench.selectNote(note);
    return {
      accepted,
      snapshot:window.__workbench.snapshot(),
      status:document.querySelector('[data-role="edit-status"]').textContent,
    };
  });
  assert.equal(selected.accepted,true);
  assert.equal(selected.snapshot.selectedEvent.eventId,'m1-e0');
  assert.equal(selected.snapshot.selectedEvent.tied,true);
  assert.equal(selected.snapshot.applyEditDisabled,false);
  assert.match(selected.status,/tied chain/i);

  await page.select('[data-role="edit-step"]','D');
  await page.select('[data-role="edit-alter"]','0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    () => window.__tieSmoke?.error
      || (window.__workbench?.snapshot().revisionNumber === 1
        && window.__workbench?.snapshot().scoreLoaded === true
        && window.__workbench?.snapshot().selectedEvent?.pitch?.written === 'D3'),
    {timeout:30000},
  );

  const edited = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const first = snapshot.runtimeResult.canonicalTabResult.measures[0].events[0];
    const second = snapshot.runtimeResult.canonicalTabResult.measures[1].events[0];
    const applied = snapshot.runtimeResult.revision.appliedEdits[0];
    return {
      snapshot,
      firstPitch:first.pitch.written,
      secondPitch:second.pitch.written,
      firstPosition:first.selectedPosition,
      secondPosition:second.selectedPosition,
      commandType:applied.commandType,
      affectedEventCount:applied.affectedEventCount,
      editCalls:window.__tieSmoke.editCalls,
      error:window.__tieSmoke.error,
      issues:document.querySelector('[data-role="issues"]').textContent,
      svgCount:document.querySelectorAll('[data-role="score"] svg').length,
    };
  });

  assert.equal(edited.error,null,edited.error || messages.join('\n'));
  assert.equal(edited.editCalls,1);
  assert.equal(edited.snapshot.runtimeResult.status,'PASS');
  assert.equal(edited.snapshot.revisionNumber,1);
  assert.equal(edited.firstPitch,'D3');
  assert.equal(edited.secondPitch,'D3');
  assert.equal(edited.commandType,'REPLACE_TIE_CHAIN_PITCH');
  assert.equal(edited.affectedEventCount,2);
  assert.deepEqual(edited.firstPosition,edited.secondPosition);
  assert.ok(edited.svgCount > 0);
  assert.match(edited.issues,/No blocking issues/);

  process.stdout.write(`${JSON.stringify({
    browser:await browser.version(),
    selected:selected.snapshot,
    edited:edited.snapshot,
    firstPosition:edited.firstPosition,
    secondPosition:edited.secondPosition,
    browserMessages:messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
