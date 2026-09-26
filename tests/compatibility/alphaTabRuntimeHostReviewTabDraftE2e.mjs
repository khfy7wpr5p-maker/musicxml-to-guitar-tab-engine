import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const { createRuntimeHttpServer } = require('../../src/app/runtimeHttpHost');

const browserExecutable = process.env.BROWSER_EXECUTABLE;
assert.ok(browserExecutable && fs.existsSync(browserExecutable));

const alphaTabEntry = require.resolve('@coderline/alphatab');
const alphaTabDist = path.dirname(alphaTabEntry);
const fixturePath = path.join(repositoryRoot, 'tests/fixtures/edtab-03-review-draft.musicxml');

const server = createRuntimeHttpServer({
  repositoryRoot,
  alphaTabEntry,
  alphaTabDist,
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
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 1100, deviceScaleFactor: 1});
  const messages = [];
  const apiRequests = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(`${request.method()} ${url.pathname}`);
  });

  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(`${origin}/workbench/`, {waitUntil: 'networkidle0', timeout: 30000});
  await page.waitForFunction(
    () => Boolean(window.__workbenchHost && window.__workbench),
    {timeout: 10000},
  );

  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('[data-role="runtime-upload-action"]'),
  ]);
  await chooser.accept([fixturePath]);

  await page.waitForFunction(
    () => {
      const snapshot = window.__workbench?.snapshot();
      return snapshot?.scoreLoaded === true
        && snapshot?.runtimeResult?.status === 'REVIEW_REQUIRED'
        && snapshot?.runtimeResult?.reviewTabDraft?.documentType === 'ReviewTabDraft'
        && document.querySelectorAll('[data-role="score"] svg').length > 0
        && document.querySelector('[data-role="omitted-note-list"]')?.options.length === 2;
    },
    {timeout: 30000},
  );

  const initial = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    draftText: document.querySelector('[data-role="review-tab-draft"]').textContent,
    draftHidden: document.querySelector('[data-role="review-tab-draft"]').hidden,
    omittedText: document.querySelector('[data-role="omitted-note-list"]').textContent,
    documentStatus: document.querySelector('[data-role="document-status"]').textContent,
  }));
  assert.equal(initial.snapshot.runtimeResult.status, 'REVIEW_REQUIRED');
  assert.equal(initial.snapshot.runtimeResult.capabilities.assignTabPosition, true);
  assert.equal(initial.snapshot.runtimeResult.capabilities.export, false);
  assert.equal(initial.draftHidden, false);
  assert.match(initial.draftText, /Review TAB draft/);
  assert.match(initial.draftText, /Konum atanmamış/);
  assert.match(initial.omittedText, /Measure 9/);
  assert.match(initial.omittedText, /E4/);
  assert.match(initial.omittedText, /Konum atanmamış/);
  assert.equal(initial.documentStatus, 'REVIEW_REQUIRED');

  const clickedSource = await page.evaluate(() => {
    const notation = window.__workbench.api.score.tracks[0].staves[0];
    const notes = notation.bars[0].voices.flatMap(
      voice => voice.beats.flatMap(beat => beat.notes),
    );
    const note = notes.find(candidate => candidate.realValue === 64);
    const accepted = window.__workbench.selectNote(note);
    return {
      accepted,
      snapshot: window.__workbench.snapshot(),
      positionDisabled: document.querySelector('[data-role="apply-position-edit"]').disabled,
    };
  });
  assert.equal(clickedSource.accepted, true);
  assert.equal(clickedSource.snapshot.selectedEvent.reviewTabDraft, true);
  assert.equal(clickedSource.snapshot.selectedEvent.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(clickedSource.snapshot.selectedEvent.visibleMeasureNumber, '9');
  assert.equal(clickedSource.positionDisabled, false);

  await page.select('[data-role="edit-string"]', '1');
  await page.$eval('[data-role="edit-fret"]', element => { element.value = '0'; });
  assert.equal(
    await page.evaluate(() => window.__workbench.applySelectedPositionEdit()),
    true,
  );

  await page.waitForFunction(
    () => {
      const snapshot = window.__workbench?.snapshot();
      return snapshot?.reviewDraftRevisionCommandCount === 1
        && snapshot?.selectedEvent?.selectedPosition?.string === 1
        && snapshot?.selectedEvent?.selectedPosition?.fret === 0;
    },
    {timeout: 10000},
  );

  const assigned = await page.evaluate(() => {
    const snapshot = window.__workbench.snapshot();
    const disposition = snapshot.runtimeResult.reviewTabDraft.perNoteDisposition[0];
    return {
      snapshot,
      disposition,
      draftText: document.querySelector('[data-role="review-tab-draft"]').textContent,
      positionStatus: document.querySelector('[data-role="position-edit-status"]').textContent,
    };
  });
  assert.equal(assigned.snapshot.runtimeResult.status, 'REVIEW_REQUIRED');
  assert.equal(assigned.snapshot.runtimeResult.capabilities.export, false);
  assert.equal(assigned.disposition.disposition, 'ASSIGNED');
  assert.deepEqual(assigned.disposition.selectedPosition, {string: 1, fret: 0});
  assert.match(assigned.draftText, /1 E4 \|\s+0/);
  assert.match(assigned.positionStatus, /backend validated|Current ReviewTabDraft position/);
  assert.equal(
    apiRequests.filter(item => item === 'POST /api/edit/review-tab-draft').length,
    1,
  );

  assert.equal(
    await page.evaluate(() => window.__workbench.undoReviewDraftEdit()),
    true,
  );
  await page.waitForFunction(
    () => window.__workbench?.snapshot().reviewDraftRevisionCommandCount === 0,
    {timeout: 10000},
  );
  const undone = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    disposition: window.__workbench.snapshot().runtimeResult.reviewTabDraft.perNoteDisposition[0],
    draftText: document.querySelector('[data-role="review-tab-draft"]').textContent,
  }));
  assert.equal(undone.disposition.disposition, 'UNASSIGNED');
  assert.equal(undone.disposition.selectedPosition, null);
  assert.equal(undone.snapshot.selectedEvent.sourceEventId, 'P1:measure:0:note:0');
  assert.match(undone.draftText, /Konum atanmamış/);

  assert.equal(
    await page.evaluate(() => window.__workbench.redoReviewDraftEdit()),
    true,
  );
  await page.waitForFunction(
    () => window.__workbench?.snapshot().reviewDraftRevisionCommandCount === 1,
    {timeout: 10000},
  );
  const redone = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    disposition: window.__workbench.snapshot().runtimeResult.reviewTabDraft.perNoteDisposition[0],
  }));
  assert.equal(redone.disposition.disposition, 'ASSIGNED');
  assert.deepEqual(redone.disposition.selectedPosition, {string: 1, fret: 0});
  assert.equal(redone.snapshot.selectedEvent.sourceEventId, 'P1:measure:0:note:0');

  await page.select('[data-role="edit-string"]', '2');
  await page.$eval('[data-role="edit-fret"]', element => { element.value = '0'; });
  assert.equal(
    await page.evaluate(() => window.__workbench.applySelectedPositionEdit()),
    false,
  );
  const blocked = await page.evaluate(() => ({
    snapshot: window.__workbench.snapshot(),
    issueText: document.querySelector('[data-role="issues"]').textContent,
    positionStatus: document.querySelector('[data-role="position-edit-status"]').textContent,
  }));
  assert.equal(blocked.snapshot.runtimeResult.status, 'REVIEW_REQUIRED');
  assert.equal(blocked.snapshot.reviewDraftRevisionCommandCount, 1);
  assert.deepEqual(
    blocked.snapshot.runtimeResult.reviewTabDraft.perNoteDisposition[0].selectedPosition,
    {string: 1, fret: 0},
  );
  assert.match(blocked.issueText, /does not reproduce/i);
  assert.match(blocked.positionStatus, /does not reproduce/i);

  assert.equal(
    apiRequests.filter(item => item === 'POST /api/edit/review-tab-draft').length,
    4,
  );
  assert.deepEqual(
    apiRequests.filter(item => item === 'POST /api/upload'),
    ['POST /api/upload'],
  );

  process.stdout.write(`${JSON.stringify({
    browser: await browser.version(),
    sourceEventId: blocked.snapshot.selectedEvent.sourceEventId,
    revisionCommands: blocked.snapshot.reviewDraftRevisionCommandCount,
    apiRequests,
    browserMessages: messages,
  })}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
