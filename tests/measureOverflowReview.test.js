'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  projectParsedMusicXmlWithMeasureOverflowReview,
} = require('../src/parser/polyphonicMeasureOverflowReviewProjector');

function score(duration = 8) {
  return `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1">
  <attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
  <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
  <backup><duration>4</duration></backup><forward><duration>4</duration></forward>
  <note><pitch><step>E</step><octave>3</octave></pitch><duration>${duration}</duration><voice>2</voice><type>${duration === 8 ? 'half' : 'quarter'}</type></note>
  </measure></part></score-partwise>`;
}


function consensusOverfullScore() {
  return `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
  <measure number="1">
    <attributes><divisions>4</divisions><time><beats>6</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    <note><rest/><duration>28</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>28</duration></backup>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    <backup><duration>28</duration></backup>
    <note><rest/><duration>28</duration><voice>6</voice><staff>2</staff></note>
  </measure>
  <measure number="2">
    <note><rest/><duration>24</duration><voice>1</voice><staff>1</staff></note>
  </measure>
  </part></score-partwise>`;
}


test('consensus overflow projector derives a bounded 7/4 review model and restores 6/4 afterward', () => {
  const parsed = parseParsedMusicXmlDocument(consensusOverfullScore());
  const projection = projectParsedMusicXmlWithMeasureOverflowReview(parsed);

  assert.equal(projection.reviewIssues.length, 1);
  assert.equal(
    projection.reviewIssues[0].details.policy,
    'CONSENSUS_OVERFULL_MEASURE_REVIEW',
  );
  assert.deepEqual(
    projection.sourceModel.measures[0].timeSignature,
    { beats: 7, beatType: 4 },
  );
  assert.equal(projection.sourceModel.measures[0].expectedDurationDivisions, 28);
  assert.deepEqual(
    projection.sourceModel.measures[1].timeSignature,
    { beats: 6, beatType: 4 },
  );
  assert.equal(projection.sourceModel.measures[1].expectedDurationDivisions, 24);
});

test('consensus overfull measure opens review-only provisional TAB without inventing source authority', () => {
  const bytes = Buffer.from(consensusOverfullScore());
  const original = Buffer.from(bytes);
  const result = processMusicXmlUpload({ fileName: 'consensus-overflow.musicxml', bytes });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.artifacts.provisionalTabAvailable, true);
  assert.equal(result.artifacts.canonicalTabAvailable, false);
  assert.equal(result.capabilities.playback, 'APPROXIMATE');
  assert.equal(result.capabilities.export, false);
  assert.ok(result.musicXml);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
  const issue = result.preflight.issues.find(
    (entry) => entry.details?.policy === 'CONSENSUS_OVERFULL_MEASURE_REVIEW',
  );
  assert.ok(issue);
  assert.equal(issue.reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(issue.details.reason, 'MEASURE_EVENT_OVERFLOW');
  assert.equal(issue.details.sourceExpectedDurationDivisions, 24);
  assert.equal(issue.details.provisionalMeasureDurationDivisions, 28);
  assert.equal(issue.details.provisionalTimeSignature.beats, 7);
  assert.equal(issue.details.provisionalTimeSignature.beatType, 4);
  assert.deepEqual(bytes, original);
  assert.deepEqual(
    result,
    processMusicXmlUpload({ fileName: 'consensus-overflow.musicxml', bytes }),
  );
});

test('measure overflow opens with provisional TAB without source mutation', () => {
  const bytes = Buffer.from(score());
  const original = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'overflow.musicxml', bytes });
  assert.equal(first.status, 'REVIEW_REQUIRED');
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.preflight.canOpenForReview, true);
  assert.equal(first.preflight.canProcess, false);
  assert.equal(first.preflight.issues[0].details.reason, 'MEASURE_EVENT_OVERFLOW');
  assert.equal(first.preflight.issues[0].details.endDivisions, 12);
  assert.equal(first.preflight.issues[0].details.expectedDurationDivisions, 8);
  assert.equal(first.capabilities.generateTab, true);
  assert.equal(first.capabilities.export, false);
  assert.ok(first.canonicalTabResult || first.arrangementArtifact);
  assert.ok(first.musicXml);
  assert.deepEqual(first, processMusicXmlUpload({ fileName: 'overflow.musicxml', bytes }));
  assert.deepEqual(bytes, original);
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

test('extreme TAB-mirror overflow remains reviewable without claiming a false TAB artifact', () => {
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
  const issue = result.preflight.issues.find((entry) => entry.details?.reason === 'MEASURE_EVENT_OVERFLOW');
  assert.equal(issue.details.staff, 2);
  assert.ok(issue.location.eventIndex >= expectedIndex);
  assert.equal(result.capabilities.generateTab, false);
  assert.equal(result.capabilities.export, false);
  assert.equal(result.musicXml, null);
});
