'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  GuitarTechniqueProvenanceError,
  createGuitarTechniqueProvenance,
  extractGuitarTechniqueProvenance,
} = require('../src/parser/guitarTechniqueProvenance');
const { tryNormalizeRuntimeGuitarNotation } = require('../src/app/runtimeGuitarNotationNormalizer');

function score(notes, version = '4.0') {
  return `<?xml version="1.0"?><score-partwise version="${version}"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${notes.join('')}</measure></part></score-partwise>`;
}

function note(
  body = '',
  pitch = '<pitch><step>E</step><octave>4</octave></pitch>',
  voice = '1',
  staff = '1',
) {
  return `<note>${pitch}<duration>1</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff>${body}</note>`;
}

function parsed(notes) {
  return parseParsedMusicXmlDocument(score(notes));
}

function provenance(notes) {
  return extractGuitarTechniqueProvenance(parsed(notes));
}

test('extracts only verified Guitar Pro / MusicXML technique shapes as SAFE_METADATA_ONLY provenance', () => {
  const source = parsed([
    note('<notations><technical><hammer-on number="1" type="start">H</hammer-on><string placement="below">2</string><fret>1</fret></technical><slide number="5" type="start"/></notations>'),
    note('<notations><technical><hammer-on number="1" type="stop"/><harmonic/></technical><slide number="5" type="stop"/></notations>'),
    note('<notations><technical><harmonic><natural/><base-pitch/></harmonic><fingering>1</fingering><pluck>2</pluck></technical></notations><play><mute>straight</mute></play>'),
  ]);

  const result = extractGuitarTechniqueProvenance(source);
  assert.equal(result.documentType, 'GuitarTechniqueProvenanceCollection');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.status, 'EXPLICIT');
  assert.equal(result.authority, 'SOURCE_TECHNIQUE_EVIDENCE_ONLY');
  assert.equal(result.capabilityClass, 'SAFE_METADATA_ONLY');
  assert.equal(result.physicalSemanticsEnabled, false);
  assert.equal(result.recordCount, 11);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.records));
  assert.ok(result.records.every((entry) => entry.capabilityClass === 'SAFE_METADATA_ONLY'));
  const pairedHammer = result.records.filter((entry) => entry.kind === 'HAMMER_ON');
  assert.equal(pairedHammer.length, 2);
  assert.ok(pairedHammer[0].pairingId);
  assert.equal(pairedHammer[0].pairingId, pairedHammer[1].pairingId);
  assert.equal(pairedHammer[0].pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(pairedHammer[1].pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(pairedHammer[0].sourcePairingToken, pairedHammer[1].sourcePairingToken);
  assert.ok(
    result.records
      .filter((entry) => entry.kind !== 'HAMMER_ON')
      .every((entry) => entry.pairingId === null && entry.pairingBasis === null && entry.sourcePairingToken === null),
  );

  const hammerStart = result.records.find((entry) => entry.kind === 'HAMMER_ON' && entry.state === 'START');
  assert.deepEqual(hammerStart.sourceAttributes, { number: '1', type: 'start' });
  assert.equal(hammerStart.sourceText, 'H');
  assert.equal(hammerStart.normalizedSemantics, 'HAMMER_ON');

  const slideStart = result.records.find((entry) => entry.kind === 'SLIDE' && entry.state === 'START');
  assert.deepEqual(slideStart.sourceAttributes, { number: '5', type: 'start' });
  assert.equal(slideStart.sourcePath, 'note/notations/slide');

  const natural = result.records.find((entry) => entry.subtype === 'natural-base-pitch');
  assert.equal(natural.normalizedSemantics, 'HARMONIC_NATURAL_BASE_PITCH');

  const straight = result.records.find((entry) => entry.kind === 'MUTE');
  assert.equal(straight.sourcePath, 'note/play/mute');
  assert.equal(straight.sourceText, 'straight');

  const position = result.records.find((entry) => entry.subtype === 'string');
  assert.deepEqual(position.sourceAttributes, { placement: 'below' });
  assert.equal(position.sourceText, '2');
});

test('balanced non-overlapping hammer-on endpoints receive deterministic source pairing identity', () => {
  const result = provenance([
    note('<notations><technical><hammer-on number="1" type="start">H</hammer-on></technical></notations>'),
    note('<notations><technical><hammer-on number="1" type="stop"/></technical></notations>'),
  ]);
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.records.map((entry) => entry.state), ['START', 'STOP']);
  assert.ok(result.records[0].pairingId);
  assert.equal(result.records[0].pairingId, result.records[1].pairingId);
  assert.equal(result.records[0].pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(result.records[1].pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(result.records[0].sourcePairingToken, result.records[1].sourcePairingToken);
  assert.match(result.records[0].sourcePairingToken, /^p0\.m0\.n0\..*>p0\.m0\.n1\./);
});

test('endpoint validation rejects missing, orphan, conflicting-number and cross-context endpoints without inferring pairing', () => {
  const cases = [
    [
      note('<notations><technical><hammer-on number="1" type="start">H</hammer-on></technical></notations>'),
    ],
    [
      note('<notations><technical><hammer-on number="1" type="stop"/></technical></notations>'),
    ],
    [
      note('<notations><technical><hammer-on number="1" type="start">H</hammer-on></technical></notations>'),
      note('<notations><technical><hammer-on number="2" type="stop"/></technical></notations>'),
    ],
    [
      note('<notations><slide number="5" type="start"/></notations>'),
    ],
    [
      note('<notations><slide number="5" type="start"/></notations>', undefined, '1', '1'),
      note('<notations><slide number="5" type="stop"/></notations>', undefined, '2', '1'),
    ],
    [
      note('<notations><slide number="5" type="start"/></notations>', undefined, '1', '1'),
      note('<notations><slide number="5" type="stop"/></notations>', undefined, '1', '2'),
    ],
  ];

  for (const notes of cases) {
    assert.throws(
      () => provenance(notes),
      (error) => error instanceof GuitarTechniqueProvenanceError
        && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING',
    );
  }
});

test('reused hammer number may pair only when source order proves two non-overlapping pairs', () => {
  const result = provenance([
    note('<notations><technical><hammer-on number="1" type="start">H</hammer-on></technical><slide number="5" type="start"/></notations>'),
    note('<notations><technical><hammer-on number="1" type="stop"/><hammer-on number="1" type="start">H</hammer-on></technical><slide number="5" type="stop"/><slide number="5" type="start"/></notations>'),
    note('<notations><technical><hammer-on number="1" type="stop"/></technical><slide number="5" type="stop"/></notations>'),
  ]);
  assert.equal(result.recordCount, 8);
  const hammers = result.records.filter((entry) => entry.kind === 'HAMMER_ON');
  assert.equal(hammers.length, 4);
  assert.ok(hammers.every((entry) => entry.pairingBasis === 'DETERMINISTIC_SOURCE_IDENTITY'));
  assert.equal(hammers[0].pairingId, hammers[1].pairingId);
  assert.equal(hammers[2].pairingId, hammers[3].pairingId);
  assert.notEqual(hammers[0].pairingId, hammers[2].pairingId);
  assert.ok(
    result.records
      .filter((entry) => entry.kind === 'SLIDE')
      .every((entry) => entry.pairingId === null && entry.pairingBasis === null && entry.sourcePairingToken === null),
  );
});

test('overlapping reused-number hammer chain remains unpaired because number and nesting do not prove identity', () => {
  const result = provenance([
    note('<notations><technical><hammer-on number="1" type="start">H</hammer-on></technical></notations>'),
    note('<notations><technical><hammer-on number="1" type="start">H</hammer-on><hammer-on number="1" type="stop"/></technical></notations>'),
    note('<notations><technical><hammer-on number="1" type="stop"/></technical></notations>'),
  ]);
  const hammers = result.records.filter((entry) => entry.kind === 'HAMMER_ON');
  assert.equal(hammers.length, 4);
  assert.ok(hammers.every((entry) => entry.pairingId === null));
  assert.ok(hammers.every((entry) => entry.pairingBasis === null));
  assert.ok(hammers.every((entry) => entry.sourcePairingToken === null));
});

test('repeated extraction is deterministic and never mutates parsed source', () => {
  const source = parsed([
    note('<notations><technical><harmonic/><string>1</string><fret>12</fret></technical><slide number="6" type="start"/></notations>'),
    note('<notations><slide number="6" type="stop"/></notations>'),
  ]);
  const before = structuredClone(source);
  const first = extractGuitarTechniqueProvenance(source);
  const second = extractGuitarTechniqueProvenance(source);
  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('absence is explicit and bounded', () => {
  const result = provenance([note()]);
  assert.equal(result.status, 'ABSENT');
  assert.equal(result.recordCount, 0);
  assert.deepEqual(result.records, []);
});

test('provenance contract rejects musical facts, physical authority and unbounded source text', () => {
  const base = {
    kind: 'SLIDE', subtype: 'musicxml-slide', state: 'START', sourcePath: 'note/notations/slide',
    sourceAttributes: { number: '1', type: 'start' }, sourceText: '', normalizedSemantics: 'SLIDE',
    capabilityClass: 'SAFE_METADATA_ONLY',
  };
  assert.throws(() => createGuitarTechniqueProvenance({ ...base, pitch: 'E4' }), (error) => error instanceof GuitarTechniqueProvenanceError && error.code === 'GUITAR_TECHNIQUE_AUTHORITY_FORBIDDEN');
  assert.throws(() => createGuitarTechniqueProvenance({ ...base, capabilityClass: 'PHYSICAL_SEMANTICS_SUPPORTED' }), (error) => error.code === 'GUITAR_TECHNIQUE_PHYSICAL_AUTHORITY_FORBIDDEN');
  assert.throws(() => createGuitarTechniqueProvenance({ ...base, sourceText: 'x'.repeat(257) }), (error) => error.code === 'GUITAR_TECHNIQUE_PROVENANCE_LIMIT_EXCEEDED');

  const hammer = {
    ...base,
    kind: 'HAMMER_ON',
    subtype: 'musicxml-hammer-on',
    sourcePath: 'note/notations/technical/hammer-on',
    sourceAttributes: { number: '1', type: 'start' },
    sourceText: 'H',
    normalizedSemantics: 'HAMMER_ON',
  };
  const paired = createGuitarTechniqueProvenance({
    ...hammer,
    pairingId: 'HAMMER_ON:n1:0123456789abcdef01234567',
    pairingBasis: 'DETERMINISTIC_SOURCE_IDENTITY',
    sourcePairingToken: 'p0.m0.n0.o0.t0.h0>p0.m0.n1.o0.t0.h0',
  });
  assert.equal(paired.pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.throws(
    () => createGuitarTechniqueProvenance({
      ...base,
      pairingId: 'SLIDE:n1:0123456789abcdef01234567',
      pairingBasis: 'DETERMINISTIC_SOURCE_IDENTITY',
      sourcePairingToken: 'p0>p1',
    }),
    (error) => error.code === 'GUITAR_TECHNIQUE_PAIRING_KIND_NOT_CLEARED',
  );
  assert.throws(
    () => createGuitarTechniqueProvenance({ ...hammer, pairingId: 'HAMMER_ON:partial' }),
    (error) => error.code === 'GUITAR_TECHNIQUE_NON_DETERMINISTIC_PAIRING_FORBIDDEN',
  );
});

test('artificial harmonic and uncleared technical children remain fail-closed', () => {
  for (const technical of [
    '<harmonic><artificial/><base-pitch/></harmonic>',
    '<pull-off number="1" type="start">P</pull-off>',
    '<bend><bend-alter>1</bend-alter></bend>',
    '<tap>1</tap>',
    '<other-technical>palm mute</other-technical>',
  ]) {
    assert.throws(
      () => provenance([note(`<notations><technical>${technical}</technical></notations>`)]),
      (error) => error instanceof GuitarTechniqueProvenanceError && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE',
      technical,
    );
  }
});

test('malformed hammer-on and slide forms remain fail-closed', () => {
  const cases = [
    '<notations><technical><hammer-on number="1" type="continue">H</hammer-on></technical></notations>',
    '<notations><technical><hammer-on type="start">H</hammer-on></technical></notations>',
    '<notations><technical><hammer-on number="1" type="start">X</hammer-on></technical></notations>',
    '<notations><technical><hammer-on number="1" type="start">H</hammer-on><hammer-on number="1" type="start">H</hammer-on></technical></notations>',
    '<notations><slide number="0" type="start"/></notations>',
    '<notations><slide number="1" type="continue"/></notations>',
    '<notations><slide number="1" type="start" unexpected="x"/></notations>',
  ];
  for (const body of cases) assert.throws(() => provenance([note(body)]), GuitarTechniqueProvenanceError, body);
});

test('malformed position/performance evidence remains fail-closed', () => {
  for (const technical of [
    '<string>0</string>', '<fret>-1</fret>', '<fingering>0</fingering>', '<fingering>6</fingering>', '<pluck>x</pluck>',
  ]) {
    assert.throws(() => provenance([note(`<notations><technical>${technical}</technical></notations>`)]), GuitarTechniqueProvenanceError, technical);
  }
  assert.throws(() => provenance([note('<play><mute>palm</mute></play>')]), GuitarTechniqueProvenanceError);
  assert.throws(() => provenance([note('<play><mute>straight</mute><other-play/></play>')]), GuitarTechniqueProvenanceError);
});

test('PROD-TECH-01B keeps balanced endpoints provenance-only and does not silently bundle strict-projector acceptance', () => {
  const hammer = parsed([
    note('<notations><technical><hammer-on number="1" type="start">H</hammer-on></technical></notations>'),
    note('<notations><technical><hammer-on number="1" type="stop"/></technical></notations>'),
  ]);
  assert.doesNotThrow(() => extractGuitarTechniqueProvenance(hammer));
  assert.throws(
    () => tryNormalizeRuntimeGuitarNotation(hammer),
    (error) => error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE' && error.details.feature === 'notation:technical',
  );

  const slide = parsed([
    note('<notations><slide number="5" type="start"/></notations>'),
    note('<notations><slide number="5" type="stop"/></notations>'),
  ]);
  assert.doesNotThrow(() => extractGuitarTechniqueProvenance(slide));
  assert.throws(
    () => tryNormalizeRuntimeGuitarNotation(slide),
    (error) => error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE' && error.details.feature === 'notation:slide',
  );
});
