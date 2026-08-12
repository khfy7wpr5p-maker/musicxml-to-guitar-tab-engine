'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  SIMULTANEOUS_EVENT_MODEL_VERSION,
  SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
  createSimultaneousEventModel,
} = require('../src/music/simultaneousEventModel');

function score(measureBody, { staves = 2 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-3</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>${staves}</staves>
      </attributes>
      ${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

function note(step, {
  chord = false,
  duration = 4,
  voice = '1',
  staff = 1,
  rest = false,
} = {}) {
  return `<note>${chord ? '<chord/>' : ''}${rest ? '<rest/>' : `<pitch><step>${step}</step><octave>4</octave></pitch>`}<duration>${duration}</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function group(xml) {
  return createSimultaneousEventModel(sourceModel(xml));
}

test('PA-3 exposes a versioned internal simultaneous-event model contract', () => {
  const model = group(score(note('C')));

  assert.equal(SIMULTANEOUS_EVENT_MODEL_VERSION, '1.0.0');
  assert.equal(SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE, 'SimultaneousEventModel');
  assert.equal(model.documentType, 'SimultaneousEventModel');
  assert.equal(model.contractVersion, '1.0.0');
  assert.deepEqual(model.source, {
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    partId: 'P1',
  });
});

test('PA-3 groups source chord notes by identical musical onset without changing source identity', () => {
  const model = group(score([
    note('C'),
    note('E', { chord: true, duration: 2 }),
    note('G'),
  ].join('')));

  assert.equal(model.groupCount, 1);
  assert.deepEqual(model.measures[0].groups, [{
    groupId: 'P1:measure:0:simultaneous:0',
    onsetDivisions: 0,
    memberCount: 2,
    sourceEventIds: [
      'P1:measure:0:note:0',
      'P1:measure:0:note:1',
    ],
    hasSourceChordMarker: true,
    spansVoices: false,
    spansStaves: false,
  }]);
});

test('PA-3 discovers simultaneity across voices even without a source chord marker', () => {
  const model = group(score([
    note('C', { voice: '1' }),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: '2' }),
  ].join('')));

  assert.deepEqual(model.measures[0].groups[0], {
    groupId: 'P1:measure:0:simultaneous:0',
    onsetDivisions: 0,
    memberCount: 2,
    sourceEventIds: [
      'P1:measure:0:note:0',
      'P1:measure:0:note:1',
    ],
    hasSourceChordMarker: false,
    spansVoices: true,
    spansStaves: false,
  });
});

test('PA-3 discovers simultaneity across staff 1 and staff 2 without inventing a guitar voicing', () => {
  const model = group(score([
    note('C', { staff: 1 }),
    '<backup><duration>4</duration></backup>',
    note('E', { staff: 2, voice: '2' }),
  ].join('')));

  assert.equal(model.measures[0].groups[0].spansVoices, true);
  assert.equal(model.measures[0].groups[0].spansStaves, true);
  assert.deepEqual(
    Object.keys(model.measures[0].groups[0]).sort(),
    [
      'groupId',
      'hasSourceChordMarker',
      'memberCount',
      'onsetDivisions',
      'sourceEventIds',
      'spansStaves',
      'spansVoices',
    ].sort(),
  );
});

test('PA-3 combines source-chord and cross-voice facts into one onset group in source order', () => {
  const model = group(score([
    note('C', { voice: '1', staff: 1 }),
    note('E', { chord: true, voice: '1', staff: 1 }),
    '<backup><duration>4</duration></backup>',
    note('G', { voice: '2', staff: 2 }),
  ].join('')));

  assert.deepEqual(model.measures[0].groups[0], {
    groupId: 'P1:measure:0:simultaneous:0',
    onsetDivisions: 0,
    memberCount: 3,
    sourceEventIds: [
      'P1:measure:0:note:0',
      'P1:measure:0:note:1',
      'P1:measure:0:note:2',
    ],
    hasSourceChordMarker: true,
    spansVoices: true,
    spansStaves: true,
  });
});

test('PA-3 excludes rests and does not create singleton simultaneous groups', () => {
  const model = group(score([
    note('C', { voice: '1' }),
    '<backup><duration>4</duration></backup>',
    note('C', { voice: '2', rest: true }),
  ].join('')));

  assert.equal(model.groupCount, 0);
  assert.deepEqual(model.measures[0].groups, []);
});

test('PA-3 groups by onset rather than duration', () => {
  const model = group(score([
    note('C', { duration: 4 }),
    note('E', { chord: true, duration: 2 }),
  ].join('')));

  assert.equal(model.groupCount, 1);
  assert.equal(model.measures[0].groups[0].onsetDivisions, 0);
  assert.equal(model.measures[0].groups[0].memberCount, 2);
});

test('PA-3 orders groups by onset while preserving member source order', () => {
  const model = group(score([
    note('C', { voice: '1' }),
    note('D', { voice: '1' }),
    '<backup><duration>8</duration></backup>',
    note('E', { voice: '2' }),
    note('F', { voice: '2' }),
  ].join('')));

  assert.deepEqual(
    model.measures[0].groups.map((entry) => ({
      onset: entry.onsetDivisions,
      sourceEventIds: entry.sourceEventIds,
    })),
    [
      {
        onset: 0,
        sourceEventIds: ['P1:measure:0:note:0', 'P1:measure:0:note:2'],
      },
      {
        onset: 4,
        sourceEventIds: ['P1:measure:0:note:1', 'P1:measure:0:note:3'],
      },
    ],
  );
});

test('PA-3 output is deeply immutable and contains no pitch/string/fret arrangement authority', () => {
  const model = group(score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: '2' }),
  ].join('')));

  const groupEntry = model.measures[0].groups[0];
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.measures), true);
  assert.equal(Object.isFrozen(model.measures[0]), true);
  assert.equal(Object.isFrozen(model.measures[0].groups), true);
  assert.equal(Object.isFrozen(groupEntry), true);
  assert.equal(Object.isFrozen(groupEntry.sourceEventIds), true);
  assert.equal('pitch' in groupEntry, false);
  assert.equal('string' in groupEntry, false);
  assert.equal('fret' in groupEntry, false);
  assert.equal('selected' in groupEntry, false);
});

test('PA-3 revalidates its PolyphonicSourceModel input fail-closed before grouping', () => {
  const valid = sourceModel(score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: '2' }),
  ].join('')));
  const hostile = structuredClone(valid);
  hostile.measures[0].events[1].sourceEventId = hostile.measures[0].events[0].sourceEventId;

  assert.throws(
    () => createSimultaneousEventModel(hostile),
    (error) => {
      assert.equal(error.code, 'INVALID_POLYPHONIC_SOURCE_MODEL');
      return true;
    },
  );
});
