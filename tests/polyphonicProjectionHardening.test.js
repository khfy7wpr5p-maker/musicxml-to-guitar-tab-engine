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

function score(measureBody, { staves = 1 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.6</part-name></score-part></part-list>
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

function twoMeasureScore(firstBody, secondBody) {
  return score(firstBody).replace(
    '  </part>\n</score-partwise>',
    `    <measure number="2">\n      ${secondBody}\n    </measure>\n  </part>\n</score-partwise>`,
  );
}

function note(step, {
  chord = false,
  duration = 4,
  voice = '1',
  staff = 1,
} = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function parseAndProject(xml, runtime) {
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

test('PA-2.6 chord notes cannot bypass the semantic maxEvents budget', () => {
  const runtime = createMusicXmlProcessingRuntime({ maxEvents: 1 });
  const xml = score([
    note('C'),
    note('E', { chord: true }),
  ].join(''));

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'MUSICXML_EVENT_LIMIT_EXCEEDED');
      assert.equal(error.details.field, 'maxEvents');
      assert.equal(error.details.limit, 1);
      assert.equal(error.details.observed, 2);
      assert.equal(error.details.measure, '1');
      assert.equal(error.details.eventIndex, 1);
      return true;
    },
  );
});

test('PA-2.6 inherited timing on later measures cannot bypass maxMeasures', () => {
  const runtime = createMusicXmlProcessingRuntime({ maxMeasures: 1 });
  const xml = twoMeasureScore(note('C'), note('D'));

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'MUSICXML_MEASURE_LIMIT_EXCEEDED');
      assert.equal(error.details.field, 'maxMeasures');
      assert.equal(error.details.limit, 1);
      assert.equal(error.details.observed, 2);
      return true;
    },
  );
});

test('PA-2.6 cursor-heavy hostile input remains bounded by upstream XML element limits', () => {
  const cursorFlood = Array.from(
    { length: 24 },
    () => '<forward><duration>1</duration></forward>',
  ).join('');
  const runtime = createMusicXmlProcessingRuntime({ maxElements: 40 });

  assert.throws(
    () => parseAndProject(score(cursorFlood), runtime),
    (error) => {
      assert.equal(error.code, 'XML_ELEMENT_LIMIT_EXCEEDED');
      assert.equal(error.details.field, 'maxElements');
      assert.equal(error.details.limit, 40);
      return true;
    },
  );
});

test('PA-2.6 deadline is enforced at a backup/forward timing-operation checkpoint', () => {
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => phase === 'polyphonic-projector:cursor' ? 11 : 0,
    },
  );
  const xml = score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: '2' }),
  ].join(''));

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'polyphonic-projector:cursor');
      assert.equal(error.details.operation, 'backup');
      assert.equal(error.details.cursor, 4);
      assert.equal(error.details.measureIndex, 0);
      return true;
    },
  );
});

test('PA-2.6 cancellation is observed before a cursor operation after an event', () => {
  const controller = new AbortController();
  let injected = false;
  const runtime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'polyphonic-projector:event' && !injected) {
          injected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );
  const xml = score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: '2' }),
  ].join(''));

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'polyphonic-projector:cursor');
      assert.equal(error.details.operation, 'backup');
      assert.equal(error.details.cursor, 4);
      return true;
    },
  );
});

test('PA-2.6 every chord source note remains individually deadline-checkpointed', () => {
  let eventCheckpoints = 0;
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => {
        if (phase !== 'polyphonic-projector:event') {
          return 0;
        }
        eventCheckpoints += 1;
        return eventCheckpoints >= 2 ? 11 : 0;
      },
    },
  );
  const xml = score([
    note('C'),
    note('E', { chord: true }),
  ].join(''));

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'polyphonic-projector:event');
      assert.equal(error.details.sourceOrder, 1);
      assert.equal(error.details.measureIndex, 0);
      return true;
    },
  );
});

test('PA-2.6 cancellation is observed before projecting a later voice/staff event', () => {
  const controller = new AbortController();
  let injected = false;
  const runtime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'polyphonic-projector:cursor' && !injected) {
          injected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );
  const xml = score([
    note('C', { voice: 'upper', staff: 1 }),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: 'lower', staff: 2 }),
  ].join(''), { staves: 2 });

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'polyphonic-projector:event');
      assert.equal(error.details.sourceOrder, 1);
      assert.equal(error.details.measureIndex, 0);
      return true;
    },
  );
});

test('PA-2.6 preflight event scanning remains deadline-bounded before detailed projection', () => {
  let preflightEventCheckpoints = 0;
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => {
        if (phase !== 'polyphonic-projector:preflight-event') {
          return 0;
        }
        preflightEventCheckpoints += 1;
        return preflightEventCheckpoints >= 2 ? 11 : 0;
      },
    },
  );
  const xml = score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('D', { voice: '2' }),
  ].join(''));

  assert.throws(
    () => parseAndProject(xml, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'polyphonic-projector:preflight-event');
      assert.equal(error.details.sourceOrder, 1);
      assert.equal(error.details.measureIndex, 0);
      return true;
    },
  );
});
