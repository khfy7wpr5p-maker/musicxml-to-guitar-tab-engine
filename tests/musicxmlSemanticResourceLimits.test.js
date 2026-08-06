'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  convertMusicXmlToCanonicalTab,
} = require('../src/core/conversionPipeline');
const {
  parseMusicXmlNotes,
} = require('../src/parser/musicxmlNoteParser');
const {
  preflightMusicXml,
} = require('../src/validation/musicxmlPreflight');
const {
  XmlSafetyError,
} = require('../src/validation/xmlSafety');

const attributes = `
  <attributes>
    <divisions>1</divisions>
    <time><beats>4</beats><beat-type>4</beat-type></time>
  </attributes>`;

function note(step, duration, type) {
  return `<note>
    <pitch><step>${step}</step><octave>4</octave></pitch>
    <duration>${duration}</duration><voice>1</voice><type>${type}</type><staff>1</staff>
  </note>`;
}

function rest(duration, type) {
  return `<note>
    <rest/><duration>${duration}</duration><voice>1</voice><type>${type}</type><staff>1</staff>
  </note>`;
}

function score(measureBodies) {
  const measures = measureBodies.map((body, index) => `
    <measure number="${index + 1}">
      ${index === 0 ? attributes : ''}
      ${body}
    </measure>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">${measures}
  </part>
</score-partwise>`;
}

const twoMeasureScore = score([
  note('E', 4, 'whole'),
  note('F', 4, 'whole'),
]);

const fourEventScore = score([
  [
    note('E', 1, 'quarter'),
    rest(1, 'quarter'),
    note('F', 1, 'quarter'),
    rest(1, 'quarter'),
  ].join(''),
]);

function expectSafetyLimit(input, options, code, details) {
  assert.throws(
    () => parseMusicXmlNotes(input, options),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, code);
      assert.deepEqual(error.details, details);
      assert.equal(Object.isFrozen(error.details), true);
      return true;
    },
  );
}

test('accepts MusicXML exactly at the configured measure boundary', () => {
  const parsed = parseMusicXmlNotes(twoMeasureScore, { maxMeasures: 2 });
  assert.equal(parsed.measureCount, 2);
});

test('rejects MusicXML when the direct measure count exceeds the configured limit', () => {
  expectSafetyLimit(
    twoMeasureScore,
    { maxMeasures: 1 },
    'MUSICXML_MEASURE_LIMIT_EXCEEDED',
    { field: 'maxMeasures', limit: 1, observed: 2 },
  );
});

test('accepts MusicXML exactly at the configured event boundary', () => {
  const parsed = parseMusicXmlNotes(fourEventScore, { maxEvents: 4 });
  assert.equal(parsed.measures[0].events.length, 4);
});

test('rejects the first note or rest element beyond the configured event limit', () => {
  expectSafetyLimit(
    fourEventScore,
    { maxEvents: 3 },
    'MUSICXML_EVENT_LIMIT_EXCEEDED',
    {
      field: 'maxEvents',
      limit: 3,
      observed: 4,
      measure: '1',
      eventIndex: 3,
    },
  );
});

test('counts MusicXML events cumulatively across measures', () => {
  expectSafetyLimit(
    twoMeasureScore,
    { maxEvents: 1 },
    'MUSICXML_EVENT_LIMIT_EXCEEDED',
    {
      field: 'maxEvents',
      limit: 1,
      observed: 2,
      measure: '2',
      eventIndex: 0,
    },
  );
});

test('maps invalid semantic processing limits to the XML configuration boundary', () => {
  assert.throws(
    () => parseMusicXmlNotes(twoMeasureScore, { maxMeasures: 0 }),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, 'INVALID_CONFIGURATION');
      assert.deepEqual(error.details, { field: 'maxMeasures', value: 0 });
      return true;
    },
  );
});

test('preflight classifies event-limit failures as blocked safety issues', () => {
  const report = preflightMusicXml(fourEventScore, { maxEvents: 3 });

  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.canProcess, false);
  assert.equal(report.summary, null);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].category, 'safety');
  assert.equal(report.issues[0].code, 'MUSICXML_EVENT_LIMIT_EXCEEDED');
  assert.deepEqual(report.issues[0].location, {
    measure: '1',
    eventIndex: 3,
  });
});

test('public conversion returns no canonical result after a semantic limit failure', () => {
  const result = convertMusicXmlToCanonicalTab(fourEventScore, {
    parser: { maxEvents: 3 },
  });

  assert.equal(result.preflight.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, 'MUSICXML_EVENT_LIMIT_EXCEEDED');
  assert.equal(result.canonicalTabResult, null);
});
