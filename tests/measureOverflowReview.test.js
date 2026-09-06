'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { EDIT_CLASS, createOriginalSourceSnapshot, createReviewRevision } = require('../src/app/teacherCorrectionRevision');
const { createReviewEditorSession, selectReviewEditorIssue } = require('../src/app/reviewEditorBackend');

function score(duration = 8) {
  return `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1">
  <attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
  <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
  <backup><duration>4</duration></backup><forward><duration>4</duration></forward>
  <note><pitch><step>E</step><octave>3</octave></pitch><duration>${duration}</duration><voice>2</voice><type>${duration === 8 ? 'half' : 'quarter'}</type></note>
  </measure></part></score-partwise>`;
}

test('measure overflow opens for teacher review without source mutation or canonical output', () => {
  const bytes = Buffer.from(score());
  const original = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'overflow.musicxml', bytes });
  assert.equal(first.status, 'REVIEW_REQUIRED');
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.preflight.canOpenForReview, true);
  assert.equal(first.preflight.canProcess, false);
  assert.equal(first.reviewState.canOpenForReview, true);
  assert.equal(first.preflight.issues[0].details.reason, 'MEASURE_EVENT_OVERFLOW');
  assert.equal(first.preflight.issues[0].details.endDivisions, 12);
  assert.equal(first.preflight.issues[0].details.expectedDurationDivisions, 8);
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.deepEqual(first, processMusicXmlUpload({ fileName: 'overflow.musicxml', bytes }));
  assert.deepEqual(bytes, original);
  const source = createOriginalSourceSnapshot({
    source_id: 'overflow-source', byte_length: bytes.length, sha256: first.input.sha256,
    media_type: 'application/vnd.recordare.musicxml+xml', provenance: { fixture: true },
  });
  const revision = createReviewRevision(source, {
    revision_id: 'overflow-review', actor: 'teacher', timestamp: '2026-09-06T00:00:00.000Z',
    reason: 'Review measure overflow', review_evidence: first.reviewState, provenance: { fixture: true },
  });
  const session = createReviewEditorSession({
    sessionId: 'overflow-session', reviewState: first.reviewState, reviewRevision: revision,
    adapterManifest: {
      contractVersion: '1.0.0', adapterId: 'test-adapter',
      capabilities: Object.fromEntries(Object.values(EDIT_CLASS).map((key) => [key, 'BOUNDED'])),
      history: { undo: true, redo: true }, revalidate: true,
    },
    adapterState: {},
  });
  assert.equal(session.phase, 'EDITING');
  const issueId = first.reviewState.issues[0].reviewEvidence.issue_id;
  assert.equal(selectReviewEditorIssue(session, issueId).selected_issue_id, issueId);
});

test('strict projection still rejects overflow; explicitly corrected timing can produce TAB', () => {
  assert.throws(() => projectParsedMusicXmlToPolyphonicSourceModel(parseParsedMusicXmlDocument(score())), { code: 'INVALID_MUSICXML' });
  const result = processMusicXmlUpload({ fileName: 'corrected.musicxml', bytes: Buffer.from(score(4)) });
  assert.equal(result.status, 'PASS');
  assert.ok(result.canonicalTabResult);
  assert.ok(result.musicXml);
});

test('other invalid XML and unsafe input do not acquire overflow review authority', () => {
  for (const xml of [score(-1), score().replace('<backup><duration>4', '<backup><duration>40'), '<score-partwise><broken>', '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>']) {
    const result = processMusicXmlUpload({ fileName: 'invalid.musicxml', bytes: Buffer.from(xml) });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.canonicalTabResult, null);
    assert.equal(result.musicXml, null);
  }
});

test('TAB mirror overflow review identifies the original staff-2 source event', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const generated = processMusicXmlUpload({ fileName: 'poly.musicxml', bytes: fs.readFileSync(path.join(__dirname, 'fixtures/pa12-polyphonic-e2e.musicxml')) });
  assert.equal(generated.status, 'PASS');
  const staffIndex = generated.musicXml.indexOf('<staff>2</staff>');
  const noteStart = generated.musicXml.lastIndexOf('<note', staffIndex);
  const durationStart = generated.musicXml.indexOf('<duration>', noteStart) + '<duration>'.length;
  const durationEnd = generated.musicXml.indexOf('</duration>', durationStart);
  const xml = generated.musicXml.slice(0, durationStart) + '1000' + generated.musicXml.slice(durationEnd);
  const parsed = parseParsedMusicXmlDocument(xml);
  const measure = parsed.root.children.find(n => n.name === 'part').children.find(n => n.name === 'measure');
  const notes = measure.children.filter(n => n.name === 'note');
  const expectedIndex = notes.findIndex(n => n.children.some(c => c.name === 'staff' && c.text === '2'));
  const result = processMusicXmlUpload({ fileName: 'mirror.musicxml', bytes: Buffer.from(xml) });
  assert.equal(result.status, 'REVIEW_REQUIRED');
  const evidence = result.reviewState.issues[0].reviewEvidence;
  assert.equal(evidence.staff, 2);
  assert.equal(evidence.event_id_or_location.eventIndex, expectedIndex);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});
