'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
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
  SUSTAIN_TIE_GRAPH_VERSION,
  SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
  SUSTAIN_TIE_GRAPH_AUTHORITY,
  createSustainTieGraph,
} = require('../src/music/sustainTieGraph');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function tieMarkup({ start = false, stop = false } = {}) {
  const ties = [
    ...(stop ? ['<tie type="stop"/>'] : []),
    ...(start ? ['<tie type="start"/>'] : []),
  ].join('');
  const tied = [
    ...(stop ? ['<tied type="stop"/>'] : []),
    ...(start ? ['<tied type="start"/>'] : []),
  ].join('');
  return { ties, notations: tied ? `<notations>${tied}</notations>` : '' };
}

function note(step, {
  octave = 4,
  duration = 16,
  voice = '1',
  start = false,
  stop = false,
  rest = false,
} = {}) {
  const tie = tieMarkup({ start, stop });
  const pitch = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
  return `<note>${pitch}<duration>${duration}</duration>${tie.ties}<voice>${voice}</voice><staff>1</staff>${tie.notations}</note>`;
}

function measure(number, body, { attributes = false } = {}) {
  return `<measure number="${number}">${attributes ? `
    <attributes>
      <divisions>4</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <staves>1</staves>
    </attributes>` : ''}${body}</measure>`;
}

function score(measures) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-2</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function graph(xml, runtime = null) {
  return createSustainTieGraph(sourceModel(xml), runtime);
}

test('PS-2 exposes a versioned internal sustain/tie-facts-only contract without package-root authority', () => {
  const model = graph(fixture('ui07-poly-unison-tie.musicxml'));

  assert.equal(SUSTAIN_TIE_GRAPH_VERSION, '1.0.0');
  assert.equal(SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE, 'SustainTieGraph');
  assert.equal(SUSTAIN_TIE_GRAPH_AUTHORITY, 'SUSTAIN_TIE_FACTS_ONLY');
  assert.equal(model.documentType, 'SustainTieGraph');
  assert.equal(model.contractVersion, '1.0.0');
  assert.equal(model.authority, 'SUSTAIN_TIE_FACTS_ONLY');
  assert.equal(publicApi.createSustainTieGraph, undefined);
});

test('PS-2 links a real cross-measure tie without confusing an untied unison in another voice', () => {
  const model = graph(fixture('ui07-poly-unison-tie.musicxml'));

  assert.equal(model.sustainChainCount, 1);
  assert.equal(model.tieSegmentCount, 2);
  assert.equal(model.chains[0].voice, '1');
  assert.equal(model.chains[0].staff, 1);
  assert.equal(model.chains[0].pitch.written, 'C4');
  assert.equal(model.chains[0].segmentCount, 2);
  assert.equal(model.chains[0].spansMeasures, true);
  assert.equal(model.chains[0].measureSpanCount, 2);
  assert.deepEqual(model.chains[0].sourceEventIds, [
    'P1:measure:0:note:0',
    'P1:measure:1:note:0',
  ]);
  assert.deepEqual(model.memberships, [
    {
      sourceEventId: 'P1:measure:0:note:0',
      sustainChainId: 'P1:sustain-chain:0',
      segmentIndex: 0,
    },
    {
      sourceEventId: 'P1:measure:1:note:0',
      sustainChainId: 'P1:sustain-chain:0',
      segmentIndex: 1,
    },
  ]);
});

test('PS-2 preserves a stop+start middle segment as one three-measure sustain chain', () => {
  const xml = score([
    measure('1', note('C', { start: true }), { attributes: true }),
    measure('2', note('C', { stop: true, start: true })),
    measure('3', note('C', { stop: true })),
  ].join(''));
  const model = graph(xml);

  assert.equal(model.sustainChainCount, 1);
  assert.equal(model.tieSegmentCount, 3);
  assert.equal(model.chains[0].segmentCount, 3);
  assert.equal(model.chains[0].measureSpanCount, 3);
  assert.deepEqual(model.chains[0].sourceEventIds, [
    'P1:measure:0:note:0',
    'P1:measure:1:note:0',
    'P1:measure:2:note:0',
  ]);
  assert.deepEqual(
    model.chains[0].segments.map((segment) => ({
      index: segment.segmentIndex,
      start: segment.tieStart,
      stop: segment.tieStop,
    })),
    [
      { index: 0, start: true, stop: false },
      { index: 1, start: true, stop: true },
      { index: 2, start: false, stop: true },
    ],
  );
});

test('PS-2 keeps simultaneous same-pitch tie chains independent by voice identity', () => {
  const xml = score([
    measure('1', [
      note('C', { voice: '1', start: true }),
      '<backup><duration>16</duration></backup>',
      note('C', { voice: '2', start: true }),
    ].join(''), { attributes: true }),
    measure('2', [
      note('C', { voice: '1', stop: true }),
      '<backup><duration>16</duration></backup>',
      note('C', { voice: '2', stop: true }),
    ].join('')),
  ].join(''));
  const model = graph(xml);

  assert.equal(model.sustainChainCount, 2);
  assert.deepEqual(model.chains.map((chain) => chain.voice), ['1', '2']);
  assert.notEqual(model.chains[0].sustainChainId, model.chains[1].sustainChainId);
});

test('PS-2 fails closed on an orphan tie-stop', () => {
  const xml = score(measure('1', note('C', { stop: true }), { attributes: true }));

  assert.throws(
    () => graph(xml),
    (error) => {
      assert.equal(error.code, 'INVALID_SUSTAIN_TIE_GRAPH');
      assert.equal(error.details.reason, 'ORPHAN_TIE_STOP');
      return true;
    },
  );
});

test('PS-2 fails closed when a cross-measure continuation is not temporally contiguous', () => {
  const xml = score([
    measure('1', [
      note('C', { duration: 8, start: true }),
      note('C', { duration: 8, rest: true }),
    ].join(''), { attributes: true }),
    measure('2', note('C', { stop: true })),
  ].join(''));

  assert.throws(
    () => graph(xml),
    (error) => {
      assert.equal(error.code, 'INVALID_SUSTAIN_TIE_GRAPH');
      assert.equal(error.details.reason, 'NONCONTIGUOUS_TIE_CONTINUATION');
      return true;
    },
  );
});

test('PS-2 fails closed on an unterminated tie chain', () => {
  const xml = score(measure('1', note('C', { start: true }), { attributes: true }));

  assert.throws(
    () => graph(xml),
    (error) => {
      assert.equal(error.code, 'INVALID_SUSTAIN_TIE_GRAPH');
      assert.equal(error.details.reason, 'UNTERMINATED_TIE_CHAIN');
      return true;
    },
  );
});

test('PS-2 output is deeply immutable and contains no guitar-selection authority', () => {
  const model = graph(fixture('ui07-poly-unison-tie.musicxml'));
  const chain = model.chains[0];
  const segment = chain.segments[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.chains), true);
  assert.equal(Object.isFrozen(model.memberships), true);
  assert.equal(Object.isFrozen(chain), true);
  assert.equal(Object.isFrozen(chain.pitch), true);
  assert.equal(Object.isFrozen(chain.sourceEventIds), true);
  assert.equal(Object.isFrozen(chain.segments), true);
  assert.equal(Object.isFrozen(segment), true);

  for (const forbidden of ['string', 'fret', 'finger', 'barre', 'selected', 'cost']) {
    assert.equal(forbidden in chain, false);
    assert.equal(forbidden in segment, false);
  }
});

test('PS-2 revalidates PolyphonicSourceModel input fail-closed before linking ties', () => {
  const valid = sourceModel(fixture('ui07-poly-unison-tie.musicxml'));
  const hostile = structuredClone(valid);
  hostile.measures[0].events[0].voice = '';

  assert.throws(
    () => createSustainTieGraph(hostile),
    (error) => {
      assert.equal(error.code, 'INVALID_POLYPHONIC_SOURCE_MODEL');
      return true;
    },
  );
});

test('PS-2 remains deadline-bounded while linking tie segments', () => {
  const source = sourceModel(fixture('ui07-poly-unison-tie.musicxml'));
  let eventChecks = 0;
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => {
        if (phase !== 'sustain-tie-graph:event') return 0;
        eventChecks += 1;
        return eventChecks >= 2 ? 11 : 0;
      },
    },
  );

  assert.throws(
    () => createSustainTieGraph(source, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'sustain-tie-graph:event');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.eventIndex, 1);
      return true;
    },
  );
});

test('PS-2 observes cancellation between source events', () => {
  const source = sourceModel(fixture('ui07-poly-unison-tie.musicxml'));
  const controller = new AbortController();
  let injected = false;
  const runtime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'sustain-tie-graph:event' && !injected) {
          injected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );

  assert.throws(
    () => createSustainTieGraph(source, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'sustain-tie-graph:event');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.eventIndex, 1);
      return true;
    },
  );
});
