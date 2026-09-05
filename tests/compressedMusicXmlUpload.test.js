'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const { DEFAULT_MAX_XML_BYTES } = require('../src/validation/xmlSafety');

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`;

let crc32Table = null;
function crc32(bytes) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      crc32Table[index] = value >>> 0;
    }
  }
  let value = 0xffffffff;
  for (const byte of bytes) value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
}

function createZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content);
    const method = entry.method ?? 8;
    const compressed = method === 0 ? content : zlib.deflateRawSync(content);
    const flags = entry.flags ?? 0x0800;
    const checksum = entry.crc ?? crc32(content);
    const declaredSize = entry.uncompressedSize ?? content.byteLength;
    const local = Buffer.concat([
      uint32(0x04034b50), uint16(20), uint16(flags), uint16(method),
      uint16(0), uint16(0), uint32(checksum), uint32(compressed.byteLength),
      uint32(declaredSize), uint16(name.byteLength), uint16(0), name, compressed,
    ]);
    const central = Buffer.concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(flags), uint16(method),
      uint16(0), uint16(0), uint32(checksum), uint32(compressed.byteLength),
      uint32(declaredSize), uint16(name.byteLength), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(localOffset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    localOffset += local.byteLength;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length),
    uint16(entries.length), uint32(central.byteLength), uint32(localOffset), uint16(0),
  ]);
  return Buffer.concat([...locals, central, end]);
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function createMxl(scoreBytes, overrides = {}) {
  return createZip([
    {
      name: 'META-INF/container.xml',
      content: overrides.containerXml ?? CONTAINER_XML,
    },
    {
      name: overrides.scorePath ?? 'score.musicxml',
      content: scoreBytes,
      ...(overrides.scoreEntry || {}),
    },
  ]);
}

test('secure upload extracts a bounded MXL score without mutating source bytes', () => {
  const scoreBytes = fixture('parser-single-voice.musicxml');
  const archive = createMxl(scoreBytes);
  const before = Buffer.from(archive);

  const first = processMusicXmlUpload({ fileName: 'melody.mxl', bytes: archive });
  const second = processMusicXmlUpload({ fileName: 'melody.mxl', bytes: archive });
  const direct = processMusicXmlUpload({ fileName: 'melody.musicxml', bytes: scoreBytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(first.input.fileName, 'melody.mxl');
  assert.equal(first.input.byteLength, archive.byteLength);
  assert.deepEqual(first.canonicalTabResult, direct.canonicalTabResult);
  assert.equal(first.musicXml, direct.musicXml);
  assert.deepEqual(first, second);
  assert.deepEqual(archive, before);
});

test('MXL upload rejects traversal paths before extraction', () => {
  const archive = createMxl(fixture('parser-single-voice.musicxml'), {
    scorePath: '../score.musicxml',
  });
  const result = processMusicXmlUpload({ fileName: 'unsafe.mxl', bytes: archive });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, 'UNSAFE_MXL_ARCHIVE_PATH');
});

test('MXL upload rejects a missing standard container', () => {
  const archive = createZip([{
    name: 'score.musicxml',
    content: fixture('parser-single-voice.musicxml'),
  }]);
  const result = processMusicXmlUpload({ fileName: 'missing-container.mxl', bytes: archive });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_MXL_ARCHIVE');
  assert.equal(result.canonicalTabResult, null);
});

test('MXL upload rejects ambiguous MusicXML roots', () => {
  const ambiguous = CONTAINER_XML.replace(
    '</rootfiles>',
    '<rootfile full-path="other.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles>',
  );
  const archive = createZip([
    { name: 'META-INF/container.xml', content: ambiguous },
    { name: 'score.musicxml', content: fixture('parser-single-voice.musicxml') },
    { name: 'other.musicxml', content: fixture('parser-single-voice.musicxml') },
  ]);
  const result = processMusicXmlUpload({ fileName: 'ambiguous.mxl', bytes: archive });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_MXL_ARCHIVE');
});

test('MXL upload rejects unsupported compression and encryption', () => {
  for (const [name, scoreEntry, expectedCode] of [
    ['unsupported-compression.mxl', { method: 12 }, 'UNSUPPORTED_MXL_COMPRESSION'],
    ['encrypted.mxl', { flags: 0x0801 }, 'UNSUPPORTED_MXL_ENCRYPTION'],
  ]) {
    const archive = createMxl(fixture('parser-single-voice.musicxml'), { scoreEntry });
    const result = processMusicXmlUpload({ fileName: name, bytes: archive });
    assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
    assert.equal(result.preflight.issues[0].code, expectedCode);
  }
});

test('MXL upload enforces the extracted XML size limit before inflating', () => {
  const archive = createMxl(fixture('parser-single-voice.musicxml'), {
    scoreEntry: { uncompressedSize: DEFAULT_MAX_XML_BYTES + 1 },
  });
  const result = processMusicXmlUpload({ fileName: 'oversized.mxl', bytes: archive });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, 'MXL_EXTRACTED_SIZE_LIMIT_EXCEEDED');
});

test('MXL upload verifies entry CRC before parsing MusicXML', () => {
  const archive = createMxl(fixture('parser-single-voice.musicxml'), {
    scoreEntry: { crc: 0 },
  });
  const result = processMusicXmlUpload({ fileName: 'bad-crc.mxl', bytes: archive });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_MXL_ARCHIVE');
});
