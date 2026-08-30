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
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');

const STANDARD = Object.freeze([
  Object.freeze({ string: 1, pitch: 'E4' }),
  Object.freeze({ string: 2, pitch: 'B3' }),
  Object.freeze({ string: 3, pitch: 'G3' }),
  Object.freeze({ string: 4, pitch: 'D3' }),
  Object.freeze({ string: 5, pitch: 'A2' }),
  Object.freeze({ string: 6, pitch: 'E2' }),
]);
const DROP_D = Object.freeze([...STANDARD.slice(0, 5), Object.freeze({ string: 6, pitch: 'D2' })]);
const CUSTOM = Object.freeze([
  Object.freeze({ string: 1, pitch: 'D4' }),
  Object.freeze({ string: 2, pitch: 'A3' }),
  Object.freeze({ string: 3, pitch: 'F3' }),
  Object.freeze({ string: 4, pitch: 'C3' }),
  Object.freeze({ string: 5, pitch: 'G2' }),
  Object.freeze({ string: 6, pitch: 'C2' }),
]);

function request(tuning, capoFret = 0) {
  return { capoFret, tuning: tuning.map((entry) => ({ ...entry })) };
}

function staffDetails(tuning, capoFret = 0) {
  const accidental = { bb: -2, b: -1, '#': 1, '##': 2 };
  const lines = ['<staff-details><staff-lines>6</staff-lines>'];
  for (let line = 1; line <= 6; line += 1) {
    const entry = tuning[6 - line];
    const match = /^([A-G])(bb|##|b|#)?([0-9])$/.exec(entry.pitch);
    const [, step, acc = '', octave] = match;
    lines.push(`<staff-tuning line="${line}"><tuning-step>${step}</tuning-step>`);
    if (acc) lines.push(`<tuning-alter>${accidental[acc]}</tuning-alter>`);
    lines.push(`<tuning-octave>${octave}</tuning-octave></staff-tuning>`);
  }
  lines.push(`<capo>${capoFret}</capo></staff-details>`);
  return lines.join('');
}

function note(technical = false) {
  return `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>${technical ? '<notations><technical><string>1</string><fret>0</fret></technical></notations>' : ''}</note>`;
}

function score(measures) {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${measures.map((body, index) => `<measure number="${index + 1}">${body}</measure>`).join('')}</part></score-partwise>`;
}

function configuredMeasure(tuning, capoFret = 0, technical = false) {
  return `<attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails(tuning, capoFret)}</attributes>${note(technical)}`;
}

function provenance(tuning, capoFret = 0, technical = false) {
  const parsed = parseParsedMusicXmlDocument(score([configuredMeasure(tuning, capoFret, technical)]));
  return extractMusicXmlGuitarConfigurationProvenance(parsed);
}

test('capo facts are immutable additive GuitarConfiguration facts while legacy enumerable shape/version remain exact', () => {
  const configuration = createGuitarConfiguration();
  assert.equal(GUITAR_CONFIGURATION_VERSION, '1.0.0');
  assert.deepEqual(Object.keys(configuration), ['tuning', 'minimumFret', 'maximumFret']);
  assert.equal(configuration.capoFret, 0);
  assert.equal(configuration.fretSemantics, GUITAR_FRET_SEMANTICS);
  assert.equal(configuration.fretSemantics, 'RELATIVE_FROM_CAPO');
  assert.deepEqual(configuration.tuning, STANDARD_TUNING.slice().sort((a, b) => a.number - b.number));
  assert.ok(Object.isFrozen(configuration));
  assert.ok(Object.isFrozen(configuration.tuning));
});

test('capo validation rejects negative, fractional and bounded-fret overflow', () => {
  assert.throws(() => createGuitarConfiguration({ capoFret: -1 }), /negative/i);
  assert.throws(() => createGuitarConfiguration({ capoFret: 1.5 }), /integer/i);
  assert.throws(() => createGuitarConfiguration({ capoFret: MAX_CAPO_FRET + 1 }), /exceeds/i);
  assert.throws(() => createGuitarConfiguration({ capoFret: 8, maximumFret: 7 }), /exceeds/i);
});

test('public request normalization accepts Standard, Drop D and custom tuning with capo using one configuration contract', () => {
  for (const [tuning, capoFret, lowPitch] of [
    [STANDARD, 0, 'E2'], [STANDARD, 2, 'E2'], [DROP_D, 0, 'D2'], [DROP_D, 2, 'D2'], [CUSTOM, 0, 'C2'], [CUSTOM, 3, 'C2'],
  ]) {
    const configuration = normalizeGuitarConfigurationRequest(request(tuning, capoFret));
    assert.equal(configuration.capoFret, capoFret);
    assert.equal(configuration.fretSemantics, 'RELATIVE_FROM_CAPO');
    assert.equal(configuration.tuning[5].pitch, lowPitch);
  }
  assert.equal(normalizeGuitarConfigurationRequest(null), null);
});

test('public request validation is exact, hostile-safe and fail-closed', () => {
  assert.throws(() => normalizeGuitarConfigurationRequest(request(STANDARD.slice(0, 5))), GuitarConfigurationRequestError);
  const duplicate = STANDARD.map((entry) => ({ ...entry })); duplicate[1].string = 1;
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: duplicate }), /unique/i);
  const malformed = STANDARD.map((entry) => ({ ...entry })); malformed[0].pitch = 'H4';
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: malformed }), /scientific pitch/i);
  assert.throws(() => normalizeGuitarConfigurationRequest({ ...request(STANDARD), extra: true }), /unknown field/i);
  assert.throws(() => normalizeGuitarConfigurationRequest(new Proxy(request(STANDARD), {})), /non-proxy/i);

  let entryGetterRead = false;
  const hostileEntry = { string: 1 };
  Object.defineProperty(hostileEntry, 'pitch', { enumerable: true, get() { entryGetterRead = true; return 'E4'; } });
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: [hostileEntry, ...STANDARD.slice(1).map((entry) => ({ ...entry }))] }), /data properties/i);
  assert.equal(entryGetterRead, false);

  let slotGetterRead = false;
  const hostileSlots = STANDARD.map((entry) => ({ ...entry }));
  Object.defineProperty(hostileSlots, '0', {
    enumerable: true,
    configurable: true,
    get() {
      slotGetterRead = true;
      return { string: 1, pitch: 'E4' };
    },
  });
  assert.throws(
    () => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: hostileSlots }),
    /numeric slots must be enumerable data properties/i,
  );
  assert.equal(slotGetterRead, false);
});

test('public and source trust boundaries reject physically inconsistent string ordering', () => {
  const inverted = STANDARD.map((entry) => ({ ...entry })); inverted[0].pitch = 'A2';
  assert.throws(() => normalizeGuitarConfigurationRequest({ capoFret: 0, tuning: inverted }), /descend strictly/i);
  const invalidSource = [{ string: 1, pitch: 'A2' }, ...STANDARD.slice(1)];
  const parsed = parseParsedMusicXmlDocument(score([configuredMeasure(invalidSource, 0)]));
  assert.throws(() => extractMusicXmlGuitarConfigurationProvenance(parsed), MusicXmlGuitarConfigurationProvenanceError);
});

test('MusicXML provenance parses complete Standard, Drop D and custom tuning plus capo', () => {
  for (const [tuning, capoFret, lowPitch] of [
    [STANDARD, 0, 'E2'], [STANDARD, 2, 'E2'], [DROP_D, 0, 'D2'], [DROP_D, 2, 'D2'], [CUSTOM, 0, 'C2'], [CUSTOM, 3, 'C2'],
  ]) {
    const result = provenance(tuning, capoFret);
    assert.equal(result.status, 'EXPLICIT');
    assert.equal(result.configuration.capoFret, capoFret);
    assert.equal(result.configuration.tuning[5].pitch, lowPitch);
  }
});

test('MusicXML provenance rejects partial/capo-only/duplicate/invalid configuration', () => {
  const full = staffDetails(STANDARD, 2);
  const cases = [
    full.replace(/<staff-tuning line="6">[\s\S]*?<\/staff-tuning>/, ''),
    '<staff-details><staff-lines>6</staff-lines><capo>2</capo></staff-details>',
    full.replace('line="6"', 'line="5"'),
    full.replace('<capo>2</capo>', '<capo>-1</capo>'),
  ];
  for (const details of cases) {
    const parsed = parseParsedMusicXmlDocument(score([`<attributes><divisions>1</divisions>${details}</attributes>${note()}`]));
    assert.throws(() => extractMusicXmlGuitarConfigurationProvenance(parsed), MusicXmlGuitarConfigurationProvenanceError);
  }
});

test('identical later declarations are repetition; real mid-score retuning is unsupported', () => {
  const same = parseParsedMusicXmlDocument(score([
    configuredMeasure(STANDARD, 2),
    `<attributes>${staffDetails(STANDARD, 2)}</attributes>${note()}`,
  ]));
  assert.equal(extractMusicXmlGuitarConfigurationProvenance(same).recordCount, 2);
  const changed = parseParsedMusicXmlDocument(score([
    configuredMeasure(STANDARD, 0),
    `<attributes>${staffDetails(DROP_D, 0)}</attributes>${note()}`,
  ]));
  assert.throws(() => extractMusicXmlGuitarConfigurationProvenance(changed), (error) => error.code === 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE');
});

test('configuration first introduced after timing begins is unsupported', () => {
  const parsed = parseParsedMusicXmlDocument(score([`${note()}<attributes>${staffDetails(STANDARD, 2)}</attributes>`]));
  assert.throws(() => extractMusicXmlGuitarConfigurationProvenance(parsed), (error) => error.code === 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE');
});

test('source technical string/fret is provenance only and never solver authority', () => {
  const result = provenance(STANDARD, 0, true);
  assert.equal(result.sourceTechnicalPositionEvidenceCount, 1);
  assert.equal(result.sourceTechnicalPositionsAreSolverAuthority, false);
});

test('authority resolves default/source/user/agreement and blocks conflict explicitly', () => {
  assert.equal(resolveGuitarConfigurationAuthority().authority, 'STANDARD_DEFAULT');
  const source = provenance(DROP_D, 2);
  assert.equal(resolveGuitarConfigurationAuthority({ sourceProvenance: source }).authority, 'EXPLICIT_MUSICXML_SOURCE');
  const user = normalizeGuitarConfigurationRequest(request(CUSTOM, 3));
  assert.equal(resolveGuitarConfigurationAuthority({ userConfiguration: user }).authority, 'EXPLICIT_USER');
  assert.equal(resolveGuitarConfigurationAuthority({ userConfiguration: user, sourceProvenance: provenance(CUSTOM, 3) }).authority, 'EXPLICIT_USER_AND_SOURCE_AGREE');
  assert.throws(
    () => resolveGuitarConfigurationAuthority({ userConfiguration: normalizeGuitarConfigurationRequest(request(DROP_D, 0)), sourceProvenance: provenance(STANDARD, 3) }),
    (error) => error instanceof GuitarConfigurationAuthorityError && error.code === 'CONFIGURATION_CONFLICT',
  );
});

test('provenance extraction never mutates parsed source musical or structural facts', () => {
  const parsed = parseParsedMusicXmlDocument(score([configuredMeasure(CUSTOM, 3, true)]));
  const before = structuredClone(parsed);
  extractMusicXmlGuitarConfigurationProvenance(parsed);
  assert.deepEqual(parsed, before);
});
