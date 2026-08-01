'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SaxesParser } = require('saxes');

const {
  serializeCanonicalTabResultToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriter');
const {
  validateMusicXml,
} = require('../src/validation/musicxmlValidation');
const {
  createCanonicalTabCompatibilityFixture,
} = require('./fixtures/compatibility/canonicalTabCompatibilityFixture');

function parseXmlTree(xml) {
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  let root = null;

  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    const node = {
      name: tag.local || tag.name,
      attributes: Object.fromEntries(
        Object.values(tag.attributes || {}).map((attribute) => [
          attribute.local || attribute.name,
          attribute.value,
        ]),
      ),
      text: '',
      children: [],
    };
    if (stack.length === 0) {
      root = node;
    } else {
      stack[stack.length - 1].children.push(node);
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
  const found = [];
  for (const child of node.children) {
    if (child.name === name) {
      found.push(child);
    }
    found.push(...descendants(child, name));
  }
  return found;
}

function text(node) {
  return node ? node.text.trim() : null;
}

function measures(root) {
  return directChildren(directChild(root, 'part'), 'measure');
}

function notesOnStaff(measure, staff) {
  return directChildren(measure, 'note').filter(
    (noteNode) => text(directChild(noteNode, 'staff')) === String(staff),
  );
}

function eventIdentity(noteNode) {
  if (directChild(noteNode, 'rest')) {
    return 'rest';
  }
  const pitch = directChild(noteNode, 'pitch');
  return [
    text(directChild(pitch, 'step')),
    text(directChild(pitch, 'alter')) || '0',
    text(directChild(pitch, 'octave')),
  ].join(':');
}

function technicalPosition(noteNode) {
  const technical = descendants(noteNode, 'technical')[0];
  if (!technical) {
    return null;
  }
  return {
    string: Number(text(directChild(technical, 'string'))),
    fret: Number(text(directChild(technical, 'fret'))),
  };
}

test('compatibility fixture produces deterministic, secure and well-formed MusicXML', () => {
  const fixture = createCanonicalTabCompatibilityFixture();
  const before = structuredClone(fixture);
  const first = serializeCanonicalTabResultToMusicXml(fixture);
  const second = serializeCanonicalTabResultToMusicXml(fixture);

  assert.equal(first, second);
  assert.deepEqual(fixture, before);
  assert.ok(Object.isFrozen(fixture));
  assert.ok(Object.isFrozen(fixture.measures[4].events[0]));
  assert.equal(first.includes('<!DOCTYPE'), false);
  assert.equal(first.includes('<!ENTITY'), false);
  assert.doesNotMatch(first, /https?:\/\//i);
  assert.deepEqual(validateMusicXml(first), {
    format: 'score-partwise',
    version: '4.0',
    partId: 'P1',
    measureCount: 5,
  });
  assert.equal(parseXmlTree(first).name, 'score-partwise');
});

test('compatibility fixture preserves measures, pickup timing and mirrored event order', () => {
  const root = parseXmlTree(
    serializeCanonicalTabResultToMusicXml(createCanonicalTabCompatibilityFixture()),
  );
  const measureNodes = measures(root);

  assert.deepEqual(measureNodes.map((measure) => measure.attributes.number), [
    '0', '1A', '2', '3', '4',
  ]);
  assert.equal(measureNodes[0].attributes.implicit, 'yes');
  assert.deepEqual(measureNodes.map((measure) => (
    text(directChild(directChild(measure, 'backup'), 'duration'))
  )), ['4', '16', '16', '16', '16']);

  const expectedEvents = [
    ['E:0:4'],
    ['C:0:4'],
    ['rest', 'F:1:4', 'G:0:4', 'A:0:4'],
    ['B:0:3', 'B:-1:3', 'D:0:4', 'E:0:4', 'A:0:3'],
    ['D:0:5', 'D:0:5', 'rest'],
  ];

  for (let index = 0; index < measureNodes.length; index += 1) {
    assert.deepEqual(notesOnStaff(measureNodes[index], 1).map(eventIdentity), expectedEvents[index]);
    assert.deepEqual(notesOnStaff(measureNodes[index], 2).map(eventIdentity), expectedEvents[index]);
  }
});

test('compatibility fixture covers TAB positions, rests, rhythms, beams, ties and tuning', () => {
  const fixture = createCanonicalTabCompatibilityFixture();
  const root = parseXmlTree(serializeCanonicalTabResultToMusicXml(fixture));
  const measureNodes = measures(root);
  const attributes = directChild(measureNodes[0], 'attributes');
  const details = directChild(attributes, 'staff-details');

  assert.equal(text(directChild(attributes, 'staves')), '2');
  assert.equal(text(directChild(details, 'staff-type')), 'alternate');
  assert.equal(text(directChild(details, 'staff-lines')), '6');
  assert.deepEqual(directChildren(details, 'staff-tuning').map((tuning) => ({
    line: Number(tuning.attributes.line),
    step: text(directChild(tuning, 'tuning-step')),
    octave: Number(text(directChild(tuning, 'tuning-octave'))),
  })), [
    { line: 1, step: 'E', octave: 2 },
    { line: 2, step: 'A', octave: 2 },
    { line: 3, step: 'D', octave: 3 },
    { line: 4, step: 'G', octave: 3 },
    { line: 5, step: 'B', octave: 3 },
    { line: 6, step: 'E', octave: 4 },
  ]);

  const tabNotes = measureNodes.flatMap((measure) => notesOnStaff(measure, 2));
  const notationNotes = measureNodes.flatMap((measure) => notesOnStaff(measure, 1));
  const expectedPositions = [
    { string: 1, fret: 0 },
    { string: 3, fret: 5 },
    null,
    { string: 1, fret: 2 },
    { string: 1, fret: 3 },
    { string: 1, fret: 5 },
    { string: 2, fret: 0 },
    { string: 3, fret: 3 },
    { string: 2, fret: 3 },
    { string: 1, fret: 0 },
    { string: 3, fret: 2 },
    { string: 1, fret: 10 },
    { string: 1, fret: 10 },
    null,
  ];

  assert.deepEqual(tabNotes.map(technicalPosition), expectedPositions);
  assert.equal(notationNotes.every((noteNode) => technicalPosition(noteNode) === null), true);
  assert.equal(fixture.measures[1].events[0].alternativePositions.some(
    (candidate) => candidate.string === 2 && candidate.fret === 1,
  ), true);

  const rhythmTypes = new Set(tabNotes.map((noteNode) => text(directChild(noteNode, 'type'))));
  assert.deepEqual([...rhythmTypes].sort(), ['16th', 'eighth', 'half', 'quarter', 'whole']);
  assert.equal(tabNotes.some((noteNode) => directChildren(noteNode, 'dot').length === 1), true);
  assert.equal(descendants(root, 'beam').some((beam) => text(beam) === 'continue'), true);
  assert.deepEqual(descendants(root, 'tie').map((tie) => tie.attributes.type), [
    'start', 'stop', 'start', 'stop',
  ]);
  assert.equal(tabNotes.filter((noteNode) => directChild(noteNode, 'rest')).every(
    (noteNode) => descendants(noteNode, 'string').length === 0
      && descendants(noteNode, 'fret').length === 0,
  ), true);
});

test('changing alternative positions cannot change compatibility MusicXML output', () => {
  const fixture = createCanonicalTabCompatibilityFixture();
  const changedAlternatives = structuredClone(fixture);
  changedAlternatives.measures[1].events[0].alternativePositions = [
    { string: 6, fret: 20 },
  ];

  assert.equal(
    serializeCanonicalTabResultToMusicXml(changedAlternatives),
    serializeCanonicalTabResultToMusicXml(fixture),
  );
});
