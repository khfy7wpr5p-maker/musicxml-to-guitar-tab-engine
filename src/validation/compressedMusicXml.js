'use strict';

const zlib = require('node:zlib');
const { SaxesParser } = require('saxes');
const { EngineError } = require('../errors/engineError');
const {
  DEFAULT_MAX_XML_BYTES,
  XmlSafetyError,
} = require('./xmlSafety');

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_END_RECORD_SEARCH_BYTES = 65_557;
const MAX_ARCHIVE_ENTRIES = 128;
const MAX_CONTAINER_XML_BYTES = 64 * 1024;
const MUSICXML_MEDIA_TYPE = 'application/vnd.recordare.musicxml+xml';
const CONTAINER_PATH = 'META-INF/container.xml';

class CompressedMusicXmlError extends EngineError {
  constructor(message, code = 'INVALID_MXL_ARCHIVE', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'CompressedMusicXmlError');
  }
}

function invalidArchive(message, details = {}) {
  return new CompressedMusicXmlError(message, 'INVALID_MXL_ARCHIVE', details);
}

function ensureRange(bytes, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
    || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw invalidArchive('Compressed MusicXML archive is truncated.', { label });
  }
}

function uint16(bytes, offset, label) {
  ensureRange(bytes, offset, 2, label);
  return bytes.readUInt16LE(offset);
}

function uint32(bytes, offset, label) {
  ensureRange(bytes, offset, 4, label);
  return bytes.readUInt32LE(offset);
}

function findEndOfCentralDirectory(bytes) {
  const minimumOffset = Math.max(0, bytes.byteLength - MAX_END_RECORD_SEARCH_BYTES);
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = uint16(bytes, offset + 20, 'end-record-comment');
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  throw invalidArchive('Compressed MusicXML end record was not found.');
}

function decodeEntryPath(rawName) {
  let name;
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(rawName);
  } catch {
    throw invalidArchive('Compressed MusicXML contains an invalid UTF-8 entry name.');
  }
  const comparablePath = name.endsWith('/') ? name.slice(0, -1) : name;
  if (
    name.length === 0
    || comparablePath.length === 0
    || name.includes('\\')
    || name.includes('\u0000')
    || name.startsWith('/')
    || /^[A-Za-z]:/.test(name)
    || comparablePath.split('/').some((segment) => (
      segment === '' || segment === '.' || segment === '..'
    ))
  ) {
    throw new XmlSafetyError(
      'Compressed MusicXML contains an unsafe archive path.',
      'UNSAFE_MXL_ARCHIVE_PATH',
      Object.freeze({ entryPath: name }),
    );
  }
  return name;
}

function readCentralDirectory(bytes) {
  const endOffset = findEndOfCentralDirectory(bytes);
  const diskNumber = uint16(bytes, endOffset + 4, 'end-record-disk');
  const centralDisk = uint16(bytes, endOffset + 6, 'end-record-central-disk');
  const entriesOnDisk = uint16(bytes, endOffset + 8, 'end-record-disk-entry-count');
  const entryCount = uint16(bytes, endOffset + 10, 'end-record-entry-count');
  const centralSize = uint32(bytes, endOffset + 12, 'end-record-central-size');
  const centralOffset = uint32(bytes, endOffset + 16, 'end-record-central-offset');

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new CompressedMusicXmlError(
      'Multi-disk compressed MusicXML archives are not supported.',
      'UNSUPPORTED_MXL_ARCHIVE_LAYOUT',
    );
  }
  if (entryCount === 0 || entryCount === 0xffff
    || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new CompressedMusicXmlError(
      'ZIP64 or empty compressed MusicXML archives are not supported.',
      'UNSUPPORTED_MXL_ARCHIVE_LAYOUT',
    );
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new XmlSafetyError(
      'Compressed MusicXML archive contains too many entries.',
      'MXL_ENTRY_LIMIT_EXCEEDED',
      Object.freeze({ maximumEntries: MAX_ARCHIVE_ENTRIES, entryCount }),
    );
  }
  ensureRange(bytes, centralOffset, centralSize, 'central-directory');
  if (centralOffset + centralSize > endOffset) {
    throw invalidArchive('Compressed MusicXML central directory overlaps its end record.');
  }

  const entries = new Map();
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;
  for (let index = 0; index < entryCount; index += 1) {
    ensureRange(bytes, cursor, 46, 'central-entry');
    if (bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw invalidArchive('Compressed MusicXML central directory is invalid.', { entryIndex: index });
    }
    const flags = uint16(bytes, cursor + 8, 'central-entry-flags');
    const method = uint16(bytes, cursor + 10, 'central-entry-method');
    const crc = uint32(bytes, cursor + 16, 'central-entry-crc');
    const compressedSize = uint32(bytes, cursor + 20, 'central-entry-compressed-size');
    const uncompressedSize = uint32(bytes, cursor + 24, 'central-entry-uncompressed-size');
    const nameLength = uint16(bytes, cursor + 28, 'central-entry-name-length');
    const extraLength = uint16(bytes, cursor + 30, 'central-entry-extra-length');
    const commentLength = uint16(bytes, cursor + 32, 'central-entry-comment-length');
    const startDisk = uint16(bytes, cursor + 34, 'central-entry-start-disk');
    const localOffset = uint32(bytes, cursor + 42, 'central-entry-local-offset');
    const recordLength = 46 + nameLength + extraLength + commentLength;
    ensureRange(bytes, cursor, recordLength, 'central-entry-record');
    if (cursor + recordLength > centralEnd) {
      throw invalidArchive('Compressed MusicXML central entry exceeds its directory.');
    }
    if (startDisk !== 0 || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new CompressedMusicXmlError(
        'ZIP64 compressed MusicXML entries are not supported.',
        'UNSUPPORTED_MXL_ARCHIVE_LAYOUT',
      );
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw new CompressedMusicXmlError(
        'Encrypted compressed MusicXML entries are not supported.',
        'UNSUPPORTED_MXL_ENCRYPTION',
      );
    }
    if (method !== 0 && method !== 8) {
      throw new CompressedMusicXmlError(
        'Compressed MusicXML entry uses an unsupported compression method.',
        'UNSUPPORTED_MXL_COMPRESSION',
        Object.freeze({ method }),
      );
    }
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    if ((flags & 0x0800) === 0 && rawName.some((byte) => byte > 0x7f)) {
      throw invalidArchive('Non-ASCII archive names must declare UTF-8 encoding.');
    }
    const name = decodeEntryPath(rawName);
    if (entries.has(name)) {
      throw invalidArchive('Compressed MusicXML contains duplicate entry paths.', { entryPath: name });
    }
    entries.set(name, Object.freeze({
      name,
      flags,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
    }));
    cursor += recordLength;
  }
  if (cursor !== centralEnd) {
    throw invalidArchive('Compressed MusicXML central directory size is inconsistent.');
  }
  return entries;
}

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

function extractEntry(bytes, entry, maximumBytes) {
  if (entry.uncompressedSize > maximumBytes) {
    throw new XmlSafetyError(
      'Compressed MusicXML entry exceeds the fixed extracted-size limit.',
      'MXL_EXTRACTED_SIZE_LIMIT_EXCEEDED',
      Object.freeze({ entryPath: entry.name, maximumBytes, byteLength: entry.uncompressedSize }),
    );
  }
  ensureRange(bytes, entry.localOffset, 30, 'local-entry');
  if (bytes.readUInt32LE(entry.localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw invalidArchive('Compressed MusicXML local entry header is invalid.', {
      entryPath: entry.name,
    });
  }
  const localFlags = uint16(bytes, entry.localOffset + 6, 'local-entry-flags');
  const localMethod = uint16(bytes, entry.localOffset + 8, 'local-entry-method');
  const nameLength = uint16(bytes, entry.localOffset + 26, 'local-entry-name-length');
  const extraLength = uint16(bytes, entry.localOffset + 28, 'local-entry-extra-length');
  if (localFlags !== entry.flags || localMethod !== entry.method) {
    throw invalidArchive('Compressed MusicXML local and central entry metadata disagree.', {
      entryPath: entry.name,
    });
  }
  ensureRange(bytes, entry.localOffset + 30, nameLength, 'local-entry-name');
  const localName = decodeEntryPath(
    bytes.subarray(entry.localOffset + 30, entry.localOffset + 30 + nameLength),
  );
  if (localName !== entry.name) {
    throw invalidArchive('Compressed MusicXML local and central entry names disagree.');
  }
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  ensureRange(bytes, dataOffset, entry.compressedSize, 'local-entry-data');
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
  let output;
  try {
    output = entry.method === 0
      ? Buffer.from(compressed)
      : zlib.inflateRawSync(compressed, { maxOutputLength: maximumBytes + 1 });
  } catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE' || error?.code === 'ERR_OUT_OF_RANGE') {
      throw new XmlSafetyError(
        'Compressed MusicXML entry exceeds the fixed extracted-size limit.',
        'MXL_EXTRACTED_SIZE_LIMIT_EXCEEDED',
        Object.freeze({ entryPath: entry.name, maximumBytes }),
      );
    }
    throw invalidArchive('Compressed MusicXML entry cannot be decompressed.', {
      entryPath: entry.name,
    });
  }
  if (output.byteLength !== entry.uncompressedSize || output.byteLength > maximumBytes) {
    throw invalidArchive('Compressed MusicXML extracted size does not match its directory.', {
      entryPath: entry.name,
    });
  }
  if (crc32(output) !== entry.crc) {
    throw invalidArchive('Compressed MusicXML entry failed CRC verification.', {
      entryPath: entry.name,
    });
  }
  return output;
}

function parseContainerRootPath(containerBytes) {
  let xml;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(containerBytes);
  } catch {
    throw invalidArchive('Compressed MusicXML container metadata is not valid UTF-8.');
  }
  const rootPaths = [];
  let rootSeen = false;
  const parser = new SaxesParser({ xmlns: true, position: true });
  parser.on('error', (error) => { throw error; });
  parser.on('doctype', () => {
    throw new XmlSafetyError(
      'DOCTYPE declarations are not allowed in compressed MusicXML metadata.',
      'UNSAFE_XML_DECLARATION',
    );
  });
  parser.on('opentag', (tag) => {
    const local = tag.local || tag.name;
    if (!rootSeen) {
      rootSeen = true;
      if (local !== 'container') {
        throw invalidArchive('Compressed MusicXML metadata root must be container.');
      }
    }
    if (local !== 'rootfile') return;
    const attributes = Object.values(tag.attributes || {});
    if (attributes.some((attribute) => (
      (attribute.uri || '')
      || !['full-path', 'media-type'].includes(attribute.local || attribute.name)
    ))) {
      throw invalidArchive('Compressed MusicXML root-file metadata contains unsupported attributes.');
    }
    const fullPath = attributes.find((attribute) => (
      (attribute.local || attribute.name) === 'full-path' && !(attribute.uri || '')
    ));
    const mediaType = attributes.find((attribute) => (
      (attribute.local || attribute.name) === 'media-type' && !(attribute.uri || '')
    ));
    // Older MusicXML producers omit media-type and the container namespace.
    // A single explicit full-path is still deterministic. If media-type is
    // present, however, it must identify MusicXML exactly.
    if (fullPath && (!mediaType || mediaType.value === MUSICXML_MEDIA_TYPE)) {
      rootPaths.push(fullPath.value);
    }
  });
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof EngineError) throw error;
    throw invalidArchive('Compressed MusicXML container metadata is malformed.');
  }
  if (rootPaths.length !== 1) {
    throw invalidArchive(
      'Compressed MusicXML metadata must identify exactly one MusicXML root file.',
      { rootFileCount: rootPaths.length },
    );
  }
  return decodeEntryPath(Buffer.from(rootPaths[0], 'utf8'));
}

function extractCompressedMusicXml(input, options = {}) {
  const maximumXmlBytes = options.maximumXmlBytes ?? DEFAULT_MAX_XML_BYTES;
  if (!Number.isInteger(maximumXmlBytes) || maximumXmlBytes <= 0) {
    throw new XmlSafetyError(
      'Maximum extracted MusicXML size must be a positive integer.',
      'INVALID_CONFIGURATION',
      Object.freeze({ maximumXmlBytes }),
    );
  }
  const bytes = Buffer.from(input);
  const entries = readCentralDirectory(bytes);
  const containerEntry = entries.get(CONTAINER_PATH);
  if (!containerEntry || containerEntry.name.endsWith('/')) {
    throw invalidArchive('Compressed MusicXML metadata file is missing.');
  }
  const containerBytes = extractEntry(bytes, containerEntry, MAX_CONTAINER_XML_BYTES);
  const rootPath = parseContainerRootPath(containerBytes);
  const rootEntry = entries.get(rootPath);
  if (!rootEntry || rootEntry.name.endsWith('/')) {
    throw invalidArchive('Compressed MusicXML root file is missing.', { rootPath });
  }
  return extractEntry(bytes, rootEntry, maximumXmlBytes);
}

module.exports = {
  CompressedMusicXmlError,
  extractCompressedMusicXml,
};
