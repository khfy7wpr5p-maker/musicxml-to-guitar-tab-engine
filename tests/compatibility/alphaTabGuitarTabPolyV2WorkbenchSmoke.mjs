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
const {
  processMusicXmlPolyphonicNoteEditV2,
} = require('../../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

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
const polyMusicXml = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/pa12-polyphonic-e2e.musicxml'),
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
  return 'application/octet-stream';
}

function pageHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/workbench/workbench.css">
<main class="workbench" data-guitar-tab-workbench>
  <header class="workbench-toolbar">
    <div class="workbench-title-group"><h1>Guitar TAB Workbench</h1><p>POLY_V2 browser smoke</p></div>
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
  const smoke = window.__polySmoke = {error:null,uploadCalls:0,polyEditCalls:0,monoEditCalls:0,lastPolyRequest:null};
  const upload = async (file, ownedBytes) => {
    smoke.uploadCalls += 1;
    const response = await fetch('/api/upload?fileName=' + encodeURIComponent(file.name), {
      method:'POST', headers:{'content-type':'application/octet-stream'}, body:ownedBytes
    });
    const payload = await response.json();
    if(!response.ok) throw new Error(payload?.message || 'upload failed');
    return payload;
  };
  const edit = async () => {
    smoke.monoEditCalls += 1;
    throw new Error('MONO_V1 editor must not receive POLY_V2 revisions.');
  };
  const polyphonicEdit = async request => {
    smoke.polyEditCalls += 1;
    const runtimeCommands = request.commands.map(command => ({
      measureIndex:command.measureIndex,
      sourceOrder:command.sourceOrder,
      sourceEventId:command.sourceEventId,
      sourceGroupId:command.sourceGroupId,
      sourceGroupEventIds:[...command.sourceGroupEventIds],
      pitch:{step:command.pitch.step,alter:command.pitch.alter,octave:command.pitch.octave},
    }));
    smoke.lastPolyRequest = {
      expectedInputSha256:request.expectedInputSha256,
      commands:structuredClone(request.commands),
      runtimeCommands:structuredClone(runtimeCommands),
    };
    const response = await fetch(
      '/api/edit/poly-v2?fileName=' + encodeURIComponent(request.fileName)
        + '&sha=' + encodeURIComponent(request.expectedInputSha256),
      {
        method:'POST',
        headers:{'content-type':'application/octet-stream','x-st-edit-commands':JSON.stringify(runtimeCommands)},
        body:request.bytes,
      },
    );
    const payload = await response.json();
    if(!response.ok) throw new Error(payload?.message || 'poly edit failed');
    return payload;
  };
  try {
    window.__workbench = GuitarTabWorkbench.mount({
      root:document.querySelector('[data-guitar-tab-workbench]'),
      alphaTab:window.alphaTab,
      upload,
      edit,
      polyphonicEdit,
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
  if (url.pathname === '/poly.musicxml') {
    response.writeHead(200, {
      'content-type':'application/vnd.recordare.musicxml+xml',
      'content-length':polyMusicXml.length,
    });
    response.end(polyMusicXml);
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
  if (url.pathname === '/api/edit/poly-v2' && request.method === 'POST') {
    collectBody(request, response, (bytes) => {
      try {
        const commands = JSON.parse(String(request.headers['x-st-edit-commands'] || 'null'));
        const result = processMusicXmlPolyphonicNoteEditV2({
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

  async function loadSource() {
    return page.evaluate(async () => {
      const response = await fetch('/poly.musicxml');
      const file = new File([await response.arrayBuffer()], 'poly.musicxml', {
        type:'application/vnd.recordare.musicxml+xml',
      });
      return window.__workbench.loadFile(file);
    });
  }

  assert.equal(await loadSource(), true);
  await page.waitForFunction(
    () => window.__polySmoke?.error
      || (window.__workbench?.snapshot().scoreLoaded === true
        && document.querySelectorAll('[data-role="score"] svg').length > 0),
    {timeout:30000},
  );

  const mapped = await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes));
    const note = notes.find(candidate => candidate.realValue === 60);
    const accepted = window.__workbench.selectNote(note);
    return {
      accepted,
      snapshot:window.__workbench.snapshot(),
      status:document.querySelector('[data-role="edit-status"]').textContent,
    };
  });
  assert.equal(mapped.accepted, true);
  assert.equal(mapped.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(mapped.snapshot.selectedEvent.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(mapped.snapshot.selectedEvent.sourceOrder, 0);
  assert.equal(mapped.snapshot.selectedEvent.sourceGroupId, 'P1:measure:0:simultaneous:0');
  assert.deepEqual(
    mapped.snapshot.selectedEvent.sourceGroupEventIds,
    ['P1:measure:0:note:0', 'P1:measure:0:note:4'],
  );
  assert.equal(mapped.snapshot.applyEditDisabled, false);
  assert.match(mapped.status, /POLY_V2 group 2 acknowledged/);

  const staleRendererContract = await page.evaluate(() => {
    const result = structuredClone(window.__workbench.snapshot().runtimeResult);
    const first = result.canonicalTabResult.measures[0].events[0];
    const firstDisposition = result.canonicalTabResult.noteDispositions.find(
      entry => entry.sourceEventId === first.sourceEventId,
    );
    firstDisposition.targetPitch = {
      step:'C', alter:1, octave:4, midi:61, written:'C#4',
    };
    window.__workbench.loadRuntimeResult(result);
    return true;
  });
  assert.equal(staleRendererContract, true);
  await page.waitForFunction(() => window.__workbench?.snapshot().scoreLoaded === true, {timeout:30000});
  const ambiguityState = await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes));
    const note = notes.find(candidate => candidate.realValue === 60);
    const accepted = window.__workbench.selectNote(note);
    return {
      accepted,
      snapshot:window.__workbench.snapshot(),
      status:document.querySelector('[data-role="edit-status"]').textContent,
    };
  });
  assert.equal(ambiguityState.accepted, false);
  assert.equal(ambiguityState.snapshot.selectedEvent, null);
  assert.equal(ambiguityState.snapshot.applyEditDisabled, true);
  assert.match(ambiguityState.status, /ambiguous or incomplete/);

  assert.equal(await loadSource(), true);
  await page.waitForFunction(
    () => window.__workbench?.snapshot().scoreLoaded === true
      && window.__workbench?.snapshot().runtimeResult?.route === 'POLY_V2',
    {timeout:30000},
  );
  await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(voice => voice.beats.flatMap(beat => beat.notes));
    const note = notes.find(candidate => candidate.realValue === 60);
    if (!window.__workbench.selectNote(note)) throw new Error('unique POLY_V2 note did not map');
  });

  await page.select('[data-role="edit-step"]','E');
  await page.select('[data-role="edit-alter"]','0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    () => window.__polySmoke?.error
      || (window.__workbench?.snapshot().revisionNumber === 1
        && window.__workbench?.snapshot().scoreLoaded === true
        && window.__workbench?.snapshot().selectedEvent?.pitch?.written === 'E4'),
    {timeout:30000},
  );

  const edited = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const event = snapshot.runtimeResult.canonicalTabResult.measures[0].events[0];
    const disposition = snapshot.runtimeResult.canonicalTabResult.noteDispositions.find(
      entry => entry.sourceEventId === event.sourceEventId,
    );
    return {
      snapshot,
      eventPitch:event.pitch.written,
      position:disposition.selectedPosition,
      applied:snapshot.runtimeResult.revision.appliedEdits[0],
      lastPolyRequest:window.__polySmoke.lastPolyRequest,
      polyEditCalls:window.__polySmoke.polyEditCalls,
      monoEditCalls:window.__polySmoke.monoEditCalls,
      error:window.__polySmoke.error,
      svgCount:document.querySelectorAll('[data-role="score"] svg').length,
    };
  });
  assert.equal(edited.error, null, edited.error || messages.join('\n'));
  assert.equal(edited.polyEditCalls, 1);
  assert.equal(edited.monoEditCalls, 0);
  assert.equal(edited.snapshot.runtimeResult.status, 'PASS');
  assert.equal(edited.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(edited.snapshot.revisionNumber, 1);
  assert.equal(edited.eventPitch, 'E4');
  assert.ok(edited.position);
  assert.equal(edited.applied.commandType, 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH');
  assert.equal(edited.applied.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(edited.applied.sourceGroupId, 'P1:measure:0:simultaneous:0');
  assert.deepEqual(
    edited.applied.sourceGroupEventIds,
    ['P1:measure:0:note:0', 'P1:measure:0:note:4'],
  );
  assert.deepEqual(
    edited.lastPolyRequest.commands[0].sourceGroupEventIds,
    ['P1:measure:0:note:0', 'P1:measure:0:note:4'],
  );
  assert.deepEqual(
    edited.lastPolyRequest.commands[0].sourceTieEventIds,
    ['P1:measure:0:note:0'],
  );
  assert.equal(
    Object.hasOwn(edited.lastPolyRequest.runtimeCommands[0], 'sourceTieEventIds'),
    false,
  );
  assert.ok(edited.svgCount > 0);

  await page.select('[data-role="edit-step"]','C');
  await page.select('[data-role="edit-alter"]','0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '7'; });
  await page.click('[data-role="apply-edit"]');
  await page.waitForFunction(
    () => window.__polySmoke?.polyEditCalls === 2
      && /Blocked/.test(document.querySelector('[data-role="edit-status"]').textContent),
    {timeout:30000},
  );
  const blocked = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    issues:document.querySelector('[data-role="issues"]').textContent,
    visible:!document.querySelector('[data-role="score"]').hidden,
  }));
  assert.equal(blocked.snapshot.revisionNumber, 1);
  assert.equal(blocked.snapshot.runtimeResult.canonicalTabResult.measures[0].events[0].pitch.written, 'E4');
  assert.equal(blocked.visible, true);
  assert.notEqual(blocked.issues.trim(), '');

  process.stdout.write(`${JSON.stringify({
    browser:await browser.version(),
    mapped:mapped.snapshot,
    ambiguity:ambiguityState.snapshot,
    edited:edited.snapshot,
    blocked:blocked.snapshot,
    browserMessages:messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
