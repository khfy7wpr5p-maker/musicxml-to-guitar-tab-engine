'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProcessingBudget,
} = require('../src/core/processingBudget');
const {
  PROCESSING_ABORTED,
  PROCESSING_DEADLINE_EXCEEDED,
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const {
  convertMusicXmlToCanonicalTab,
} = require('../src/core/conversionPipeline');
const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  parseMusicXmlNotes,
} = require('../src/parser/musicxmlNoteParser');
const {
  preflightMusicXml,
} = require('../src/validation/musicxmlPreflight');
const {
  XmlSafetyError,
} = require('../src/validation/xmlSafety');

const validScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const twoNoteScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type><staff>1</staff>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('keeps AbortSignal outside the static ProcessingBudget contract', () => {
  const controller = new AbortController();

  assert.throws(
    () => createProcessingBudget({ signal: controller.signal }),
    (error) => {
      assert.equal(error.code, 'INVALID_PROCESSING_BUDGET');
      assert.deepEqual(error.details, {
        field: 'signal',
        value: controller.signal,
      });
      return true;
    },
  );

  const runtime = createProcessingRuntime({ signal: controller.signal });
  assert.equal(runtime.documentType, 'ProcessingRuntime');
  assert.equal(runtime.budget.documentType, 'ProcessingBudget');
});

test('accepts the exact processing deadline boundary and rejects the first value beyond it', () => {
  const observed = [0, 10, 11];
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    { clock: () => observed.shift() },
  );

  assert.equal(runtime.checkpoint('deadline:boundary'), 10);
  assert.throws(
    () => runtime.checkpoint('deadline:overflow'),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, PROCESSING_DEADLINE_EXCEEDED);
      assert.deepEqual(error.details, {
        field: 'maxProcessingMilliseconds',
        limit: 10,
        observed: 11,
        phase: 'deadline:overflow',
      });
      assert.equal(Object.isFrozen(error.details), true);
      return true;
    },
  );
});

test('rejects a non-monotonic injected clock as invalid configuration', () => {
  const observed = [5, 4];
  const runtime = createProcessingRuntime({}, { clock: () => observed.shift() });

  assert.throws(
    () => runtime.checkpoint('clock:regression'),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, 'INVALID_CONFIGURATION');
      assert.deepEqual(error.details, {
        field: 'clock',
        phase: 'clock:regression',
      });
      return true;
    },
  );
});

test('preflight classifies a pre-aborted signal as a blocked safety issue', () => {
  const controller = new AbortController();
  controller.abort();

  const report = preflightMusicXml(validScore, { signal: controller.signal });

  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.canProcess, false);
  assert.equal(report.issues[0].category, 'safety');
  assert.equal(report.issues[0].code, PROCESSING_ABORTED);
  assert.equal(report.issues[0].details.field, 'signal');
  assert.equal(report.issues[0].details.phase, 'musicxml:start');
});

test('deadline checkpoints interrupt the SAX pass without returning a partial parsed result', () => {
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => phase === 'xml:open-tag' ? 11 : 0,
    },
  );

  assert.throws(
    () => parseMusicXmlNotes(validScore, {}, runtime),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, PROCESSING_DEADLINE_EXCEEDED);
      assert.equal(error.details.phase, 'xml:open-tag');
      return true;
    },
  );
});

test('public conversion returns no canonical result when a post-preflight phase exceeds the deadline', () => {
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => phase === 'canonical-tab-result:start' ? 11 : 0,
    },
  );

  const result = convertMusicXmlToCanonicalTab(validScore, {}, runtime);

  assert.equal(result.preflight.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, PROCESSING_DEADLINE_EXCEEDED);
  assert.equal(result.preflight.issues[0].details.phase, 'canonical-tab-result:start');
  assert.equal(result.canonicalTabResult, null);
});

test('public conversion stops inside candidate generation when the deadline expires', () => {
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => phase === 'fingering:candidates:event' ? 11 : 0,
    },
  );

  const result = convertMusicXmlToCanonicalTab(validScore, {}, runtime);

  assert.equal(result.preflight.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, PROCESSING_DEADLINE_EXCEEDED);
  assert.equal(result.preflight.issues[0].details.phase, 'fingering:candidates:event');
  assert.equal(result.preflight.issues[0].details.measureIndex, 0);
  assert.equal(result.preflight.issues[0].details.eventIndex, 0);
  assert.equal(result.canonicalTabResult, null);
});

test('direct canonical TAB parsing observes cancellation inside optimizer transitions', () => {
  const controller = new AbortController();
  let cancellationInjected = false;
  const runtime = createProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'fingering:optimizer:transition' && !cancellationInjected) {
          cancellationInjected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );

  assert.throws(
    () => parseCanonicalTabResult(twoNoteScore, {}, runtime),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, PROCESSING_ABORTED);
      assert.equal(error.details.phase, 'fingering:optimizer:transition');
      assert.equal(error.details.layerIndex, 1);
      return true;
    },
  );
});

test('rejects invalid signal configuration before parsing', () => {
  assert.throws(
    () => createProcessingRuntime({ signal: {} }),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, 'INVALID_CONFIGURATION');
      assert.deepEqual(error.details, { field: 'signal' });
      return true;
    },
  );
});
