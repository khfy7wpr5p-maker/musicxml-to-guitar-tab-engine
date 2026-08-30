'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_FRET_SEMANTICS,
  MAX_CAPO_FRET,
  STANDARD_TUNING,
  createGuitarConfiguration,
} = require('../src/guitar/tuning');
const {
  GuitarConfigurationRequestError,
  normalizeGuitarConfigurationRequest,
} = require('../src/guitar/guitarConfigurationRequestNormalizer');
const {
  MusicXmlGuitarConfigurationProvenanceError,
  extractMusicXmlGuitarConfigurationProvenance,
} = require('../src/parser/musicXmlGuitarConfigurationProvenance');
const {
  GuitarConfigurationAuthorityError,
  resolveGuitarConfigurationAuthority,
} = require('../src/guitar/guitarConfigurationAuthority');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');

const STANDARD_REQUEST = Object.freeze([
  Object.freeze({ string: 1, pitch: 'E4' }),
  Object.freeze({ string: 2, pitch: 'B3' }),
  Object.freeze({ string: 3, pitch: 'G3' }),
  Object.freeze({ string: 4, pitch: 'D3' }),
  Object.freeze({ string: 5, pitch: 'A2' }),
  Object.freeze({ string: 6, pitch: 'E2' }),
]);

const DROP_D_REQUEST = Object.freeze([
  ...STANDARD_REQUEST.slice(0, 5),
  Object.freeze({ string: 6, pitch: 'D2' }),
]);

const CUSTOM_REQUEST = Object.freeze([
  Object.freeze({ string: 1, pitch: 'D4' }),
  Object.freeze({ string: 2, pitch: 'A3' }),
  Object.freeze({ string: 3, pitch: 'F3' }),
  Object.freeze({ string: 4, pitch: 'C3' }),
  Object.freeze({ string: 5, pitch: 'G2' }),
  Object.freeze({ string: 6, pitch: 'C2' }),
]);

function request(tuning, capoFret = 0) {
  return {
    capoFret,
    tuning: tuning.map((entry) => ({ ...entry })),
  };
}

function pitchParts(pitch) {
  const match = /^([A-G])(bb|##|b|#)?([0-9])$/.exec(pitch);
  assert.ok(match);
  const [, step, accidental = '', octave] = match;
  const alter = { bb: -2, b: -1, '': 0, '#': 1, '##': 2 }[accidental];
  return { step, alter, octave: Number(octave) };
}

function staffDetailsXml(tuning, capoFret = 0) {
  const byString = new Map(tuning.map((entry) => [entry.string, entry]));
  const lines = ['<staff-details>', '<staff-lines>6</staff-lines>'];
  for (let line = 1; line <= 6; line += 1) {
    const string = 7 - line;
    const { pitch } = byString.get(string);
    const { step, alter, octave } = pitchParts(pitch);
    lines.push(`<staff-tuning line="${line}">`);
    lines.push(`<tuning-step>${step}</tuning-step>`);
    if (alter !== 0) lines.push(`<tuning-alter>${alter}</tuning-alter>`);
    lines.push(`<tuning-octave>${octave}</tuning-octave>`);
    lines.push('</staff-tuning>');
  }
  if (capoFret !== null) lines.push(`<capo>${capoFret}</capo>`);
  lines.push('</staff-details>');
  return lines.join('');
}

function noteXml({ technical = false } = {}) {
  return `<note>
    <pitch><step>E</step><octave>4</octave></pitch>
    <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
    ${technical ? '<notations><technical><string>1</string><fret>0</fret></technical></notations>' : ''}
  </note>`;
}

function scoreXml(measureBodies) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    ${measureBodies.map((body, index) => `<measure number="${index + 1}">${body}</measure>`).join('')}
  </part>
</score-partwise>`;
}

function firstMeasureWithConfiguration(tuning, capoFret = 0, options = {}) {
  const attributes = `<attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetailsXml(tuning, capoFret)}</attributes>`;
  return options.afterNote ? `${noteXml()}${attributes}` : `${attributes}${noteXml({ technical: options.technical })}`;
}

function sourceProvenance(tuning, capoFret = 0) {
  const parsed = parseParsedMusicXmlDocument(scoreXml([
    firstMeasureWithConfiguration(tuning, capoFret),
  ]));
  return extractMusicXmlGuitarConfigurationProvenance(parsed);
}

test('GuitarConfiguration adds immutable capo semantics without changing the Standard capo-0 baseline', () => {
  const configuration = createGuitarConfiguration();
  assert.equal(GUITAR_CONFIGURATION_VERSION, '1.1.0');
  assert.equal(configuration.capoFret, 0);
  assert.equal(configuration.fretSemantics, GUITAR_FRET_SEMANTICS);
  assert.equal(configuration.fretSemantics, 'RELATIVE_FROM_CAPO');
  assert.equal(configuration.minimumFret, 0);
  assert.equal(configuration.maximumFret, 20);
  assert.deepEqual(configuration.tuning, STANDARD_TUNING.slice().sort((a, b) => a.number - b.number));
  assert.ok(Object.isFrozen(configuration));
  assert.ok(Object.isFrozen(configuration.tuning));
  assert.ok(configuration.tuning.every(Object.isFrozen));
});

test('GuitarConfiguration rejects negative, fractional and out-of-bounds capo values fail closed', () => {
  assert.throws(() => createGuitarConfiguration({ capoFret: -1 }), /negative/i);
  assert.throws(() => createGuitarConfiguration({ capoFret: 1.5 }), /integer/i);
  assert.throws(() => createGuitarConfiguration({ capoFret: MAX_CAPO_FRET + 1 }), /exceeds/i);
  assert.throws(() => createGuitarConfiguration({ capoFret: 8, maximumFret: 7 }), /exceeds/i);
});

test('hostile-safe public request normalization accepts Standard, Drop D and custom tuning with capo', () => {
  const cases = [
    [STANDARD_REQUEST, 0, 40],
    [STANDARD_REQUEST, 2, 40],
    [DROP_D_REQUEST, 0, 38],
    [DROP_D_REQUEST, 2, 38],
    [CUSTOM_REQUEST, 0, 36],
    [CUSTOM_REQUEST, 3, 36],
  ];
  for (const [tuning, capoFret, lowMidi] of cases) {
    const configuration = normalizeGuitarConfigurationRequest(request(tuning, capoFret));
    assert.equal(configuration.capoFret, capoFret);
    assert.equal(configuration.fretSemantics, 'RELATIVE_FROM_CAPO');
    assert.equal(configuration.tuning.length, 6);
    assert.equal(configuration.tuning[5].midi, lowMidi);
  }
  assert.equal(normalizeGuitarConfigurationRequest(null), null);
});

test('public guitar request rejects partial, duplicate, unordered, malformed, invalid-capo and unknown input', () => {
  assert.throws(
    () => normalizeGuitarConfigurationRequest(request(STANDARD_REQUEST.slice(0, 5), 0)),
    (error) => error instanceof GuitarConfigurationRequestError && error.code === 'INVALID_GUITAR_CONFIGURATION_REQUEST',
  );
  const duplicate = STANDARD_REQUEST.map((entry) => ({ ...entry }));
  duplicate[1].string = 1;
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: duplicate }), /unique/i);
  const unordered = STANDARD_REQUEST.map((entry) => ({ ...entry }));
  [unordered[0], unordered[1]] = [unordered[1], unordered[0]];
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: unordered }), /ordered/i);
  const malformed = STANDARD_REQUEST.map((entry) => ({ ...entry }));
  malformed[0].pitch = 'H4';
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: malformed }), /scientific pitch/i);
  assert.throws(() => normalizeGuitarConfigurationRequest(request(STANDARD_REQUEST, -1)), /invalid/i);
  assert.throws(() => normalizeGuitarConfigurationRequest({ ...request(STANDARD_REQUEST, 0), extra: true }), /unknown field/i);
  assert.throws(() => normalizeGuitarConfigurationRequest({ tuning: STANDARD_REQUEST.map((entry) => ({ ...entry })) }), /must contain capoFret/i);
});

test('public guitar request rejects Proxy and accessor inputs without invoking getters', () => {
  const plainTuning = STANDARD_REQUEST.map((entry) => ({ ...entry }));
  assert.throws(
    () => normalizeGuitarConfigurationRequest(new Proxy({ capoFret: 0, tuning: plainTuning }, {})),
    /non-proxy/i,
  );
  let getterRead = false;
  const hostile = { string: 1 };
  Object.defineProperty(hostile, 'pitch', {
    enumerable: true,
    get() {
      getterRead = true;
      return 'E4';
    },
  });
  assert.throws(
    () => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: [hostile, ...plainTuning.slice(1)] }),
    /data properties/i,
  );
  assert.equal(getterRead, false);
});

test('MusicXML provenance parses exact Standard, Drop D and custom six-string configurations with capo', () => {
  const cases = [
    [STANDARD_REQUEST, 0, 'E2'],
    [STANDARD_REQUEST, 2, 'E2'],
    [DROP_D_REQUEST, 0, 'D2'],
    [DROP_D_REQUEST, 2, 'D2'],
    [CUSTOM_REQUEST, 0, 'C2'],
    [CUSTOM_REQUEST, 3, 'C2'],
  ];
  for (const [tuning, capoFret, lowPitch] of cases) {
    const provenance = sourceProvenance(tuning, capoFret);
    assert.equal(provenance.status, 'EXPLICIT');
    assert.equal(provenance.configuration.capoFret, capoFret);
    assert.equal(provenance.configuration.tuning[5].pitch, lowPitch);
    assert.equal(provenance.authority, 'SOURCE_CONFIGURATION_EVIDENCE_ONLY');
  }
});

test('MusicXML provenance rejects partial tuning, capo-only configuration, duplicate line and invalid capo', () => {
  const full = staffDetailsXml(STANDARD_REQUEST, 2);
  const partial = full.replace(/<staff-tuning line="6">[\s\S]*?<\/staff-tuning>/, '');
  const capoOnly = '<staff-details><staff-lines>6</staff-lines><capo>2</capo></staff-details>';
  const duplicate = full.replace('line="6"', 'line="5"');
  const invalidCapo = full.replace('<capo>2</capo>', '<capo>-1</capo>');
  for (const staffDetails of [partial, capoOnly, duplicate, invalidCapo]) {
    const parsed = parseParsedMusicXmlDocument(scoreXml([
      `<attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails}</attributes>${noteXml()}`,
    ]));
    assert.throws(
      () => extractMusicXmlGuitarConfigurationProvenance(parsed),
      (error) => error instanceof MusicXmlGuitarConfigurationProvenanceError,
    );
  }
});

test('identical later source declarations are provenance repetition, but a real mid-score configuration change is unsupported', () => {
  const sameLater = parseParsedMusicXmlDocument(scoreXml([
    firstMeasureWithConfiguration(STANDARD_REQUEST, 2),
    `<attributes>${staffDetailsXml(STANDARD_REQUEST, 2)}</attributes>${noteXml()}`,
  ]));
  const repeated = extractMusicXmlGuitarConfigurationProvenance(sameLater);
  assert.equal(repeated.status, 'EXPLICIT');
  assert.equal(repeated.recordCount, 2);
  assert.equal(repeated.configuration.capoFret, 2);

  const changedLater = parseParsedMusicXmlDocument(scoreXml([
    firstMeasureWithConfiguration(STANDARD_REQUEST, 0),
    `<attributes>${staffDetailsXml(DROP_D_REQUEST, 0)}</attributes>${noteXml()}`,
  ]));
  assert.throws(
    () => extractMusicXmlGuitarConfigurationProvenance(changedLater),
    (error) => error instanceof MusicXmlGuitarConfigurationProvenanceError
      && error.code === 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE',
  );
});

test('configuration first introduced after note timing begins is unsupported', () => {
  const parsed = parseParsedMusicXmlDocument(scoreXml([
    firstMeasureWithConfiguration(STANDARD_REQUEST, 2, { afterNote: true }),
  ]));
  assert.throws(
    () => extractMusicXmlGuitarConfigurationProvenance(parsed),
    (error) => error instanceof MusicXmlGuitarConfigurationProvenanceError
      && error.code === 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE',
  );
});

test('source technical string/fret is counted as evidence and never becomes solver authority', () => {
  const parsed = parseParsedMusicXmlDocument(scoreXml([
    firstMeasureWithConfiguration(STANDARD_REQUEST, 0, { technical: true }),
  ]));
  const provenance = extractMusicXmlGuitarConfigurationProvenance(parsed);
  assert.equal(provenance.sourceTechnicalPositionEvidenceCount, 1);
  assert.equal(provenance.sourceTechnicalPositionsAreSolverAuthority, false);
});

test('configuration authority is user > source > Standard default only when facts do not conflict', () => {
  const defaultResolution = resolveGuitarConfigurationAuthority();
  assert.equal(defaultResolution.authority, 'STANDARD_DEFAULT');
  assert.equal(defaultResolution.configuration.capoFret, 0);

  const source = sourceProvenance(DROP_D_REQUEST, 2);
  const sourceResolution = resolveGuitarConfigurationAuthority({ sourceProvenance: source });
  assert.equal(sourceResolution.authority, 'EXPLICIT_MUSICXML_SOURCE');
  assert.equal(sourceResolution.configuration.tuning[5].pitch, 'D2');

  const user = normalizeGuitarConfigurationRequest(request(CUSTOM_REQUEST, 3));
  const userResolution = resolveGuitarConfigurationAuthority({ userConfiguration: user });
  assert.equal(userResolution.authority, 'EXPLICIT_USER');
  assert.equal(userResolution.configuration.capoFret, 3);

  const agreeingSource = sourceProvenance(CUSTOM_REQUEST, 3);
  const agreement = resolveGuitarConfigurationAuthority({ userConfiguration: user, sourceProvenance: agreeingSource });
  assert.equal(agreement.authority, 'EXPLICIT_USER_AND_SOURCE_AGREE');
});

test('user/source configuration conflict is explicit and never silently resolved', () => {
  const user = normalizeGuitarConfigurationRequest(request(DROP_D_REQUEST, 0));
  const source = sourceProvenance(STANDARD_REQUEST, 3);
  assert.throws(
    () => resolveGuitarConfigurationAuthority({ userConfiguration: user, sourceProvenance: source }),
    (error) => error instanceof GuitarConfigurationAuthorityError && error.code === 'CONFIGURATION_CONFLICT',
  );
});

test('provenance extraction does not mutate any parsed source musical or structural fact', () => {
  const parsed = parseParsedMusicXmlDocument(scoreXml([
    firstMeasureWithConfiguration(CUSTOM_REQUEST, 3, { technical: true }),
  ]));
  const before = structuredClone(parsed);
  extractMusicXmlGuitarConfigurationProvenance(parsed);
  assert.deepEqual(parsed, before);
});
