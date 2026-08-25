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
const fixtureBytes = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/ui07-poly-unison.musicxml'),
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
<link rel="icon" href="data:,">
<style>
  body{font-family:system-ui;margin:0}.workbench-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:12px}.workbench-score{min-height:420px}.workbench-sidebar{padding:12px}.workbench-editor select,.workbench-editor input,.workbench-editor button{display:block;margin:6px 0}
</style>
<main class="workbench" data-guitar-tab-workbench>
  <input data-role="musicxml-file" type="file" accept=".musicxml,.xml">
  <button data-role="play" type="button" disabled>Play</button>
  <button data-role="stop" type="button" disabled>Stop</button>
  <span data-role="document-status"></span>
  <span data-role="route-status"></span>
  <span data-role="cursor-status"></span>
  <div class="workbench-grid">
    <section><div class="workbench-score" data-role="score"></div></section>
    <aside class="workbench-sidebar">
      <section class="workbench-editor">
        <strong data-role="selected-note">None</strong>
        <p data-role="edit-status"></p>
        <select data-role="edit-step" disabled><option>A</option><option>B</option><option selected>C</option><option>D</option><option>E</option><option>F</option><option>G</option></select>
        <select data-role="edit-alter" disabled><option value="-2">bb</option><option value="-1">b</option><option value="0" selected>natural</option><option value="1">#</option><option value="2">##</option></select>
        <input data-role="edit-octave" type="number" min="-1" max="9" value="4" disabled>
        <button data-role="apply-edit" type="button" disabled>Apply</button>
        <button data-role="cancel-edit" type="button" disabled>Clear</button>
      </section>
      <section><span data-role="issue-count"></span><ol data-role="issues"></ol></section>
    </aside>
  </div>
</main>
<script src="/assets/alphatab.js"></script>
<script src="/workbench/workbench.js"></script>
<script>
(() => {
  const smoke = window.__ui07Smoke = {
    error:null,
    uploadCalls:0,
    polyEditCalls:0,
    monoEditCalls:0,
    lastUiCommands:null,
    lastRuntimeCommands:null,
    lastUploadResult:null,
  };
  const upload = async (file, ownedBytes) => {
    smoke.uploadCalls += 1;
    const response = await fetch('/api/upload?fileName=' + encodeURIComponent(file.name), {
      method:'POST', headers:{'content-type':'application/octet-stream'}, body:ownedBytes
    });
    const payload = await response.json();
    smoke.lastUploadResult = structuredClone(payload);
    if(!response.ok) throw new Error(payload?.message || 'upload failed');
    return payload;
  };
  const edit = async () => {
    smoke.monoEditCalls += 1;
    throw new Error('MONO editor must not receive UI-07 POLY revisions.');
  };
  const polyphonicEdit = async request => {
    smoke.polyEditCalls += 1;
    smoke.lastUiCommands = structuredClone(request.commands);
    const runtimeCommands = request.commands.map(command => ({
      measureIndex:command.measureIndex,
      sourceOrder:command.sourceOrder,
      sourceEventId:command.sourceEventId,
      sourceGroupId:command.sourceGroupId,
      sourceGroupEventIds:[...command.sourceGroupEventIds],
      pitch:{step:command.pitch.step,alter:command.pitch.alter,octave:command.pitch.octave},
    }));
    smoke.lastRuntimeCommands = structuredClone(runtimeCommands);
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
  if (url.pathname === '/fixture.musicxml') {
    response.writeHead(200, {
      'content-type':'application/vnd.recordare.musicxml+xml',
      'content-length':fixtureBytes.length,
    });
    response.end(fixtureBytes);
    return;
  }
  if (url.pathname === '/workbench/workbench.js') {
    response.writeHead(200, {'content-type':'text/javascript; charset=utf-8'});
    response.end(workbenchScript);
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
const origin = `http://127.0.0.1:${address.port}`;

let browser;
try {
  browser = await puppeteer.launch({
    executablePath:browserExecutable,
    headless:true,
    args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
  const errors = [];
  page.on('pageerror', error => errors.push(error?.stack || String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(origin, {waitUntil:'networkidle0',timeout:30000});
  await page.waitForFunction(() => Boolean(window.__workbench), {timeout:10000});

  const loadEvidence = await page.evaluate(async () => {
    const response = await fetch('/fixture.musicxml');
    const file = new File([await response.arrayBuffer()], 'ui07-poly-unison.musicxml', {
      type:'application/vnd.recordare.musicxml+xml',
    });
    const loaded = await window.__workbench.loadFile(file);
    return {
      loaded,
      snapshot:window.__workbench.snapshot(),
      uploadResult:window.__ui07Smoke.lastUploadResult,
      smokeError:window.__ui07Smoke.error,
    };
  });
  assert.equal(
    loadEvidence.loaded,
    true,
    `UI-07 unison fixture failed to load: ${JSON.stringify({
      uploadStatus:loadEvidence.uploadResult?.status,
      uploadRoute:loadEvidence.uploadResult?.route,
      uploadIssues:loadEvidence.uploadResult?.preflight?.issues,
      lastError:loadEvidence.snapshot?.lastError,
      smokeError:loadEvidence.smokeError,
    })}`,
  );
  await page.waitForFunction(
    () => window.__ui07Smoke?.error
      || (window.__workbench?.snapshot().scoreLoaded === true
        && document.querySelectorAll('[data-role="score"] svg').length > 0),
    {timeout:30000},
  );

  const initial = await page.evaluate(() => {
    const state = window.__workbench.snapshot();
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const bar = notation.bars[0];
    const active = bar.voices.filter(voice => voice.beats.some(beat => beat.notes?.length));
    return {
      route:state.runtimeResult.route,
      sourceSha:state.sourceSha256,
      activeVoiceCount:active.length,
      midiByVoice:active.map(voice => voice.beats.flatMap(beat => beat.notes).map(note => note.realValue)),
    };
  });
  assert.equal(initial.route, 'POLY_V2');
  assert.match(initial.sourceSha, /^[0-9a-f]{64}$/);
  assert.equal(initial.activeVoiceCount, 2);
  assert.deepEqual(initial.midiByVoice.map(values => values[0]), [60, 60]);

  const selectedByVoice = await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const active = notation.bars[0].voices.filter(voice => voice.beats.some(beat => beat.notes?.length));
    return active.map(voice => {
      const note = voice.beats.flatMap(beat => beat.notes).find(candidate => candidate.realValue === 60);
      const accepted = window.__workbench.selectNote(note);
      return {accepted,snapshot:window.__workbench.snapshot()};
    });
  });
  assert.equal(selectedByVoice.length, 2);
  assert.equal(selectedByVoice[0].accepted, true);
  assert.equal(selectedByVoice[1].accepted, true);
  assert.equal(selectedByVoice[0].snapshot.selectedEvent.voice, '1');
  assert.equal(selectedByVoice[1].snapshot.selectedEvent.voice, '2');
  assert.notEqual(
    selectedByVoice[0].snapshot.selectedEvent.sourceEventId,
    selectedByVoice[1].snapshot.selectedEvent.sourceEventId,
  );
  assert.deepEqual(selectedByVoice[0].snapshot.selectedEvent.sourceTieEventIds, [
    selectedByVoice[0].snapshot.selectedEvent.sourceEventId,
  ]);
  assert.deepEqual(selectedByVoice[1].snapshot.selectedEvent.sourceTieEventIds, [
    selectedByVoice[1].snapshot.selectedEvent.sourceEventId,
  ]);

  const targetIdentity = selectedByVoice[1].snapshot.selectedEvent;
  const peerIdentity = selectedByVoice[0].snapshot.selectedEvent;
  await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const active = notation.bars[0].voices.filter(voice => voice.beats.some(beat => beat.notes?.length));
    const note = active[1].beats.flatMap(beat => beat.notes).find(candidate => candidate.realValue === 60);
    if (!window.__workbench.selectNote(note)) throw new Error('second unison voice did not map');
  });
  await page.select('[data-role="edit-step"]', 'D');
  await page.select('[data-role="edit-alter"]', '0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');

  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true,
    {timeout:30000},
  );

  const edited = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    smoke:window.__ui07Smoke,
  }));
  assert.equal(edited.smoke.error, null);
  assert.equal(edited.smoke.uploadCalls, 1);
  assert.equal(edited.smoke.polyEditCalls, 1);
  assert.equal(edited.smoke.monoEditCalls, 0);
  assert.deepEqual(
    edited.smoke.lastUiCommands[0].sourceTieEventIds,
    [targetIdentity.sourceEventId],
  );
  assert.equal(Object.hasOwn(edited.smoke.lastRuntimeCommands[0], 'sourceTieEventIds'), false);
  assert.equal(edited.snapshot.runtimeResult.status, 'PASS');
  assert.equal(edited.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(edited.snapshot.runtimeResult.contractVersion, '1.0.0');
  assert.equal(
    edited.snapshot.runtimeResult.revision.appliedEdits[0].commandType,
    'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH',
  );

  const canonical = edited.snapshot.runtimeResult.canonicalTabResult;
  const target = canonical.measures[0].events.find(
    event => event.sourceEventId === targetIdentity.sourceEventId,
  );
  const peer = canonical.measures[0].events.find(
    event => event.sourceEventId === peerIdentity.sourceEventId,
  );
  assert.equal(target.pitch.written, 'D4');
  assert.equal(peer.pitch.written, 'C4');
  assert.deepEqual(errors, []);

  process.stdout.write(`${JSON.stringify({
    status:'PASS',
    route:edited.snapshot.runtimeResult.route,
    unisonVoices:selectedByVoice.map(entry => entry.snapshot.selectedEvent.voice),
    runtimeContract:edited.snapshot.runtimeResult.contractVersion,
    retainedTieAuthority:'BLOCKED_UPSTREAM',
    monoEditCalls:edited.smoke.monoEditCalls,
  })}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
