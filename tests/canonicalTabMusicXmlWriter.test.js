'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const { SaxesParser } = require('saxes');

const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  validateMusicXml,
} = require('../src/validation/musicxmlValidation');
const {
  CanonicalTabMusicXmlWriterError,
  serializeCanonicalTabResultToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriter');

function readFixture(name, encoding = null) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), encoding || undefined);
}

function score(measureXml, {
  beats = 4,
  beatType = 4,
  divisions = 4,
  number = '1',
  implicit = false,
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="${number}"${implicit ? ' implicit="yes"' : ''}>
      <attributes>
        <divisions>${divisions}</divisions>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${measureXml}
    </measure>
  </part>
</score-partwise>`;
}

function note({
  step = 'C',
  alter = 0,
  octave = 4,
  duration = 1,
  type = 'quarter',
  rest = false,
  extra = '',
} = {}) {
  const pitch = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step>${alter === 0 ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch>`;
  return `<note>${extra}${pitch}<duration>${duration}</duration><voice>1</voice><type>${type}</type><staff>1</staff></note>`;
}

function fullResult() {
  return parseCanonicalTabResult(readFixture('parser-single-voice.musicxml'));
}

function singleNoteResult() {
  return parseCanonicalTabResult(score(note(), { beats: 1, divisions: 1 }));
}

function restOnlyResult() {
  return parseCanonicalTabResult(score(
    note({ rest: true }),
    { beats: 1, divisions: 1 },
  ));
}

function emptyMeasureResult() {
  return parseCanonicalTabResult(score(''));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectWriterCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabMusicXmlWriterError);
    assert.equal(error.code, code);
    return true;
  });
}

function parseXmlTree(xml) {
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  let root = null;

  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    const attributes = Object.fromEntries(
      Object.entries(tag.attributes || {}).map(([key, attribute]) => [
        attribute.local || key,
        attribute.value,
      ]),
    );
    const node = {
      name: tag.local || tag.name,
      attributes,
      text: '',
      children: [],
    };
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      root = node;
    }
    stack.push(node);
  });
  parser.on('text', (value) => {
    if (stack.length > 0) {
      stack[stack.length - 1].text += value;
    }
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.write(xml).close();
  return root;
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name);
}

function directChild(node, name) {
  return directChildren(node, name)[0] || null;
}

function descendants(node, name) {
  const matches = [];
  for (const child of node.children) {
    if (child.name === name) {
      matches.push(child);
    }
    matches.push(...descendants(child, name));
  }
  return matches;
}

function text(node) {
  return node ? node.text.trim() : null;
}

function measureNodes(root) {
  return directChildren(directChild(root, 'part'), 'measure');
}

function notesOnStaff(measure, staff) {
  return directChildren(measure, 'note').filter(
    (noteNode) => text(directChild(noteNode, 'staff')) === String(staff),
  );
}

function pitchKey(noteNode) {
  if (directChild(noteNode, 'rest')) {
    return 'rest';
  }
  const pitch = directChild(noteNode, 'pitch');
  const step = text(directChild(pitch, 'step'));
  const alter = text(directChild(pitch, 'alter'));
  const octave = text(directChild(pitch, 'octave'));
  return `${step}${alter === null ? '' : `:${alter}`}${octave}`;
}

test('serializes a valid CanonicalTabResult as well-formed single-part MusicXML', () => {
  const xml = serializeCanonicalTabResultToMusicXml(fullResult());
  const validated = validateMusicXml(xml);
  const root = parseXmlTree(xml);

  assert.deepEqual(validated, {
    format: 'score-partwise',
    version: '4.0',
    partId: 'P1',
    measureCount: 2,
  });
  assert.equal(root.name, 'score-partwise');
  assert.equal(root.attributes.version, '4.0');
  assert.equal(xml.includes('<!DOCTYPE'), false);
  assert.equal(xml.includes('<!ENTITY'), false);
});

test('returns byte-identical output without mutating deeply frozen input', () => {
  const result = fullResult();
  const before = structuredClone(result);

  const first = serializeCanonicalTabResultToMusicXml(result);
  const second = serializeCanonicalTabResultToMusicXml(result);
  const pretty = serializeCanonicalTabResultToMusicXml(result, { pretty: true });
  const prettyWithNewline = serializeCanonicalTabResultToMusicXml(result, {
    pretty: true,
    trailingNewline: true,
  });

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.match(pretty, /\n  <identification>/);
  assert.equal(pretty.endsWith('\n'), false);
  assert.equal(prettyWithNewline, `${pretty}\n`);
  assert.deepEqual(result, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.measures[0].events[0]));
});

test('uses one guitar part with a regular notation staff and alternate TAB staff', () => {
  const root = parseXmlTree(
    serializeCanonicalTabResultToMusicXml(fullResult()),
  );
  const firstMeasure = measureNodes(root)[0];
  const attributes = directChild(firstMeasure, 'attributes');

  assert.equal(text(directChild(attributes, 'staves')), '2');
  assert.equal(text(directChild(attributes, 'part-symbol')), 'none');

  const clefs = directChildren(attributes, 'clef');
  assert.deepEqual(clefs.map((clef) => ({
    number: clef.attributes.number,
    sign: text(directChild(clef, 'sign')),
    line: text(directChild(clef, 'line')),
  })), [
    { number: '1', sign: 'G', line: '2' },
    { number: '2', sign: 'TAB', line: '5' },
  ]);

  const details = directChild(attributes, 'staff-details');
  assert.equal(details.attributes.number, '2');
  assert.equal(details.attributes['show-frets'], 'numbers');
  assert.equal(text(directChild(details, 'staff-type')), 'alternate');
  assert.equal(text(directChild(details, 'staff-lines')), '6');
  assert.deepEqual(directChildren(details, 'staff-tuning').map((tuning) => ({
    line: tuning.attributes.line,
    step: text(directChild(tuning, 'tuning-step')),
    octave: text(directChild(tuning, 'tuning-octave')),
  })), [
    { line: '1', step: 'E', octave: '2' },
    { line: '2', step: 'A', octave: '2' },
    { line: '3', step: 'D', octave: '3' },
    { line: '4', step: 'G', octave: '3' },
    { line: '5', step: 'B', octave: '3' },
    { line: '6', step: 'E', octave: '4' },
  ]);
});

test('preserves measure order and mirrors the original note/rest sequence on both staves', () => {
  const root = parseXmlTree(
    serializeCanonicalTabResultToMusicXml(fullResult()),
  );
  const measures = measureNodes(root);

  assert.deepEqual(measures.map((measure) => measure.attributes.number), ['1', '2']);
  assert.deepEqual(notesOnStaff(measures[0], 1).map(pitchKey), [
    'C4', 'D:14', 'E4', 'rest',
  ]);
  assert.deepEqual(notesOnStaff(measures[0], 2).map(pitchKey), [
    'C4', 'D:14', 'E4', 'rest',
  ]);
  assert.deepEqual(notesOnStaff(measures[1], 1).map(pitchKey), ['C4', 'F4']);
  assert.deepEqual(notesOnStaff(measures[1], 2).map(pitchKey), ['C4', 'F4']);

  const backupDurations = measures.map((measure) => (
    text(directChild(directChild(measure, 'backup'), 'duration'))
  ));
  assert.deepEqual(backupDurations, ['16', '16']);
});

test('preserves durations, note types, dots, ties and beams on both staves', () => {
  const root = parseXmlTree(
    serializeCanonicalTabResultToMusicXml(fullResult()),
  );
  const measures = measureNodes(root);

  for (const staff of [1, 2]) {
    const firstMeasureNotes = notesOnStaff(measures[0], staff);
    const secondMeasureNotes = notesOnStaff(measures[1], staff);

    assert.deepEqual(firstMeasureNotes.map((noteNode) => text(directChild(noteNode, 'duration'))), [
      '4', '2', '2', '8',
    ]);
    assert.deepEqual(firstMeasureNotes.map((noteNode) => text(directChild(noteNode, 'type'))), [
      'quarter', 'eighth', 'eighth', 'half',
    ]);
    assert.equal(directChildren(secondMeasureNotes[1], 'dot').length, 1);
    assert.equal(text(directChild(secondMeasureNotes[1], 'duration')), '12');

    assert.deepEqual(directChildren(firstMeasureNotes[0], 'tie').map(
      (tie) => tie.attributes.type,
    ), ['start']);
    assert.deepEqual(descendants(firstMeasureNotes[0], 'tied').map(
      (tie) => tie.attributes.type,
    ), ['start']);
    assert.deepEqual(directChildren(secondMeasureNotes[0], 'tie').map(
      (tie) => tie.attributes.type,
    ), ['stop']);
    assert.deepEqual(descendants(secondMeasureNotes[0], 'tied').map(
      (tie) => tie.attributes.type,
    ), ['stop']);

    assert.deepEqual(directChildren(firstMeasureNotes[1], 'beam').map((beam) => ({
      number: beam.attributes.number,
      value: text(beam),
    })), [{ number: '1', value: 'begin' }]);
    assert.deepEqual(directChildren(firstMeasureNotes[2], 'beam').map((beam) => ({
      number: beam.attributes.number,
      value: text(beam),
    })), [{ number: '1', value: 'end' }]);
  }
});

test('uses only selectedPosition for TAB technical data and ignores alternatives', () => {
  const original = fullResult();
  const alteredAlternatives = cloneJson(original);
  alteredAlternatives.measures[0].events[0].alternativePositions = [
    { string: 6, fret: 20 },
  ];

  const originalXml = serializeCanonicalTabResultToMusicXml(original);
  const alteredXml = serializeCanonicalTabResultToMusicXml(alteredAlternatives);
  assert.equal(alteredXml, originalXml);

  const root = parseXmlTree(originalXml);
  const firstMeasure = measureNodes(root)[0];
  const notationNote = notesOnStaff(firstMeasure, 1)[0];
  const tabNote = notesOnStaff(firstMeasure, 2)[0];

  assert.equal(descendants(notationNote, 'technical').length, 0);
  assert.equal(text(descendants(tabNote, 'string')[0]), '3');
  assert.equal(text(descendants(tabNote, 'fret')[0]), '5');
  assert.equal(original.measures[0].events[0].alternativePositions.some(
    (position) => position.string === 2 && position.fret === 1,
  ), true);
});

test('does not emit string or fret elements for rests and supports all-rest scores', () => {
  const root = parseXmlTree(
    serializeCanonicalTabResultToMusicXml(restOnlyResult()),
  );
  const measure = measureNodes(root)[0];

  for (const staff of [1, 2]) {
    const notes = notesOnStaff(measure, staff);
    assert.equal(notes.length, 1);
    assert.ok(directChild(notes[0], 'rest'));
    assert.equal(descendants(notes[0], 'string').length, 0);
    assert.equal(descendants(notes[0], 'fret').length, 0);
  }
  assert.equal(text(directChild(directChild(measure, 'backup'), 'duration')), '1');
  assert.doesNotThrow(() => validateMusicXml(
    serializeCanonicalTabResultToMusicXml(restOnlyResult()),
  ));
});

test('writes an empty measure explicitly without inventing notes or timing', () => {
  const xml = serializeCanonicalTabResultToMusicXml(emptyMeasureResult());
  const root = parseXmlTree(xml);
  const measure = measureNodes(root)[0];

  assert.equal(directChildren(measure, 'note').length, 0);
  assert.equal(directChildren(measure, 'backup').length, 0);
  assert.ok(directChild(measure, 'attributes'));
  assert.doesNotThrow(() => validateMusicXml(xml));
});

test('rejects invalid identities, unsupported schemas and unsupported monophonic structures', () => {
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(null),
    'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
  );
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml({}),
    'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
  );

  const unsupportedSchema = cloneJson(singleNoteResult());
  unsupportedSchema.schemaVersion = '2.0.0';
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(unsupportedSchema),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_SCHEMA',
  );

  const multipleVoices = cloneJson(singleNoteResult());
  multipleVoices.voiceCount = 2;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(multipleVoices),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
  );

  const nonSequential = cloneJson(singleNoteResult());
  nonSequential.measures[0].events[0].start.divisions = 1;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(nonSequential),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
  );

  const tuplet = cloneJson(singleNoteResult());
  tuplet.measures[0].events[0].rhythm.timeModification = {
    actualNotes: 3,
    normalNotes: 2,
  };
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(tuplet),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
  );
});

test('escapes XML text and attributes and rejects invalid XML 1.0 characters', () => {
  const escaped = cloneJson(singleNoteResult());
  escaped.engine.name = 'Engine & <TAB> "safe"';
  escaped.measures[0].visibleMeasureNumber = '1 & <"\'';

  const xml = serializeCanonicalTabResultToMusicXml(escaped);
  const root = parseXmlTree(xml);
  const measure = measureNodes(root)[0];
  assert.equal(
    text(descendants(root, 'software')[0]),
    'Engine & <TAB> "safe" 0.1.0',
  );
  assert.equal(measure.attributes.number, '1 & <"\'');
  assert.match(xml, /Engine &amp; &lt;TAB&gt; "safe"/);
  assert.match(xml, /number="1 &amp; &lt;&quot;&apos;"/);

  const invalidCharacter = cloneJson(singleNoteResult());
  invalidCharacter.engine.name = `unsafe${String.fromCharCode(1)}`;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(invalidCharacter),
    'INVALID_CANONICAL_TAB_MUSICXML_VALUE',
  );
});

test('rejects unknown, accessor, symbol and non-boolean writer options', () => {
  const result = singleNoteResult();
  const accessor = {};
  Object.defineProperty(accessor, 'pretty', {
    enumerable: true,
    get: () => true,
  });
  const symbolOption = { [Symbol('pretty')]: true };

  for (const options of [
    null,
    [],
    { unknown: true },
    { pretty: 2 },
    { trailingNewline: 'yes' },
    accessor,
    symbolOption,
  ]) {
    expectWriterCode(
      () => serializeCanonicalTabResultToMusicXml(result, options),
      'INVALID_CANONICAL_TAB_MUSICXML_OPTIONS',
    );
  }
});

test('loads and runs without importing the candidate generator or fingering optimizer', () => {
  const script = `
    const fs = require('node:fs');
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request.includes('candidateLayerBuilder') || request.includes('fingeringOptimizer')) {
        throw new Error('forbidden dependency: ' + request);
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    const { serializeCanonicalTabResultToMusicXml } = require('./src/writers/canonicalTabMusicXmlWriter');
    const result = JSON.parse(fs.readFileSync('./tests/fixtures/canonical-tab-rest-only.golden.json', 'utf8'));
    serializeCanonicalTabResultToMusicXml(result);
  `;
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, child.stderr);
});

test('matches the independently reviewed single-note golden MusicXML fixture', () => {
  const xml = serializeCanonicalTabResultToMusicXml(singleNoteResult(), {
    pretty: true,
    trailingNewline: true,
  });
  const golden = readFixture('canonical-tab-single-note.golden.musicxml', 'utf8');

  assert.equal(xml, golden);
  const root = parseXmlTree(golden);
  const firstMeasure = measureNodes(root)[0];
  const notationNote = notesOnStaff(firstMeasure, 1)[0];
  const tabNote = notesOnStaff(firstMeasure, 2)[0];
  assert.equal(pitchKey(notationNote), 'C4');
  assert.equal(text(directChild(notationNote, 'duration')), '1');
  assert.equal(text(descendants(tabNote, 'string')[0]), '2');
  assert.equal(text(descendants(tabNote, 'fret')[0]), '1');
  assert.equal(text(directChild(directChild(firstMeasure, 'backup'), 'duration')), '1');
  assert.doesNotThrow(() => validateMusicXml(golden));
});
