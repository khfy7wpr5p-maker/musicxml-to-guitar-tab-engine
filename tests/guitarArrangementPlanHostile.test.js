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
  createGuitarArrangementPlan,
} = require('../src/music/guitarArrangementPlan');

function sourceModel() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-4 hostile</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part>
</score-partwise>`;
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
}

test('PA-4 hostile decision-array proxies fail closed without invoking property getters', () => {
  let getCalls = 0;
  const decisions = new Proxy([
    {
      decisionType: 'PRESERVED',
      sourceEventIds: ['P1:measure:0:note:0'],
      sourceGroupId: null,
    },
  ], {
    get(target, property, receiver) {
      getCalls += 1;
      if (property === 'length') {
        throw new Error('hostile length getter must not run');
      }
      return Reflect.get(target, property, receiver);
    },
  });

  assert.throws(
    () => createGuitarArrangementPlan(sourceModel(), decisions),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
  assert.equal(getCalls, 0);
});
