'use strict';

const {
  processMusicXmlUpload,
} = require('../app/musicXmlUploadRuntime');
const {
  parseParsedMusicXmlDocument,
} = require('../parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  admitSemanticReferenceBundle,
} = require('./semanticReferenceBundle');
const {
  projectGuitarSourceSemantics,
} = require('./guitarSourceSemanticProjection');
const {
  compareGuitarSourceWithSemanticReference,
} = require('./guitarSemanticComparator');
const {
  createSemanticTabValidationPacket,
} = require('./semanticTabValidationPacket');

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function comparison(status, diagnostics = [], unverifiedContexts = []) {
  return Object.freeze({
    status,
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze({ ...item }))),
    unverifiedContexts: Object.freeze([...unverifiedContexts]),
  });
}

function packetFromComparison(result, provenance) {
  return createSemanticTabValidationPacket({
    comparison: result,
    provenance,
  });
}

function unsupportedPacket(code, provenance, details = {}) {
  return packetFromComparison(
    comparison('UNSUPPORTED', [{ code, ...details }]),
    provenance,
  );
}

function processMusicXmlUploadWithSemanticValidation({
  upload,
  referenceBundle,
} = {}) {
  const uploadResult = processMusicXmlUpload(upload);

  if (uploadResult.status === 'BLOCKED' || referenceBundle == null) {
    return Object.freeze({
      uploadResult,
      semanticValidation: null,
    });
  }

  const provenance = referenceBundle?.provenance;
  const admission = admitSemanticReferenceBundle(referenceBundle);
  if (admission.status !== 'PASS') {
    return Object.freeze({
      uploadResult,
      semanticValidation: unsupportedPacket(
        'REFERENCE_NOT_ADMITTED',
        provenance,
        { cause: admission.diagnostics[0] ?? 'UNKNOWN' },
      ),
    });
  }

  const uploadBytes = toBuffer(upload?.bytes);
  const referenceBytes = toBuffer(referenceBundle?.sourceBytes);
  if (uploadBytes === null
    || referenceBytes === null
    || !uploadBytes.equals(referenceBytes)) {
    return Object.freeze({
      uploadResult,
      semanticValidation: unsupportedPacket('UPLOAD_SOURCE_MISMATCH', provenance),
    });
  }

  let guitarProjection;
  try {
    const parsedDocument = parseParsedMusicXmlDocument(uploadBytes);
    const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(parsedDocument);
    guitarProjection = projectGuitarSourceSemantics(sourceModel);
  } catch {
    return Object.freeze({
      uploadResult,
      semanticValidation: unsupportedPacket(
        'GUITAR_SOURCE_PROJECTION_FAILED',
        provenance,
      ),
    });
  }

  const semanticComparison = compareGuitarSourceWithSemanticReference({
    guitarProjection,
    referenceBundle,
  });

  return Object.freeze({
    uploadResult,
    semanticValidation: packetFromComparison(semanticComparison, provenance),
  });
}

module.exports = {
  processMusicXmlUploadWithSemanticValidation,
};
