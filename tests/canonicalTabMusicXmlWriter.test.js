'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const { SaxesParser } = require('saxes');

const { parseCanonicalTabResult } = require('../src/parser/parseCanonicalTabResult');
const { validateMusicXml } = require('../src/validation/musicxmlValidation');
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
  return parseCanonicalTabResult(score(note({ rest: true }), { beats: 1, divisions: 1 }));
}

function emptyMeasureResult() {
  return parseCanonicalTabResult(score(''));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectWriterCode(fn, code, rule = undefined) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabMusicXmlWriterError);
    assert.equal(error.code, code);
    if (rule !== undefined) {
      assert.equal(error.details.rule, rule);
    }
    return true;
  });
}

function parseXmlTree(xml) {
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  let root = null;

  parser.on('error', (error) => { throw error; });
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
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on('text', (value) => {
    if (stack.length > 0) stack[stack.length - 1].text += value;
  });
  parser.on('closetag', () => { stack.pop(); });
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
    if (child.name === name) matches.push(child);
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
  if (directChild(noteNode, 'rest')) return 'rest';
  const pitch = directChild(noteNode, 'pitch');
  const step = text(directChild(pitch, 'step'));
  const alter = text(directChild(pitch, 'alter'));
  const octave = text(directChild(pitch, 'octave'));
  return `${step}${alter === null ? '' : `:${alter}`}${octave}`;
}

test('serializes valid data as deterministic, well-formed two-staff MusicXML without mutation', () => {
  const result = fullResult();
  const before = structuredClone(result);
  const first = serializeCanonicalTabResultToMusicXml(result);
  const second = serializeCanonicalTabResultToMusicXml(result);
  const root = parseXmlTree(first);

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.deepEqual(validateMusicXml(first), {
    format: 'score-partwise',
    version: '4.0',
    partId: 'P1',
    measureCount: 2,
  });
  assert.equal(root.name, 'score-partwise');
  assert.equal(root.attributes.version, '4.0');
  assert.equal(first.includes('<!DOCTYPE'), false);
  assert.equal(first.includes('<!ENTITY'), false);
  assert.deepEqual(result, before);
  assert.ok(Object.isFrozen(result));
});

test('preserves notation, TAB, rests, timing, ties and beams while using selectedPosition only', () => {
  const original = fullResult();
  const alteredAlternatives = cloneJson(original);
  alteredAlternatives.measures[0].events[0].alternativePositions = [{ string: 6, fret: 20 }];
  const xml = serializeCanonicalTabResultToMusicXml(original);

  assert.equal(serializeCanonicalTabResultToMusicXml(alteredAlternatives), xml);
  const root = parseXmlTree(xml);
  const measures = measureNodes(root);
  assert.deepEqual(measures.map((measure) => measure.attributes.number), ['1', '2']);
  assert.deepEqual(notesOnStaff(measures[0], 1).map(pitchKey), ['C5', 'D:15', 'E5', 'rest']);
  assert.deepEqual(notesOnStaff(measures[0], 2).map(pitchKey), ['C4', 'D:14', 'E4', 'rest']);
  assert.deepEqual(notesOnStaff(measures[1], 1).map(pitchKey), ['C5', 'F5']);
  assert.deepEqual(notesOnStaff(measures[1], 2).map(pitchKey), ['C4', 'F4']);
  assert.deepEqual(measures.map((measure) => text(directChild(directChild(measure, 'backup'), 'duration'))), ['16', '16']);

  const notationNote = notesOnStaff(measures[0], 1)[0];
  const tabNote = notesOnStaff(measures[0], 2)[0];
  assert.equal(descendants(notationNote, 'technical').length, 0);
  assert.equal(text(descendants(tabNote, 'string')[0]), '3');
  assert.equal(text(descendants(tabNote, 'fret')[0]), '5');
  assert.deepEqual(directChildren(notationNote, 'tie').map((entry) => entry.attributes.type), ['start']);
  assert.deepEqual(directChildren(notesOnStaff(measures[0], 1)[1], 'beam').map((entry) => ({
    number: entry.attributes.number,
    value: text(entry),
  })), [{ number: '1', value: 'begin' }]);
});

test('writes standard six-string tuning, rests and empty measures without invented events', () => {
  const fullRoot = parseXmlTree(serializeCanonicalTabResultToMusicXml(fullResult()));
  const details = descendants(fullRoot, 'staff-details')[0];
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

  const restMeasure = measureNodes(parseXmlTree(
    serializeCanonicalTabResultToMusicXml(restOnlyResult()),
  ))[0];
  for (const staff of [1, 2]) {
    const notes = notesOnStaff(restMeasure, staff);
    assert.equal(notes.length, 1);
    assert.ok(directChild(notes[0], 'rest'));
    assert.equal(descendants(notes[0], 'string').length, 0);
    assert.equal(descendants(notes[0], 'fret').length, 0);
  }

  const emptyMeasure = measureNodes(parseXmlTree(
    serializeCanonicalTabResultToMusicXml(emptyMeasureResult()),
  ))[0];
  assert.equal(directChildren(emptyMeasure, 'note').length, 0);
  assert.equal(directChildren(emptyMeasure, 'backup').length, 0);
  assert.ok(directChild(emptyMeasure, 'attributes'));
});

test('supports pretty output and matches the independently reviewed golden MusicXML fixture', () => {
  const compact = serializeCanonicalTabResultToMusicXml(singleNoteResult());
  const pretty = serializeCanonicalTabResultToMusicXml(singleNoteResult(), { pretty: true });
  const prettyWithNewline = serializeCanonicalTabResultToMusicXml(singleNoteResult(), {
    pretty: true,
    trailingNewline: true,
  });
  const golden = readFixture('canonical-tab-single-note.golden.musicxml', 'utf8');

  assert.equal(compact.includes('\n'), false);
  assert.match(pretty, /\n  <identification>/);
  assert.equal(pretty.endsWith('\n'), false);
  assert.equal(prettyWithNewline, `${pretty}\n`);
  assert.equal(prettyWithNewline, golden);
  assert.doesNotThrow(() => validateMusicXml(golden));
});

test('adapts shared contract failures to stable MusicXML writer codes and details', () => {
  expectWriterCode(() => serializeCanonicalTabResultToMusicXml(null), 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');
  expectWriterCode(() => serializeCanonicalTabResultToMusicXml({}), 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');

  const unsupportedSchema = cloneJson(singleNoteResult());
  unsupportedSchema.schemaVersion = '2.0.0';
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(unsupportedSchema),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_SCHEMA',
    'UNSUPPORTED_SCHEMA_VERSION',
  );

  const multipleVoices = cloneJson(singleNoteResult());
  multipleVoices.voiceCount = 2;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(multipleVoices),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
    'SAFE_INTEGER_RANGE',
  );

  const nonSequential = cloneJson(singleNoteResult());
  nonSequential.measures[0].events[0].start.divisions = 1;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(nonSequential),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
    'EVENT_START_SEQUENCE_MISMATCH',
  );

  const tuplet = cloneJson(singleNoteResult());
  tuplet.measures[0].events[0].rhythm.timeModification = { actualNotes: 3, normalNotes: 2 };
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(tuplet),
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
    'TIME_MODIFICATION_NOT_SUPPORTED',
  );
});

test('retains MusicXML-specific tuning, beam and XML 1.0 output checks', () => {
  const missingPitch = cloneJson(singleNoteResult());
  missingPitch.guitar.tuning[0].pitch = null;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(missingPitch),
    'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
  );

  const highBeam = cloneJson(fullResult());
  highBeam.measures[0].events[1].rhythm.beam[0].level = 9;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(highBeam),
    'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
  );

  const escaped = cloneJson(singleNoteResult());
  escaped.engine.version = '0.1 & <TAB> "safe"';
  escaped.measures[0].visibleMeasureNumber = '1 & <"\'';
  for (const event of escaped.measures[0].events) {
    event.sourceLocation.measure = escaped.measures[0].visibleMeasureNumber;
  }
  const xml = serializeCanonicalTabResultToMusicXml(escaped);
  const root = parseXmlTree(xml);
  assert.equal(text(descendants(root, 'software')[0]), 'musicxml-to-guitar-tab-engine 0.1 & <TAB> "safe"');
  assert.equal(measureNodes(root)[0].attributes.number, '1 & <"\'');
  assert.match(xml, /0\.1 &amp; &lt;TAB&gt; "safe"/);
  assert.match(xml, /number="1 &amp; &lt;&quot;&apos;"/);

  const invalidCharacter = cloneJson(singleNoteResult());
  invalidCharacter.engine.version = `unsafe${String.fromCharCode(1)}`;
  expectWriterCode(
    () => serializeCanonicalTabResultToMusicXml(invalidCharacter),
    'INVALID_CANONICAL_TAB_MUSICXML_VALUE',
  );
});

test('rejects invalid writer options before serialization', () => {
  const result = singleNoteResult();
  const accessor = {};
  Object.defineProperty(accessor, 'pretty', { enumerable: true, get: () => true });
  const symbolOption = { [Symbol('pretty')]: true };
  for (const options of [null, [], { unknown: true }, { pretty: 2 }, { trailingNewline: 'yes' }, accessor, symbolOption]) {
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
