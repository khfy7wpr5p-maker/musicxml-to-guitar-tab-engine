'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  PROCESSING_ABORTED,
  PROCESSING_DEADLINE_EXCEEDED,
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION,
  POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_AUTHORITY,
  POLYPHONIC_GRACE_TIMING_POLICY,
  POLYPHONIC_GRACE_SOLVER_STATUS,
  extractPolyphonicGraceOrnaments,
  projectParsedMusicXmlWithGraceOrnamentExtraction,
} = require('../src/parser/polyphonicGraceOrnamentExtractor');

function graceNote({
  step = 'F',
  alter = null,
  octave = 4,
  voice = '1',
  staff = '1',
  graceAttributes = 'slash="yes"',
  type = 'eighth',
  stem = 'up',
  beam = null,
  pitchMarkup = null,
  extraChildren = '',
  noteAttributes = '',
  graceMarkup = null,
} = {}) {
  const pitch = pitchMarkup ?? `<pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch>`;
  const grace = graceMarkup ?? `<grace ${graceAttributes}/>`;
  const stemMarkup = stem === null ? '' : `<stem>${stem}</stem>`;
  const beamMarkup = beam === null ? '' : `<beam number="1">${beam}</beam>`;
  return `<note${noteAttributes ? ` ${noteAttributes}` : ''}>${grace}${pitch}<voice>${voice}</voice><type>${type}</type>${stemMarkup}<staff>${staff}</staff>${beamMarkup}${extraChildren}</note>`;
}

function normalNote({
  step = 'F',
  alter = null,
  octave = 4,
  duration = 4,
  voice = '1',
  staff = '1',
  type = 'whole',
  extraChildren = '',
} = {}) {
  return `<note><pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff>${extraChildren}</note>`;
}

function measure({ number = '1', divisions = 1, beats = 4, notes = '' } = {}) {
  return `<measure number="${number}"><attributes><divisions>${divisions}</divisions><time><beats>${beats}</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>${notes}</measure>`;
}

function score({ measures, extraScoreParts = '', extraParts = '' }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part>${extraScoreParts}</part-list>
  <part id="P1">${measures}</part>${extraParts}
</score-partwise>`;
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(xml);
}

function singleGraceScore(overrides = {}) {
  const grace = graceNote(overrides.grace ?? {});
  const anchor = normalNote(overrides.anchor ?? {});
  return score({ measures: measure({ notes: `${grace}${anchor}` }) });
}

function bwvGracePairScore() {
  const first = graceNote({ step: 'F', octave: 4, beam: 'begin' });
  const second = graceNote({ step: 'G', octave: 4, beam: 'end' });
  const anchor = normalNote({ step: 'F', octave: 4, duration: 36, type: 'whole' });
  return score({
    measures: measure({ number: '11', divisions: 9, notes: `${first}${second}${anchor}` }),
  });
}

function errorCode(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  assert.fail('Expected an error.');
}

test('PS-6B6A extracts an exact slash=yes single grace event without inventing timing', () => {
  const result = projectParsedMusicXmlWithGraceOrnamentExtraction(parsed(singleGraceScore()));
  const group = result.graceOrnamentGroups[0];
  const ornament = group.notes[0];

  assert.equal(POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_AUTHORITY,
    'ORDER_ONLY_GRACE_MUSICAL_MATERIAL_PRESERVATION',
  );
  assert.equal(
    POLYPHONIC_GRACE_TIMING_POLICY,
    'NO_NUMERIC_DURATION_WITHOUT_MUSICXML_STEAL_OR_MAKE_TIME',
  );
  assert.equal(result.solverCompatibility, POLYPHONIC_GRACE_SOLVER_STATUS.BLOCKED_PENDING_PHYSICAL_INTEGRATION);
  assert.equal(group.kind, 'slashed-single-eighth-grace');
  assert.equal(group.notes.length, 1);
  assert.equal(ornament.pitch.written, 'F4');
  assert.equal(ornament.pitch.midi, 65);
  assert.equal(ornament.voice, '1');
  assert.equal(ornament.staff, 1);
  assert.equal(ornament.slash, 'yes');
  assert.equal(ornament.nominalType, 'eighth');
  assert.equal(ornament.beam, null);
  assert.equal(Object.hasOwn(ornament, 'duration'), false);
  assert.equal(Object.hasOwn(ornament, 'durationDivisions'), false);
  assert.equal(Object.hasOwn(ornament, 'onsetDivisions'), false);
});

test('PS-6B6A preserves the exact BWV-shaped F4 -> G4 ordered pair and following F4 duration=36 anchor', () => {
  const result = projectParsedMusicXmlWithGraceOrnamentExtraction(parsed(bwvGracePairScore()));
  const group = result.graceOrnamentGroups[0];

  assert.equal(group.kind, 'slashed-two-note-eighth-grace-sequence');
  assert.equal(group.measureIndex, 0);
  assert.equal(group.measureNumber, '11');
  assert.deepEqual(group.notes.map((event) => event.pitch.written), ['F4', 'G4']);
  assert.deepEqual(group.notes.map((event) => event.pitch.midi), [65, 67]);
  assert.deepEqual(group.notes.map((event) => event.originalSourceOrder), [0, 1]);
  assert.deepEqual(group.notes.map((event) => event.orderIndex), [0, 1]);
  assert.deepEqual(group.notes.map((event) => event.beam), ['begin', 'end']);
  assert.deepEqual(group.notes.map((event) => event.voice), ['1', '1']);
  assert.deepEqual(group.notes.map((event) => event.staff), [1, 1]);
  assert.equal(group.anchor.originalSourceOrder, 2);
  assert.equal(group.anchor.projectedSourceOrder, 0);
  assert.equal(group.anchor.projectedSourceEventId, 'P1:measure:0:note:0');

  const anchor = result.mainSourceModel.measures[0].events[0];
  assert.equal(anchor.sourceEventId, group.anchor.projectedSourceEventId);
  assert.equal(anchor.pitch.written, 'F4');
  assert.equal(anchor.onsetDivisions, 0);
  assert.equal(anchor.durationDivisions, 36);
  assert.deepEqual(result.musicalMaterialAccounting, {
    originalNoteElementCount: 3,
    mainProjectedEventCount: 1,
    extractedGraceEventCount: 2,
    reconciledNoteElementCount: 3,
    reconciled: true,
  });
});

test('PS-6B6A preserves grace provenance and never adds duration fields to sidecar events', () => {
  const result = extractPolyphonicGraceOrnaments(parsed(bwvGracePairScore()));
  const [first, second] = result.graceOrnamentGroups[0].notes;

  assert.deepEqual(first.source, {
    partId: 'P1',
    measureIndex: 0,
    measureNumber: '11',
    sourceOrder: 0,
  });
  assert.deepEqual(second.source, {
    partId: 'P1',
    measureIndex: 0,
    measureNumber: '11',
    sourceOrder: 1,
  });
  for (const event of [first, second]) {
    assert.equal(Object.hasOwn(event, 'duration'), false);
    assert.equal(Object.hasOwn(event, 'durationDivisions'), false);
    assert.equal(Object.hasOwn(event, 'performanceMilliseconds'), false);
  }
});

test('PS-6B6A leaves the ParsedMusicXML authority unchanged and returns immutable sidecar/main data', () => {
  const source = parsed(bwvGracePairScore());
  const before = JSON.stringify(source);
  const result = extractPolyphonicGraceOrnaments(source);

  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups[0]), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups[0].notes), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups[0].notes[0]), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups[0].notes[0].pitch), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups[0].notes[0].source), true);
  assert.equal(Object.isFrozen(result.graceOrnamentGroups[0].anchor), true);
  assert.equal(Object.isFrozen(result.parsedMainDocument.root), true);

  const originalPart = source.root.children.find((child) => child.name === 'part');
  const originalNotes = originalPart.children[0].children.filter((child) => child.name === 'note');
  assert.equal(originalNotes.length, 3);
  assert.equal(originalNotes.slice(0, 2).every((note) => note.children.some((child) => child.name === 'grace')), true);
});

test('PS-6B6A rejects grace duration synthesis and unsupported grace timing attributes fail-closed', () => {
  const unsupportedGraceAttributes = [
    'slash="no"',
    'slash="yes" steal-time-previous="10"',
    'slash="yes" steal-time-following="10"',
    'slash="yes" make-time="1"',
  ];

  for (const graceAttributes of unsupportedGraceAttributes) {
    assert.equal(
      errorCode(() => extractPolyphonicGraceOrnaments(parsed(singleGraceScore({
        grace: { graceAttributes },
      })))),
      'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
    );
  }

  assert.equal(
    errorCode(() => extractPolyphonicGraceOrnaments(parsed(singleGraceScore({
      grace: { extraChildren: '<duration>1</duration>' },
    })))),
    'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
  );
});

test('PS-6B6A rejects malformed grace, grace rest, grace chord and oversized grace chains', () => {
  const malformed = singleGraceScore({
    grace: { graceMarkup: '<grace slash="yes"/><grace slash="yes"/>' },
  });
  const graceRest = singleGraceScore({
    grace: { pitchMarkup: '<rest/>' },
  });
  const graceChord = singleGraceScore({
    grace: { extraChildren: '<chord/>' },
  });
  const triple = score({
    measures: measure({
      notes: `${graceNote({ step: 'E', beam: 'begin' })}${graceNote({ step: 'F', beam: 'continue' })}${graceNote({ step: 'G', beam: 'end' })}${normalNote()}`,
    }),
  });

  for (const xml of [malformed, graceRest, graceChord, triple]) {
    assert.equal(
      errorCode(() => extractPolyphonicGraceOrnaments(parsed(xml))),
      'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
    );
  }
});

test('PS-6B6A rejects unsupported scalar/beam attributes instead of silently normalizing them', () => {
  const voiceAttribute = singleGraceScore({
    grace: {
      graceMarkup: '<grace slash="yes"/>',
      extraChildren: '',
    },
  }).replace('<voice>1</voice>', '<voice id="unexpected">1</voice>');
  const badBeam = score({
    measures: measure({
      notes: `${graceNote({ step: 'F', beam: 'begin' }).replace('number="1"', 'number="2"')}${graceNote({ step: 'G', beam: 'end' })}${normalNote()}`,
    }),
  });

  for (const xml of [voiceAttribute, badBeam]) {
    assert.equal(
      errorCode(() => extractPolyphonicGraceOrnaments(parsed(xml))),
      'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
    );
  }
});

test('PS-6B6A rejects partial integer pitch scalars instead of truncating musical material', () => {
  const fractionalOctave = singleGraceScore({
    grace: { pitchMarkup: '<pitch><step>F</step><octave>4.5</octave></pitch>' },
  });
  const trailingAlterText = singleGraceScore({ grace: { alter: '1junk' } });

  for (const xml of [fractionalOctave, trailingAlterText]) {
    assert.equal(
      errorCode(() => extractPolyphonicGraceOrnaments(parsed(xml))),
      'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
    );
  }
});

test('PS-6B6A records anchor notation markers against projected main-event source order', () => {
  const anchor = normalNote({
    extraChildren: '<notations><fermata/><articulations><staccato/></articulations></notations>',
  });
  const xml = score({ measures: measure({ notes: `${graceNote()}${anchor}` }) });
  const result = projectParsedMusicXmlWithGraceOrnamentExtraction(parsed(xml));

  assert.equal(result.graceOrnamentGroups[0].anchor.originalSourceOrder, 1);
  assert.equal(result.graceOrnamentGroups[0].anchor.projectedSourceOrder, 0);
  assert.equal(result.fermataMarkers[0].sourceOrder, 0);
  assert.equal(result.staccatoMarkers[0].sourceOrder, 0);
  assert.equal(result.mainSourceModel.measures[0].events[0].sourceOrder, 0);
});

test('PS-6B6A records triplet provenance against projected main-event source orders', () => {
  const triplet = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  const tuplet = (value) => `<notations><tuplet ${value}/></notations>`;
  const first = normalNote({
    step: 'C', duration: 2, type: 'eighth',
    extraChildren: `${triplet}${tuplet('type="start" bracket="no"')}`,
  });
  const second = normalNote({ step: 'D', duration: 2, type: 'eighth', extraChildren: triplet });
  const third = normalNote({
    step: 'E', duration: 2, type: 'eighth',
    extraChildren: `${triplet}${tuplet('type="stop"')}`,
  });
  const rest = '<note><rest/><duration>6</duration><voice>1</voice><type>half</type><staff>1</staff></note>';
  const xml = score({
    measures: measure({
      divisions: 3,
      notes: `${graceNote({ step: 'B', octave: 3 })}${first}${second}${third}${rest}`,
    }),
  });
  const result = projectParsedMusicXmlWithGraceOrnamentExtraction(parsed(xml));

  assert.deepEqual(
    result.tripletTimeModificationMarkers.map((marker) => marker.sourceOrder),
    [0, 1, 2],
  );
  assert.deepEqual(
    result.tripletDisplayMarkers.map((marker) => marker.sourceOrder),
    [0, 2],
  );
  assert.deepEqual(
    result.mainSourceModel.measures[0].events.map((event) => event.sourceOrder),
    [0, 1, 2, 3],
  );
});

test('PS-6B6A requires grace and following anchor to remain in the same voice/staff lane', () => {
  const voiceMismatch = singleGraceScore({ anchor: { voice: '2' } });
  const staffMismatch = singleGraceScore({ anchor: { staff: '2' } });

  for (const xml of [voiceMismatch, staffMismatch]) {
    assert.equal(
      errorCode(() => extractPolyphonicGraceOrnaments(parsed(xml))),
      'INVALID_POLYPHONIC_GRACE_ORNAMENT',
    );
  }
});

test('PS-6B6A fails closed on multi-part provenance ambiguity', () => {
  const xml = score({
    measures: measure({ notes: `${graceNote()}${normalNote()}` }),
    extraScoreParts: '<score-part id="P2"><part-name>Other</part-name></score-part>',
    extraParts: `<part id="P2">${measure({ notes: normalNote() })}</part>`,
  });

  assert.throws(
    () => extractPolyphonicGraceOrnaments(parsed(xml)),
    (error) => (
      error.code === 'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT'
      || error.code === 'UNSUPPORTED_POLYPHONIC_TRIPLET_DISPLAY'
    ),
  );
});

test('PS-6B6A observes processing deadlines at bounded extraction checkpoints', () => {
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => phase === 'polyphonic-grace-ornament-extractor:note' ? 11 : 0,
    },
  );

  assert.throws(
    () => extractPolyphonicGraceOrnaments(parsed(singleGraceScore()), runtime),
    (error) => (
      error.code === PROCESSING_DEADLINE_EXCEEDED
      && error.details.phase === 'polyphonic-grace-ornament-extractor:note'
    ),
  );
});

test('PS-6B6A observes cancellation before returning any extraction result', () => {
  const controller = new AbortController();
  controller.abort();
  const runtime = createProcessingRuntime({ signal: controller.signal }, { clock: () => 0 });

  assert.throws(
    () => extractPolyphonicGraceOrnaments(parsed(singleGraceScore()), runtime),
    (error) => (
      error.code === PROCESSING_ABORTED
      && error.details.phase === 'polyphonic-grace-ornament-extractor:start'
    ),
  );
});

test('PS-6B6A enforces the fixed grace group/event resource boundary', () => {
  const measures = [];
  for (let index = 0; index < 129; index += 1) {
    measures.push(measure({
      number: String(index + 1),
      notes: `${graceNote()}${normalNote()}`,
    }));
  }
  const xml = score({ measures: measures.join('') });

  assert.equal(
    errorCode(() => extractPolyphonicGraceOrnaments(parsed(xml))),
    'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
  );
});

test('PS-6B6A reports MAIN_SOURCE_COMPLETE when no grace musical material exists', () => {
  const xml = score({ measures: measure({ notes: normalNote() }) });
  const result = projectParsedMusicXmlWithGraceOrnamentExtraction(parsed(xml));

  assert.equal(result.graceOrnamentGroups.length, 0);
  assert.equal(result.solverCompatibility, POLYPHONIC_GRACE_SOLVER_STATUS.MAIN_SOURCE_COMPLETE);
  assert.deepEqual(result.musicalMaterialAccounting, {
    originalNoteElementCount: 1,
    mainProjectedEventCount: 1,
    extractedGraceEventCount: 0,
    reconciledNoteElementCount: 1,
    reconciled: true,
  });
});

test('PS-6B6A remains package-root internal and does not widen the public API', () => {
  const names = [
    'extractPolyphonicGraceOrnaments',
    'projectParsedMusicXmlWithGraceOrnamentExtraction',
    'POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION',
    'POLYPHONIC_GRACE_SOLVER_STATUS',
  ];
  for (const name of names) assert.equal(publicApi[name], undefined);
});
