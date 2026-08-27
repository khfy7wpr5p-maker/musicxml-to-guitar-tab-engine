'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION,
  POLYPHONIC_OCTAVE_SHIFT_RESOLVER_AUTHORITY,
  normalizePolyphonicOctaveShifts,
  projectParsedMusicXmlWithOctaveShiftCompatibility,
} = require('../src/parser/polyphonicOctaveShiftResolver');

function document(measures, { staves = 2 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <identification><encoding><software>Fixture</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures.map((body, index) => `
    <measure number="${index + 1}">
      ${index === 0 ? `<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>${staves}</staves></attributes>` : ''}
      ${body}
    </measure>`).join('')}
  </part>
</score-partwise>`;
}

function note(step, octave, { duration = 4, voice = 1, staff = 1, chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`;
}

function shift(type, { staff = 1, number = 1, size = null, extra = '' } = {}) {
  const sizeAttr = size === null ? '' : ` size="${size}"`;
  return `<direction placement="above"><direction-type><octave-shift type="${type}" number="${number}"${sizeAttr}/></direction-type>${extra}<staff>${staff}</staff></direction>`;
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(xml);
}

function unsupportedFeature(fn) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
    return error.details.feature;
  }
  assert.fail('Expected unsupported projection feature.');
}

test('PS-6B2B validates 8va display shift without rewriting true/performed pitch', () => {
  const source = parsed(document([`
    ${shift('down', { staff: 2, size: 8 })}
    ${note('C', 5, { staff: 2 })}
    ${shift('stop', { staff: 2 })}
    ${note('D', 5, { staff: 2 })}
  `]));

  const result = projectParsedMusicXmlWithOctaveShiftCompatibility(source);
  assert.equal(POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_OCTAVE_SHIFT_RESOLVER_AUTHORITY,
    'DISPLAY_OCTAVE_SHIFT_VALIDATION_NO_PITCH_REWRITE',
  );
  assert.deepEqual(result.sourceModel.measures[0].events.map((event) => event.pitch.written), ['C5', 'D5']);
  assert.deepEqual(result.sourceModel.measures[0].events.map((event) => event.pitch.midi), [72, 74]);
  assert.equal(result.octaveShiftMarkers.length, 2);
  assert.equal(result.octaveShiftMarkers[0].type, 'down');
  assert.equal(result.octaveShiftMarkers[0].displayOctaveDelta, -1);
  assert.equal(result.octaveShiftMarkers[1].type, 'stop');
  assert.equal(result.octaveShiftMarkers[1].displayOctaveDelta, -1);
  assert.ok(result.ignoredFeatures.includes('direction:octave-shift-display'));
});

test('PS-6B2B preserves pitch for upward display shifts and supports 15ma/22ma sizes', () => {
  for (const [size, delta] of [[8, 1], [15, 2], [22, 3]]) {
    const source = parsed(document([`
      ${shift('up', { size })}
      ${note('E', 2)}
      ${shift('stop', { size })}
    `]));
    const result = projectParsedMusicXmlWithOctaveShiftCompatibility(source);
    assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'E2');
    assert.equal(result.sourceModel.measures[0].events[0].pitch.midi, 40);
    assert.equal(result.octaveShiftMarkers[0].displayOctaveDelta, delta);
  }
});

test('PS-6B2B pairs octave shifts across measures and accepts continuation markers', () => {
  const source = parsed(document([
    `${shift('down', { staff: 2, size: 8 })}${note('A', 4, { staff: 2 })}`,
    `${shift('continue', { staff: 2 })}${note('B', 4, { staff: 2 })}${shift('stop', { staff: 2 })}`,
  ]));
  const normalized = normalizePolyphonicOctaveShifts(source);
  assert.deepEqual(normalized.octaveShiftMarkers.map((marker) => marker.type), ['down', 'continue', 'stop']);
  assert.deepEqual(normalized.octaveShiftMarkers.map((marker) => marker.measureIndex), [0, 1, 1]);
  assert.deepEqual(normalized.octaveShiftMarkers.map((marker) => marker.displayOctaveDelta), [-1, -1, -1]);
});

test('PS-6B2B uses score cursor order instead of raw document order around backup', () => {
  const source = parsed(document([`
    ${note('C', 4, { duration: 8, staff: 1 })}
    <backup><duration>8</duration></backup>
    ${shift('down', { staff: 2, number: 1, size: 8 })}
    ${note('G', 4, { duration: 4, voice: 2, staff: 2 })}
    ${shift('stop', { staff: 2, number: 1 })}
  `]));
  const normalized = normalizePolyphonicOctaveShifts(source);
  assert.deepEqual(normalized.octaveShiftMarkers.map((marker) => marker.cursorDivisions), [0, 4]);
  const result = projectParsedMusicXmlWithOctaveShiftCompatibility(source);
  assert.deepEqual(result.sourceModel.measures[0].events.map((event) => event.pitch.written), ['C4', 'G4']);
});

test('PS-6B2B keeps independent shift numbers and staffs separate', () => {
  const source = parsed(document([`
    ${shift('down', { staff: 1, number: 1, size: 8 })}
    ${shift('up', { staff: 2, number: 1, size: 15 })}
    ${shift('down', { staff: 1, number: 2, size: 22 })}
    ${shift('stop', { staff: 1, number: 2 })}
    ${shift('stop', { staff: 2, number: 1 })}
    ${shift('stop', { staff: 1, number: 1 })}
  `]));
  const normalized = normalizePolyphonicOctaveShifts(source);
  assert.equal(normalized.octaveShiftMarkers.length, 6);
  assert.deepEqual(
    normalized.octaveShiftMarkers.filter((marker) => marker.type === 'down' || marker.type === 'up')
      .map((marker) => [marker.staff, marker.number, marker.displayOctaveDelta]),
    [[1, 1, -1], [1, 2, -3], [2, 1, 2]],
  );
});

test('PS-6B2B fails closed on orphan, overlapping, mismatched and unterminated chains', () => {
  const fixtures = [
    document([`${shift('stop')}`], { staves: 1 }),
    document([`${shift('down', { size: 8 })}${shift('up', { size: 8 })}${shift('stop')}`], { staves: 1 }),
    document([`${shift('down', { size: 8 })}${shift('stop', { size: 15 })}`], { staves: 1 }),
    document([`${shift('down', { size: 8 })}`], { staves: 1 }),
    document([`${shift('continue')}`], { staves: 1 }),
  ];
  for (const xml of fixtures) {
    assert.throws(
      () => normalizePolyphonicOctaveShifts(parsed(xml)),
      (error) => error.code === 'INVALID_POLYPHONIC_OCTAVE_SHIFT',
    );
  }
});

test('PS-6B2B fails closed on unsupported octave-shift sizes', () => {
  const source = parsed(document([`${shift('down', { size: 9 })}${shift('stop', { size: 9 })}`], { staves: 1 }));
  assert.throws(
    () => normalizePolyphonicOctaveShifts(source),
    (error) => error.code === 'UNSUPPORTED_POLYPHONIC_OCTAVE_SHIFT',
  );
});

test('PS-6B2B leaves offset or mixed octave-shift directions for a later gate', () => {
  const offsetSource = parsed(document([`
    ${shift('down', { extra: '<offset>-4</offset>', size: 8 })}
    ${note('C', 4)}
    ${shift('stop')}
  `], { staves: 1 }));
  assert.equal(
    unsupportedFeature(() => projectParsedMusicXmlWithOctaveShiftCompatibility(offsetSource)),
    'measure-child:direction',
  );

  const mixed = parsed(document([`
    <direction><direction-type><words>8va</words><octave-shift type="down" size="8"/></direction-type><staff>1</staff></direction>
    ${note('C', 4)}
    ${shift('stop')}
  `], { staves: 1 }));
  assert.equal(
    unsupportedFeature(() => projectParsedMusicXmlWithOctaveShiftCompatibility(mixed)),
    'measure-child:direction',
  );
});

test('PS-6B2B source document remains unchanged and result provenance is immutable', () => {
  const source = parsed(document([`${shift('down', { size: 8 })}${note('C', 4)}${shift('stop')}`], { staves: 1 }));
  const originalDirections = source.root.children
    .find((child) => child.name === 'part').children[0].children
    .filter((child) => child.name === 'direction').length;
  const normalized = normalizePolyphonicOctaveShifts(source);
  const sourceDirections = source.root.children
    .find((child) => child.name === 'part').children[0].children
    .filter((child) => child.name === 'direction').length;

  assert.equal(sourceDirections, originalDirections);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.octaveShiftMarkers), true);
  assert.equal(Object.isFrozen(normalized.octaveShiftMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B2B remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicOctaveShifts, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithOctaveShiftCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION, undefined);
});
