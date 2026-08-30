'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCandidateLayers } = require('../src/fingering/candidateLayerBuilder');
const { assignCanonicalFingering } = require('../src/fingering/assignCanonicalFingering');
const { STANDARD_TUNING } = require('../src/guitar/tuning');
const { parseCanonicalMusicDocument } = require('../src/parser/parseCanonicalMusicDocument');

function singleNoteXml(step, alter, octave) {
  const alterXml = alter === null ? '' : `<alter>${alter}</alter>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note>
        <pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

function dropD() {
  return STANDARD_TUNING.map((entry) => (
    entry.number === 6
      ? { number: 6, pitch: 'D2', midi: 38 }
      : { ...entry }
  ));
}

test('MONO candidate builder threads capoFret into capo-aware fretboard primitives', () => {
  const canonical = parseCanonicalMusicDocument(singleNoteXml('F', 1, 2));
  const before = structuredClone(canonical);

  const baseline = buildCandidateLayers(canonical);
  const capo = buildCandidateLayers(canonical, { capoFret: 2 });

  assert.deepEqual(baseline.candidateLayers, [[{ string: 6, fret: 2 }]]);
  assert.deepEqual(capo.candidateLayers, [[{ string: 6, fret: 0 }]]);
  assert.deepEqual(canonical, before);
  assert.equal(canonical.measures[0].events[0].pitch.midi, 42);
});

test('MONO fingering pipeline preserves ranking code while consuming capo-relative candidates', () => {
  const canonical = parseCanonicalMusicDocument(singleNoteXml('F', 1, 2));

  const baseline = assignCanonicalFingering(canonical);
  const capo = assignCanonicalFingering(canonical, { guitar: { capoFret: 2 } });

  assert.deepEqual(baseline.assignments[0].selectedPosition, { string: 6, fret: 2 });
  assert.deepEqual(capo.assignments[0].selectedPosition, { string: 6, fret: 0 });
  assert.equal(baseline.assignments[0].midi, 42);
  assert.equal(capo.assignments[0].midi, 42);
});

test('MONO supports custom tuning plus capo without octave fallback or source pitch mutation', () => {
  const canonical = parseCanonicalMusicDocument(singleNoteXml('E', null, 2));
  const before = structuredClone(canonical);

  assert.throws(
    () => buildCandidateLayers(canonical, { capoFret: 2 }),
    (error) => error.code === 'UNPLAYABLE_NOTE',
  );

  const result = buildCandidateLayers(canonical, {
    tuning: dropD(),
    capoFret: 2,
  });

  assert.deepEqual(result.candidateLayers, [[{ string: 6, fret: 0 }]]);
  assert.deepEqual(canonical, before);
  assert.equal(canonical.measures[0].events[0].pitch.midi, 40);
});
