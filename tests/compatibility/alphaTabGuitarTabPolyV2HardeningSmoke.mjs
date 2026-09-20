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
const tiedFixtureBytes = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/ui07-poly-unison-tie.musicxml'),
);
const densePianoBytes = Buffer.from(
  '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>'
  + [['C', 3], ['G', 3], ['C', 4], ['E', 4], ['G', 4], ['C', 5]].map(
    ([step, octave], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`,
  ).join('')
  + '</measure></part></score-partwise>',
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
        <input data-role="edit-duration" type="number" min="1" step="1" value="1" disabled>
        <span data-role="omitted-note-count">0</span>
        <select data-role="omitted-note-list" size="4" disabled></select>
        <button data-role="select-omitted-note" type="button" disabled>Select omitted</button>
        <p data-role="omitted-note-status"></p>
        <select data-role="edit-string" disabled><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select>
        <input data-role="edit-fret" type="number" min="0" max="20" value="0" disabled>
        <button data-role="apply-edit" type="button" disabled>Apply</button>
        <button data-role="apply-duration-edit" type="button" disabled>Apply duration</button>
        <button data-role="apply-position-edit" type="button" disabled>Apply position</button>
        <p data-role="position-edit-status"></p>
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
    lastAuthoritativeEditResult:null,
  };
  const present = payload => payload?.status === 'REVIEW_REQUIRED'
    && payload?.capabilities?.renderScore === true
    && typeof payload?.musicXml === 'string'
    ? {...payload,status:'PASS',canonicalTabResult:payload.canonicalTabResult || payload.reviewEditableProjection}
    : payload;
  const upload = async (file, ownedBytes) => {
    smoke.uploadCalls += 1;
    const response = await fetch('/api/upload?fileName=' + encodeURIComponent(file.name), {
      method:'POST', headers:{'content-type':'application/octet-stream'}, body:ownedBytes
    });
    const payload = await response.json();
    smoke.lastUploadResult = structuredClone(payload);
    if(!response.ok) throw new Error(payload?.message || 'upload failed');
    return present(payload);
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
      sourceTieEventIds:[...command.sourceTieEventIds],
      pitch:{step:command.pitch.step,alter:command.pitch.alter,octave:command.pitch.octave},
      ...(command.selectedPosition ? {selectedPosition:{...command.selectedPosition}} : {}),
      ...(command.durationDivisions === undefined ? {} : {durationDivisions:command.durationDivisions}),
      ...(command.assignmentMode ? {assignmentMode:command.assignmentMode} : {}),
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
    smoke.lastAuthoritativeEditResult = structuredClone(payload);
    if(!response.ok) throw new Error(payload?.message || 'poly edit failed');
    return present(payload);
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
  if (url.pathname === '/tied-fixture.musicxml') {
    response.writeHead(200, {
      'content-type':'application/vnd.recordare.musicxml+xml',
      'content-length':tiedFixtureBytes.length,
    });
    response.end(tiedFixtureBytes);
    return;
  }
  if (url.pathname === '/dense-fixture.musicxml') {
    response.writeHead(200, {
      'content-type':'application/vnd.recordare.musicxml+xml',
      'content-length':densePianoBytes.length,
    });
    response.end(densePianoBytes);
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
  assert.deepEqual(
    edited.smoke.lastRuntimeCommands[0].sourceTieEventIds,
    [targetIdentity.sourceEventId],
  );
  assert.equal(edited.snapshot.runtimeResult.status, 'PASS');
  assert.equal(edited.snapshot.runtimeResult.route, 'POLY_V2');
  assert.equal(edited.snapshot.runtimeResult.contractVersion, '1.4.0');
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

  await page.$eval('[data-role="edit-duration"]', element => { element.value = '2'; });
  await page.click('[data-role="apply-duration-edit"]');
  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 2
      && window.__workbench?.snapshot().scoreLoaded === true,
    {timeout:30000},
  );
  const durationEdited = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    smoke:window.__ui07Smoke,
  }));
  assert.equal(durationEdited.smoke.polyEditCalls, 2);
  assert.equal(durationEdited.smoke.lastRuntimeCommands[1].durationDivisions, 2);
  assert.equal(
    durationEdited.snapshot.runtimeResult.revision.appliedEdits[1].commandType,
    'SET_POLYPHONIC_SOURCE_EVENT_DURATION',
  );
  assert.equal(
    durationEdited.snapshot.runtimeResult.canonicalTabResult.measures[0].events.find(
      event => event.sourceEventId === targetIdentity.sourceEventId,
    ).durationDivisions,
    2,
  );

  const tiedSelection = await page.evaluate(async () => {
    const response = await fetch('/tied-fixture.musicxml');
    const file = new File([await response.arrayBuffer()], 'ui07-poly-unison-tie.musicxml', {
      type:'application/vnd.recordare.musicxml+xml',
    });
    if (!await window.__workbench.loadFile(file)) return {loaded:false};
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(
      voice => voice.beats.flatMap(beat => beat.notes || []),
    );
    for (const note of notes) {
      if (!window.__workbench.selectNote(note)) continue;
      const snapshot = window.__workbench.snapshot();
      if (snapshot.selectedEvent?.sourceTieEventIds?.length === 2) {
        return {
          loaded:true,
          selectedEvent:snapshot.selectedEvent,
          pitchDisabled:document.querySelector('[data-role="apply-edit"]').disabled,
          durationDisabled:document.querySelector('[data-role="apply-duration-edit"]').disabled,
        };
      }
    }
    return {loaded:true,selectedEvent:null};
  });
  assert.equal(tiedSelection.loaded, true);
  assert.ok(tiedSelection.selectedEvent);
  assert.equal(tiedSelection.pitchDisabled, false);
  assert.equal(tiedSelection.durationDisabled, true);
  assert.deepEqual(tiedSelection.selectedEvent.sourceTieEventIds, [
    'P1:measure:0:note:0',
    'P1:measure:1:note:0',
  ]);

  await page.select('[data-role="edit-step"]', 'E');
  await page.select('[data-role="edit-alter"]', '0');
  await page.$eval('[data-role="edit-octave"]', element => { element.value = '4'; });
  await page.click('[data-role="apply-edit"]');
  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true,
    {timeout:30000},
  );
  const tiedEdited = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    smoke:window.__ui07Smoke,
  }));
  const tieIds = tiedSelection.selectedEvent.sourceTieEventIds;
  assert.equal(tiedEdited.smoke.uploadCalls, 2);
  assert.equal(tiedEdited.smoke.polyEditCalls, 3);
  assert.deepEqual(tiedEdited.smoke.lastRuntimeCommands[0].sourceTieEventIds, tieIds);
  assert.equal(
    tiedEdited.snapshot.runtimeResult.revision.appliedEdits[0].commandType,
    'REPLACE_POLYPHONIC_TIE_CHAIN_PITCH',
  );
  assert.deepEqual(
    tiedEdited.snapshot.runtimeResult.canonicalTabResult.measures.flatMap(
      measure => measure.events
        .filter(event => tieIds.includes(event.sourceEventId))
        .map(event => event.pitch.written),
    ),
    ['E4', 'E4'],
  );
  assert.match(tiedEdited.snapshot.runtimeResult.musicXml, /<tie type="start"\/>/);
  assert.match(tiedEdited.snapshot.runtimeResult.musicXml, /<tie type="stop"\/>/);

  const denseLoaded = await page.evaluate(async () => {
    const response = await fetch('/dense-fixture.musicxml');
    const file = new File([await response.arrayBuffer()], 'dense-piano.musicxml', {
      type:'application/vnd.recordare.musicxml+xml',
    });
    return window.__workbench.loadFile(file);
  });
  assert.equal(denseLoaded, true);
  await page.waitForFunction(
    () => window.__workbench?.snapshot().scoreLoaded === true
      && document.querySelector('[data-role="omitted-note-list"]')?.options.length === 1,
    {timeout:30000},
  );
  const omittedSelected = await page.evaluate(() => {
    const list = document.querySelector('[data-role="omitted-note-list"]');
    list.value = 'P1:measure:0:note:2';
    const selected = window.__workbench.selectOmittedNote();
    return {
      selected,
      selectedEvent:window.__workbench.snapshot().selectedEvent,
      count:document.querySelector('[data-role="omitted-note-count"]').textContent,
      positionDisabled:document.querySelector('[data-role="apply-position-edit"]').disabled,
    };
  });
  assert.equal(omittedSelected.selected, true);
  assert.equal(omittedSelected.selectedEvent.sourceEventId, 'P1:measure:0:note:2');
  assert.equal(omittedSelected.selectedEvent.assignmentEligible, true);
  assert.equal(omittedSelected.count, '1');
  assert.equal(omittedSelected.positionDisabled, false);

  await page.select('[data-role="edit-string"]', '4');
  await page.$eval('[data-role="edit-fret"]', element => { element.value = '10'; });
  await page.click('[data-role="apply-position-edit"]');
  await page.waitForFunction(
    () => window.__workbench?.snapshot().revisionNumber === 1
      && window.__workbench?.snapshot().scoreLoaded === true
      && document.querySelector('[data-role="omitted-note-list"]')?.options.length === 0,
    {timeout:30000},
  );
  const assigned = await page.evaluate(() => ({
    snapshot:window.__workbench.snapshot(),
    smoke:window.__ui07Smoke,
    remaining:document.querySelector('[data-role="omitted-note-list"]').options.length,
  }));
  assert.equal(assigned.smoke.uploadCalls, 3);
  assert.equal(assigned.smoke.polyEditCalls, 4);
  assert.equal(assigned.smoke.lastRuntimeCommands[0].assignmentMode, 'ASSIGN_OMITTED');
  assert.equal(assigned.smoke.lastRuntimeCommands[0].sourceEventId, 'P1:measure:0:note:2');
  assert.deepEqual(assigned.smoke.lastRuntimeCommands[0].selectedPosition, {string:4,fret:10});
  assert.equal(assigned.smoke.lastAuthoritativeEditResult.status, 'REVIEW_REQUIRED');
  assert.equal(assigned.smoke.lastAuthoritativeEditResult.arrangementArtifact, undefined);
  assert.equal(
    assigned.smoke.lastAuthoritativeEditResult.canonicalTabResult.noteDispositions.length,
    6,
  );
  assert.equal(
    assigned.smoke.lastAuthoritativeEditResult.canonicalTabResult.noteDispositions.every(
      disposition => disposition.disposition === 'KEEP' && disposition.selectedPosition,
    ),
    true,
  );
  assert.deepEqual(
    assigned.smoke.lastAuthoritativeEditResult.canonicalTabResult.noteDispositions.find(
      disposition => disposition.sourceEventId === 'P1:measure:0:note:2',
    ).selectedPosition,
    {string:4,fret:10},
  );
  assert.equal(assigned.remaining, 0);
  assert.deepEqual(errors, []);

  process.stdout.write(`${JSON.stringify({
    status:'PASS',
    route:edited.snapshot.runtimeResult.route,
    unisonVoices:selectedByVoice.map(entry => entry.snapshot.selectedEvent.voice),
    runtimeContract:durationEdited.snapshot.runtimeResult.contractVersion,
    retainedTieAuthority:'ATOMIC_PITCH_V1',
    omittedAssignmentAuthority:'EXPLICIT_TEACHER_STRING_FRET_V1',
    monoEditCalls:edited.smoke.monoEditCalls,
  })}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
