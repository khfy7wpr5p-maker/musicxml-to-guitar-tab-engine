'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const publicApi = require('../src');
const {
  processMusicXmlDocumentTransposition,
} = require('../src/app/musicXmlDocumentTranspositionRuntime');

function score(body, { key = '<key><fifths>0</fifths></key>', transpose = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions>${key}<time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves>${transpose}</attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { alter = null, octave = 4, duration = 4, voice = '1', chord = false, tie = '' } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>${duration}</duration>${tie}<voice>${voice}</voice><type>${duration === 16 ? 'whole' : 'quarter'}</type><staff>1</staff></note>`;
}

function rest(duration = 4, voice = '1') {
  return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice><type>quarter</type><staff>1</staff></note>`;
}

function request(xml, operation) {
  const bytes = Buffer.from(xml);
  return {
    fileName: 'source.musicxml',
    bytes,
    expectedInputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    operation,
  };
}

test('document semitone transposition rewrites source pitch/key and regenerates physical MONO TAB', () => {
  const xml = score([
    note('E'), rest(), note('G'), rest(),
  ].join(''));
  const result = processMusicXmlDocumentTransposition(request(xml, {
    semitones: 1,
    spelling: 'flats',
  }));

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'MONO_V1');
  assert.deepEqual(result.transposition, {
    semitones: 1,
    spelling: 'flats',
    targetKey: null,
    sourceSha256: request(xml, { semitones: 1, spelling: 'flats' }).expectedInputSha256,
  });
  assert.match(result.sourceMusicXml, /<key><fifths>-5<\/fifths><\/key>/);
  assert.match(result.sourceMusicXml, /<step>F<\/step><octave>4<\/octave>/);
  assert.match(result.sourceMusicXml, /<step>A<\/step><alter>-1<\/alter><octave>4<\/octave>/);
  assert.deepEqual(
    result.canonicalTabResult.measures[0].events.filter((event) => event.type === 'note').map((event) => event.pitch.written),
    ['F3', 'Ab3'],
  );
  assert.equal(result.canonicalTabResult.restCount, 2);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
});

test('explicit target key derives one interval, updates signature and preserves POLY topology', () => {
  const firstVoice = [
    note('C'), note('E'), note('G'), note('C', { octave: 5 }),
  ].join('');
  const secondVoice = [
    '<backup><duration>16</duration></backup>',
    note('C', { octave: 3, voice: '2' }),
    note('G', { octave: 3, voice: '2' }),
    note('C', { octave: 4, voice: '2' }),
    note('G', { octave: 3, voice: '2' }),
  ].join('');
  const result = processMusicXmlDocumentTransposition(request(score(`${firstVoice}${secondVoice}`), {
    targetKey: 'D major',
  }));

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.transposition.semitones, 2);
  assert.equal(result.transposition.targetKey, 'D');
  assert.match(result.sourceMusicXml, /<key><fifths>2<\/fifths><\/key>/);
  assert.equal(result.canonicalTabResult.measures[0].events.length, 8);
  assert.deepEqual(
    result.canonicalTabResult.measures[0].events.map((event) => event.voice),
    ['1', '1', '1', '1', '2', '2', '2', '2'],
  );
  assert.deepEqual(
    result.canonicalTabResult.measures[0].events.slice(0, 3).map((event) => event.pitch.written),
    ['D4', 'F#4', 'A4'],
  );
});

test('sharp/flat target keys respell notes, visible accidentals and supported harmony together', () => {
  const source = score(
    '<harmony><root><root-step>C</root-step></root><kind text="C/E">major</kind><bass><bass-step>E</bass-step></bass></harmony>'
    + note('C', { duration: 16 })
      .replace('</note>', '<accidental>natural</accidental></note>'),
  );
  const flat = processMusicXmlDocumentTransposition(request(source, { targetKey: 'Db major' }));
  assert.equal(flat.status, 'PASS');
  assert.equal(flat.transposition.semitones, 1);
  assert.match(flat.sourceMusicXml, /<key><fifths>-5<\/fifths><\/key>/);
  assert.match(flat.sourceMusicXml, /<pitch><step>D<\/step><alter>-1<\/alter><octave>4<\/octave><\/pitch>/);
  assert.match(flat.sourceMusicXml, /<accidental>flat<\/accidental>/);
  assert.match(flat.sourceMusicXml, /<root><root-step>D<\/root-step><root-alter>-1<\/root-alter><\/root>/);
  assert.match(flat.sourceMusicXml, /<bass><bass-step>F<\/bass-step><\/bass>/);
  assert.doesNotMatch(flat.sourceMusicXml, /<kind[^>]*text=/);
  assert.match(flat.musicXml, /<root-step>D<\/root-step><root-alter>-1<\/root-alter>/);

  const sharp = processMusicXmlDocumentTransposition(request(
    score(note('C', { duration: 16 })),
    { targetKey: 'C# major' },
  ));
  assert.equal(sharp.status, 'PASS');
  assert.equal(sharp.transposition.semitones, 1);
  assert.match(sharp.sourceMusicXml, /<key><fifths>7<\/fifths><\/key>/);
  assert.match(sharp.sourceMusicXml, /<pitch><step>C<\/step><alter>1<\/alter><octave>4<\/octave><\/pitch>/);
});

test('standard guitar transpose remains a single sounding-octave mapping after document transposition', () => {
  const transpose = '<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>';
  const xml = score(note('E', { duration: 16 }), { transpose });
  const result = processMusicXmlDocumentTransposition(request(xml, {
    semitones: 2,
    spelling: 'sharps',
  }));

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'MONO_V1');
  assert.match(result.sourceMusicXml, /<step>F<\/step><alter>1<\/alter><octave>4<\/octave>/);
  const event = result.canonicalTabResult.measures[0].events.find((entry) => entry.type === 'note');
  assert.equal(event.pitch.written, 'F#3');
  assert.equal(event.pitch.midi, 54);
  assert.match(result.musicXml, /<octave-change>-1<\/octave-change>/);
});

test('document transposition preserves tie markup and fails closed when the result is outside guitar range', () => {
  const tied = score(note('E', {
    duration: 16,
    tie: '<tie type="start"/><notations><tied type="start"/></notations>',
  }));
  const tiedResult = processMusicXmlDocumentTransposition(request(tied, {
    semitones: -1,
    spelling: 'flats',
  }));
  assert.equal(tiedResult.status, 'PASS');
  assert.match(tiedResult.sourceMusicXml, /<tie type="start"\/>/);
  assert.match(tiedResult.sourceMusicXml, /<tied type="start"\/>/);

  const low = score(note('E', { octave: 2, duration: 16 }));
  const blocked = processMusicXmlDocumentTransposition(request(low, {
    semitones: -1,
    spelling: 'flats',
  }));
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.canonicalTabResult, null);
  assert.equal(blocked.musicXml, null);
  assert.equal(blocked.sourceMusicXml, null);
});

test('transposition request is exact, stale-safe and remains outside package-root API', () => {
  const xml = score(note('C', { duration: 16 }));
  const stale = request(xml, { semitones: 1, spelling: 'sharps' });
  stale.expectedInputSha256 = '0'.repeat(64);
  const blocked = processMusicXmlDocumentTransposition(stale);
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.preflight.issues[0].code, 'STALE_DOCUMENT_TRANSPOSITION_SOURCE');

  for (const operation of [
    { semitones: 0, spelling: 'sharps' },
    { semitones: 1 },
    { semitones: 1, targetKey: 'D', spelling: 'sharps' },
    { targetKey: 'H major' },
    { targetKey: 'Db major', spelling: 'sharps' },
  ]) {
    assert.equal(processMusicXmlDocumentTransposition(request(xml, operation)).status, 'BLOCKED');
  }
  let getterCalled = false;
  const hostile = {
    get semitones() {
      getterCalled = true;
      return 1;
    },
    spelling: 'sharps',
  };
  assert.equal(processMusicXmlDocumentTransposition(request(xml, hostile)).status, 'BLOCKED');
  assert.equal(getterCalled, false);
  assert.equal(publicApi.processMusicXmlDocumentTransposition, undefined);
});
