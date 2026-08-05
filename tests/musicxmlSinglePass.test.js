'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryRoot = path.resolve(__dirname, '..');

const validScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function runCounted(entryExpression) {
  const script = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    let saxPasses = 0;
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.apply(this, arguments);
      if (request === 'saxes') {
        const OriginalSaxesParser = loaded.SaxesParser;
        return {
          ...loaded,
          SaxesParser: class CountedSaxesParser extends OriginalSaxesParser {
            constructor(...args) {
              saxPasses += 1;
              super(...args);
            }
          },
        };
      }
      return loaded;
    };
    const xml = ${JSON.stringify(validScore)};
    ${entryExpression}
    process.stdout.write(String(saxPasses));
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return Number.parseInt(result.stdout, 10);
}

function namespacedAttributeScore(namespacedFirst) {
  const pair = (name, value, shadow) => namespacedFirst
    ? `x:${name}="${shadow}" ${name}="${value}"`
    : `${name}="${value}" x:${name}="${shadow}"`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise xmlns:x="urn:test" version="4.0">
  <part-list>
    <score-part ${pair('id', 'P1', 'shadow-score')}><part-name>Guitar</part-name></score-part>
  </part-list>
  <part ${pair('id', 'P1', 'shadow-part')}>
    <measure ${pair('number', '1', 'shadow-measure')} ${pair('implicit', 'no', 'yes')}>
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <tie ${pair('type', 'start', 'stop')}/>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <beam ${pair('number', '1', '99')}>begin</beam>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

test('validateMusicXml performs one complete SAX construction', () => {
  assert.equal(
    runCounted(`
      const { validateMusicXml } = require('./src/validation/musicxmlValidation');
      validateMusicXml(xml);
    `),
    1,
  );
});

test('parseMusicXmlNotes performs one complete SAX construction', () => {
  assert.equal(
    runCounted(`
      const { parseMusicXmlNotes } = require('./src/parser/musicxmlNoteParser');
      parseMusicXmlNotes(xml);
    `),
    1,
  );
});

test('structural validation does not reject semantically unsupported chord content', () => {
  const chordScore = validScore.replace('<pitch>', '<chord/><pitch>');
  const {
    validateMusicXml,
  } = require('../src/validation/musicxmlValidation');
  const {
    parseMusicXmlNotes,
  } = require('../src/parser/musicxmlNoteParser');

  assert.equal(validateMusicXml(chordScore).measureCount, 1);
  assert.throws(
    () => parseMusicXmlNotes(chordScore),
    (error) => error.code === 'UNSUPPORTED_POLYPHONY',
  );
});

test('unqualified MusicXML attributes cannot be shadowed by namespaced attributes', () => {
  const {
    validateMusicXml,
  } = require('../src/validation/musicxmlValidation');
  const {
    parseMusicXmlNotes,
  } = require('../src/parser/musicxmlNoteParser');

  for (const namespacedFirst of [false, true]) {
    const xml = namespacedAttributeScore(namespacedFirst);
    assert.deepEqual(validateMusicXml(xml), {
      format: 'score-partwise',
      version: '4.0',
      partId: 'P1',
      measureCount: 1,
    });

    const parsed = parseMusicXmlNotes(xml);
    const event = parsed.measures[0].events[0];
    assert.equal(parsed.partId, 'P1');
    assert.equal(parsed.measures[0].number, '1');
    assert.equal(parsed.measures[0].implicit, false);
    assert.equal(event.rhythm.tieStart, true);
    assert.equal(event.rhythm.tieStop, false);
    assert.deepEqual(event.rhythm.beam, [{ level: 1, value: 'begin' }]);
  }
});

test('deep MusicXML trees do not escape the structured parser error contract', () => {
  const {
    parseMusicXmlNotes,
  } = require('../src/parser/musicxmlNoteParser');
  const depth = 6000;
  const nestedChord = `${'<x>'.repeat(depth)}<chord/>${'</x>'.repeat(depth)}`;
  const xml = validScore.replace('<pitch>', `${nestedChord}<pitch>`);

  assert.throws(
    () => parseMusicXmlNotes(xml),
    (error) => {
      assert.notEqual(error.name, 'RangeError');
      assert.equal(error.code, 'UNSUPPORTED_POLYPHONY');
      return true;
    },
  );
});
