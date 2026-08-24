'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  MusicXmlUploadRuntimeError,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  convertMusicXmlToCanonicalTab,
} = require('../src/core/conversionPipeline');
const {
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const {
  serializeCanonicalTabResultToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriter');
const {
  DEFAULT_MAX_XML_BYTES,
} = require('../src/validation/xmlSafety');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

test('secure upload runtime preserves the exact monophonic v1 result and emits renderer MusicXML', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const direct = convertMusicXmlToCanonicalTab(bytes);
  assert.ok(direct.canonicalTabResult);

  const result = processMusicXmlUpload({
    fileName: 'melody.musicxml',
    bytes,
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(result.input.fileName, 'melody.musicxml');
  assert.equal(result.input.byteLength, bytes.byteLength);
  assert.equal(result.input.sha256, sha256(bytes));
  assert.deepEqual(result.canonicalTabResult, direct.canonicalTabResult);
  assert.equal(result.musicXml, serializeCanonicalTabResultToMusicXml(direct.canonicalTabResult));
  assert.equal(result.normalization.tabStaffMirrorCollapsed, false);
  assert.equal(Object.isFrozen(result), true);
});

test('upload identity and conversion use an owned snapshot when caller bytes mutate', () => {
  const original = fixture('parser-single-voice.musicxml');
  const mutable = new Uint8Array(original);
  let mutated = false;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (!mutated && phase === 'app-upload:start') {
        mutable.fill(0);
        mutated = true;
      }
      return 0;
    },
  });

  const result = processMusicXmlUpload({
    fileName: 'mutable.musicxml',
    bytes: mutable,
  }, {}, runtime);

  assert.equal(mutated, true);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(result.input.byteLength, original.byteLength);
  assert.equal(result.input.sha256, sha256(original));
  assert.deepEqual(
    result.canonicalTabResult,
    convertMusicXmlToCanonicalTab(original).canonicalTabResult,
  );
});

test('upload snapshot does not invoke Uint8Array subclass coercion hooks', () => {
  const original = fixture('parser-single-voice.musicxml');
  let invoked = false;
  class HostileUint8Array extends Uint8Array {
    valueOf() {
      invoked = true;
      throw new Error('caller hook must not run');
    }

    get length() {
      invoked = true;
      throw new Error('caller hook must not run');
    }
  }
  const hostile = new HostileUint8Array(original);

  const result = processMusicXmlUpload({
    fileName: 'hostile-subclass.musicxml',
    bytes: hostile,
  });

  assert.equal(invoked, false);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.input.sha256, sha256(original));
});

test('oversized upload is rejected before snapshot allocation or hashing', () => {
  let invoked = false;
  class OversizedUint8Array extends Uint8Array {
    valueOf() {
      invoked = true;
      throw new Error('caller hook must not run');
    }
  }
  const oversized = new OversizedUint8Array(DEFAULT_MAX_XML_BYTES + 1);

  const result = processMusicXmlUpload({
    fileName: 'oversized.musicxml',
    bytes: oversized,
  });

  assert.equal(invoked, false);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'FILE_TOO_LARGE');
  assert.equal(result.input.byteLength, DEFAULT_MAX_XML_BYTES + 1);
  assert.equal(result.input.sha256, null);
});

test('shared-memory upload storage is rejected before hashing or conversion', () => {
  if (typeof SharedArrayBuffer !== 'function') return;
  const shared = new Uint8Array(new SharedArrayBuffer(8));

  assert.throws(
    () => processMusicXmlUpload({ fileName: 'shared.musicxml', bytes: shared }),
    (error) => {
      assert.ok(error instanceof MusicXmlUploadRuntimeError);
      assert.equal(error.code, 'INVALID_UPLOAD_REQUEST');
      assert.match(error.message, /shared memory/);
      return true;
    },
  );
});

test('detached upload storage is rejected as an invalid request', () => {
  const detached = new Uint8Array(fixture('parser-single-voice.musicxml'));
  structuredClone(detached.buffer, { transfer: [detached.buffer] });

  assert.throws(
    () => processMusicXmlUpload({ fileName: 'detached.musicxml', bytes: detached }),
    (error) => {
      assert.ok(error instanceof MusicXmlUploadRuntimeError);
      assert.equal(error.code, 'INVALID_UPLOAD_REQUEST');
      assert.match(error.message, /attached/);
      return true;
    },
  );
});

test('automatic dispatcher sends multi-voice MusicXML through PA-12 v2 without silent note loss or transposition', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const result = processMusicXmlUpload({
    fileName: 'poly.xml',
    bytes: new Uint8Array(bytes),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult.schemaVersion, '2.0.0');
  assert.equal(result.canonicalTabResult.noteDispositions.length, 8);
  assert.equal(
    result.canonicalTabResult.noteDispositions.every((entry) => (
      entry.disposition === 'KEEP' && entry.octaveShiftSemitones === 0
    )),
    true,
  );
  assert.equal(result.normalization.omittedRepresentationNoteCount, 0);
  assert.match(result.musicXml, /<score-partwise\b/);
});

test('upload boundary rejects non-MusicXML file extensions before conversion', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlUpload({ fileName: 'score.txt', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.UNRESOLVED);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_UPLOAD_EXTENSION');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('upload boundary fails closed on unsafe XML while retaining exact file identity', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise [<!ENTITY x "boom">]>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>X</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>`);
  const result = processMusicXmlUpload({ fileName: 'unsafe.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, 'UNSAFE_XML_DECLARATION');
  assert.equal(result.input.sha256, sha256(bytes));
});

test('polyphonic route refuses automatic octave displacement and reports the source measure/event', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Range</part-name></score-part></part-list>
<part id="P1"><measure number="7">
<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>C</step><octave>7</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<forward><duration>4</duration></forward>
</measure></part></score-partwise>`);

  const result = processMusicXmlUpload({ fileName: 'range.musicxml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNPLAYABLE_SOURCE_PITCH');
  assert.equal(result.preflight.issues[0].location.measure, '7');
  assert.equal(result.preflight.issues[0].location.measureIndex, 0);
  assert.equal(result.preflight.issues[0].details.writtenPitch, 'C7');
});

test('upload request shape is fail-closed and the application runtime remains outside package-root authority', () => {
  assert.equal(Object.hasOwn(publicApi, 'processMusicXmlUpload'), false);

  assert.throws(
    () => processMusicXmlUpload({ fileName: '../score.musicxml', bytes: Buffer.from('<x/>') }),
    (error) => {
      assert.ok(error instanceof MusicXmlUploadRuntimeError);
      assert.equal(error.code, 'INVALID_UPLOAD_REQUEST');
      return true;
    },
  );

  let invoked = false;
  const hostile = {};
  Object.defineProperty(hostile, 'fileName', {
    enumerable: true,
    get() {
      invoked = true;
      return 'score.musicxml';
    },
  });
  Object.defineProperty(hostile, 'bytes', {
    enumerable: true,
    value: Buffer.from('<x/>'),
  });
  assert.throws(() => processMusicXmlUpload(hostile), /data properties/);
  assert.equal(invoked, false);
});
