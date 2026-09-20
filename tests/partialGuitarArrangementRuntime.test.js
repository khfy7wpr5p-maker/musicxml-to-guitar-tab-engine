'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  PROCESSING_ABORTED,
  PROCESSING_DEADLINE_EXCEEDED,
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const { positionToMidi } = require('../src/guitar/fretboard');
const { createGuitarConfiguration } = require('../src/guitar/tuning');

function densePianoChord({
  pitches = [
    ['C', 3], ['G', 3], ['C', 4], ['E', 4], ['G', 4], ['C', 5],
  ],
  staffDetails = '',
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves>${staffDetails}</attributes>
    ${pitches.map(([step, octave, alter = 0], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step>${alter === 0 ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`).join('')}
  </measure></part>
</score-partwise>`;
}

function staffDetails(tuningLowToHigh, capoFret) {
  const pitch = /^([A-G])(\d)$/;
  const tuningXml = tuningLowToHigh.map((written, index) => {
    const [, step, octave] = pitch.exec(written);
    return `<staff-tuning line="${index + 1}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`;
  }).join('');
  return `<staff-details><staff-lines>6</staff-lines>${tuningXml}<capo>${capoFret}</capo></staff-details>`;
}

test('dense piano input becomes an explicit provisional TAB instead of a solver hard block', () => {
  const request = {
    fileName: 'dense-piano.musicxml',
    bytes: Buffer.from(densePianoChord()),
  };
  const first = processMusicXmlUpload(request);
  const second = processMusicXmlUpload(request);

  assert.equal(first.status, 'REVIEW_REQUIRED');
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.arrangementArtifact.documentType, 'PartialGuitarTabArrangement');
  assert.equal(first.arrangementArtifact.contractVersion, '1.1.0');
  assert.equal(first.arrangementArtifact.authority, 'PROVISIONAL_REVIEW_ONLY');
  assert.equal(first.arrangementArtifact.policy, 'MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0');
  assert.equal(first.arrangementArtifact.sourceNoteCount, 6);
  assert.ok(first.arrangementArtifact.assignedNoteCount >= 4);
  assert.equal(
    first.arrangementArtifact.noteDispositions.length,
    first.arrangementArtifact.sourceNoteCount,
  );
  assert.deepEqual(
    first.arrangementArtifact.recovery.attempts.map((entry) => entry.retainedNoteCap),
    [...new Set(first.arrangementArtifact.recovery.attempts.map(
      (entry) => entry.retainedNoteCap,
    ))],
  );
  assert.equal(first.arrangementArtifact.recovery.attempts.at(-1).outcome, 'SELECTED');
  if (first.arrangementArtifact.recovery.retainedNoteCap >= 2) {
    for (const sourceEventId of ['P1:measure:0:note:0', 'P1:measure:0:note:5']) {
      const anchor = first.arrangementArtifact.noteDispositions.find(
        (entry) => entry.sourceEventId === sourceEventId,
      );
      assert.ok(anchor);
      assert.notEqual(anchor.disposition, 'UNASSIGNED');
    }
  }
  const allowedReductionReasons = new Set([
    'GUITAR_CAPACITY_REDUCTION',
    'DUPLICATE_TARGET_PITCH_REDUCTION',
    'GRACE_TIMING_REQUIRES_REVIEW',
  ]);
  for (const entry of first.arrangementArtifact.noteDispositions) {
    if (entry.disposition === 'UNASSIGNED') assert.ok(allowedReductionReasons.has(entry.reasonCode));
  }
  assert.match(first.musicXml, /<sign>TAB<\/sign>/);
  assert.equal(first.capabilities.renderScore, true);
  assert.equal(first.capabilities.generateTab, true);
  assert.equal(first.capabilities.editPitch, true);
  assert.equal(first.capabilities.assignTabPosition, true);
  assert.equal(first.capabilities.playback, 'APPROXIMATE');
  assert.equal(first.capabilities.export, false);
  assert.equal(first.issues[0].affectsTab, true);
  assert.equal(first.artifacts.provisionalTabAvailable, true);
  assert.equal(first.artifacts.reviewEditableProjectionAvailable, true);
  assert.equal(first.artifacts.canonicalTabAvailable, false);
  assert.equal(first.reviewEditableProjection.documentType, 'ReviewEditableTabProjection');
  assert.equal(first.reviewEditableProjection.contractVersion, '1.1.0');
  assert.equal(first.reviewEditableProjection.authority, 'PROVISIONAL_REVIEW_ONLY');
  assert.equal(first.reviewEditableProjection.sourceUploadSha256, first.input.sha256);
  assert.equal(first.reviewEditableProjection.measures[0].events.length, 6);
  assert.equal(
    first.reviewEditableProjection.noteDispositions.filter(
      (entry) => entry.assignmentEligible === true,
    ).length,
    first.arrangementArtifact.unassignedNoteCount,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first, second);
});

test('physically impossible seven-note sonority is reduced to explicit review-only TAB', () => {
  const pitches = [
    ['C', 3], ['D', 3], ['E', 3], ['F', 3], ['G', 3], ['A', 3], ['B', 3],
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${pitches.map(([step, octave], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`).join('')}
  </measure></part>
</score-partwise>`;
  const result = processMusicXmlUpload({
    fileName: 'seven-note-piano.musicxml',
    bytes: Buffer.from(xml),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION');
  assert.equal(result.preflight.issues[0].details.reason, 'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE');
  assert.equal(result.arrangementArtifact.sourceNoteCount, 7);
  assert.ok(result.arrangementArtifact.assignedNoteCount > 0);
  assert.ok(result.arrangementArtifact.unassignedNoteCount > 0);
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.export, false);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
});

test('retries retained-note caps in descending order until the first playable low-register texture', () => {
  const bytes = Buffer.from(densePianoChord({
    pitches: [
      ['E', 2], ['F', 2], ['F', 2, 1], ['G', 2], ['G', 2, 1], ['A', 2],
    ],
  }));
  const original = Buffer.from(bytes);
  const result = processMusicXmlUpload({ fileName: 'low-chromatic-piano.musicxml', bytes });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  const attempts = result.arrangementArtifact.recovery.attempts;
  assert.ok(attempts.length > 1);
  assert.equal(attempts[0].retainedNoteCap, 6);
  assert.equal(attempts.at(-1).outcome, 'SELECTED');
  for (let index = 1; index < attempts.length; index += 1) {
    assert.equal(attempts[index].retainedNoteCap, attempts[index - 1].retainedNoteCap - 1);
  }
  assert.deepEqual(bytes, original);
});

test('processing cancellation inside the first R9 candidate stops lower-cap retries', () => {
  const controller = new AbortController();
  let selectionCheckpointCount = 0;
  const runtime = createProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'melody-bass-policy:select-group') {
          selectionCheckpointCount += 1;
          controller.abort();
        }
        return 0;
      },
    },
  );
  const result = processMusicXmlUpload({
    fileName: 'cancelled-dense-piano.musicxml',
    bytes: Buffer.from(densePianoChord()),
  }, {}, runtime);

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, PROCESSING_ABORTED);
  assert.equal(result.arrangementArtifact, undefined);
  assert.equal(selectionCheckpointCount, 1);
});

test('processing deadline inside the first R9 candidate stops lower-cap retries', () => {
  let selectionCheckpointCount = 0;
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => {
        if (phase === 'melody-bass-policy:select-group') {
          selectionCheckpointCount += 1;
          return 11;
        }
        return 0;
      },
    },
  );
  const result = processMusicXmlUpload({
    fileName: 'deadline-dense-piano.musicxml',
    bytes: Buffer.from(densePianoChord()),
  }, {}, runtime);

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, PROCESSING_DEADLINE_EXCEEDED);
  assert.equal(result.arrangementArtifact, undefined);
  assert.equal(selectionCheckpointCount, 1);
});

test('R9 delegates DADGAD capo positions to the configured physical fretboard', () => {
  const tuningLowToHigh = ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'];
  const result = processMusicXmlUpload({
    fileName: 'dadgad-capo-dense.musicxml',
    bytes: Buffer.from(densePianoChord({
      staffDetails: staffDetails(tuningLowToHigh, 1),
    })),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  const configuration = createGuitarConfiguration({
    tuning: [
      { number: 6, pitch: 'D2', midi: 38 },
      { number: 5, pitch: 'A2', midi: 45 },
      { number: 4, pitch: 'D3', midi: 50 },
      { number: 3, pitch: 'G3', midi: 55 },
      { number: 2, pitch: 'A3', midi: 57 },
      { number: 1, pitch: 'D4', midi: 62 },
    ],
    capoFret: 1,
  });
  for (const entry of result.arrangementArtifact.noteDispositions) {
    if (!entry.selectedPosition) continue;
    assert.equal(positionToMidi(entry.selectedPosition, configuration), entry.targetPitch.midi);
  }
  assert.equal(Object.hasOwn(result.arrangementArtifact, 'tuning'), false);
  assert.equal(Object.hasOwn(result.arrangementArtifact, 'capoFret'), false);
});

test('partial recovery keeps extracted grace notes explicit as unassigned review work', () => {
  const xml = densePianoChord().replace(
    '<note><pitch><step>C</step><octave>3</octave>',
    '<note><grace slash="yes"/><pitch><step>B</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff></note>'
      + '<note><pitch><step>C</step><octave>3</octave>',
  );
  const result = processMusicXmlUpload({
    fileName: 'dense-piano-grace.musicxml',
    bytes: Buffer.from(xml),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.arrangementArtifact.sourceNoteCount, 7);
  assert.equal(result.arrangementArtifact.recovery.unassignedGraceNoteCount, 1);
  const grace = result.arrangementArtifact.noteDispositions.find(
    (entry) => entry.reasonCode === 'GRACE_TIMING_REQUIRES_REVIEW',
  );
  assert.ok(grace);
  assert.match(grace.sourceEventId, /:grace:/);
  assert.equal(grace.disposition, 'UNASSIGNED');
  assert.equal(
    result.reviewEditableProjection.noteDispositions.some(
      (entry) => entry.sourceEventId === grace.sourceEventId,
    ),
    false,
  );
});


function repeatedCandidateLimitDyads(measureCount = 500) {
  const measures = [];
  for (let index = 0; index < measureCount; index += 1) {
    measures.push(`<measure number="${index + 1}">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Candidate limit review</part-name></score-part></part-list>
  <part id="P1">${measures.join('')}</part>
</score-partwise>`;
}

function sustainedComplexityFixture(measureCount = 80) {
  const pitches = [['C', 4], ['E', 4], ['G', 4], ['B', 4]];
  const measures = [];

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    let events = '';
    for (let voiceIndex = 0; voiceIndex < pitches.length; voiceIndex += 1) {
      if (voiceIndex > 0) {
        events += '<backup><duration>16</duration></backup>';
        events += `<forward><duration>${voiceIndex}</duration></forward>`;
      }
      const [step, octave] = pitches[voiceIndex];
      events += `<note>
        <pitch><step>${step}</step><octave>${octave}</octave></pitch>
        <duration>${16 - voiceIndex}</duration>
        <voice>${voiceIndex + 1}</voice><staff>1</staff>
      </note>`;
    }
    measures.push(`<measure number="${measureIndex + 1}">
      ${measureIndex === 0 ? '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>' : ''}
      ${events}
    </measure>`);
  }

  return `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Sustained complexity</part-name></score-part></part-list>
    <part id="P1">${measures.join('')}</part>
  </score-partwise>`;
}

test('aggregate voicing candidate ceiling recovers as bounded provisional TAB instead of hard blocking', () => {
  const xml = repeatedCandidateLimitDyads();
  const request = {
    fileName: 'candidate-limit.musicxml',
    bytes: Buffer.from(xml),
  };
  const first = processMusicXmlUpload(request);
  const second = processMusicXmlUpload(request);

  assert.equal(first.status, 'REVIEW_REQUIRED');
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.preflight.issues[0].code, 'GUITAR_VOICING_CANDIDATE_LIMIT_EXCEEDED');
  assert.equal(first.preflight.issues[0].details.limit, 10000);
  assert.equal(first.preflight.issues[0].details.observed, 10001);
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.arrangementArtifact.documentType, 'PartialGuitarTabArrangement');
  assert.equal(first.arrangementArtifact.authority, 'PROVISIONAL_REVIEW_ONLY');
  assert.equal(first.arrangementArtifact.sourceNoteCount, 1000);
  assert.ok(first.arrangementArtifact.assignedNoteCount > 0);
  assert.ok(first.arrangementArtifact.unassignedNoteCount > 0);
  assert.equal(first.capabilities.generateTab, true);
  assert.equal(first.capabilities.playback, 'APPROXIMATE');
  assert.equal(first.capabilities.export, false);
  assert.equal(first.artifacts.provisionalTabAvailable, true);
  assert.equal(first.artifacts.canonicalTabAvailable, false);
  assert.equal(first.sourceArtifact.rendererMusicXml, xml);
  assert.deepEqual(first, second);
});

test('sustained-search complexity recovery remains an authorized provisional TAB', () => {
  const result = processMusicXmlUpload({
    fileName: 'sustained-complexity.musicxml',
    bytes: Buffer.from(sustainedComplexityFixture()),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.issues[0].code, 'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW');
  assert.equal(
    result.preflight.issues[0].details.reason,
    'POSITION_STATE_COMPLEXITY_EXCEEDS_EXACT_SEARCH_BOUNDARY',
  );
  assert.equal(result.arrangementArtifact.recovery.retainedNoteCap, 1);
  assert.deepEqual(
    result.arrangementArtifact.recovery.attempts.map((attempt) => attempt.errorCode),
    [
      'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW',
      'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW',
      'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW',
      'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW',
      'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW',
      null,
    ],
  );
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.artifacts.provisionalTabAvailable, true);
});
