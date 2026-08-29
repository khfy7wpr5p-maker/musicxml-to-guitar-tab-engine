'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { pitchToMidi } = require('../music/pitch');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const { processMusicXmlUpload } = require('./musicXmlUploadRuntime');

const MUSICXML_DOCUMENT_TRANSPOSITION_VERSION = '1.0.0';
const MAX_FILE_NAME_LENGTH = 255;
const SHARP_SPELLINGS = Object.freeze([
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
]);
const FLAT_SPELLINGS = Object.freeze([
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
]);
const KEY_NAMES = Object.freeze({
  major: Object.freeze(['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']),
  minor: Object.freeze(['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m']),
});
const STEP_PC = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });

class MusicXmlDocumentTranspositionError extends EngineError {
  constructor(message, code = 'INVALID_DOCUMENT_TRANSPOSITION_REQUEST', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'MusicXmlDocumentTranspositionError');
  }
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataDescriptors(value, allowed, field, required = allowed) {
  if (!isPlainObject(value)) invalid(`${field} must be a non-proxy plain object.`, { field });
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== 'string' || !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))
    || keys.some((key) => (
      !descriptors[key].enumerable
      || !Object.hasOwn(descriptors[key], 'value')
    ))
  ) {
    invalid(`${field} must use exact enumerable data properties.`, { field });
  }
  return descriptors;
}

function invalid(message, details = {}) {
  throw new MusicXmlDocumentTranspositionError(message, 'INVALID_DOCUMENT_TRANSPOSITION_REQUEST', details);
}

function scalarInteger(node, field) {
  if (!node || node.children.length !== 0 || node.attributes.length !== 0 || !/^-?\d+$/.test(node.text.trim())) {
    throw new MusicXmlDocumentTranspositionError(
      `${field} must be an attribute-free integer leaf.`,
      'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
      { field },
    );
  }
  const value = Number(node.text.trim());
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new MusicXmlDocumentTranspositionError(
      `${field} must be a safe integer other than -0.`,
      'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
      { field },
    );
  }
  return value;
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function requireOne(node, name, field) {
  const matches = directChildren(node, name);
  if (matches.length !== 1) {
    throw new MusicXmlDocumentTranspositionError(
      `${field} must contain exactly one ${name}.`,
      'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
      { field, child: name, observedCount: matches.length },
    );
  }
  return matches[0];
}

function requireOptional(node, name, field) {
  const matches = directChildren(node, name);
  if (matches.length > 1) {
    throw new MusicXmlDocumentTranspositionError(
      `${field} may contain at most one ${name}.`,
      'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
      { field, child: name, observedCount: matches.length },
    );
  }
  return matches[0] || null;
}

function normalizeFileName(value) {
  if (
    typeof value !== 'string' || value.length === 0 || value.length > MAX_FILE_NAME_LENGTH
    || /[\\/\u0000-\u001f\u007f]/.test(value)
    || (!value.toLowerCase().endsWith('.musicxml') && !value.toLowerCase().endsWith('.xml'))
  ) {
    invalid('fileName must be a bounded .musicxml or .xml plain file name.', { field: 'fileName' });
  }
  return value;
}

function normalizeBytes(value) {
  if (value && typeof value === 'object' && isProxy(value)) invalid('bytes must not be a Proxy.', { field: 'bytes' });
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    invalid('bytes must be a Buffer or Uint8Array.', { field: 'bytes' });
  }
  return Buffer.from(value);
}

function parseKeyName(value) {
  if (typeof value !== 'string' || value.length > 16) return null;
  const compact = value.trim().replace(/\s+/g, ' ');
  for (const mode of ['major', 'minor']) {
    for (let index = 0; index < KEY_NAMES[mode].length; index += 1) {
      const canonical = KEY_NAMES[mode][index];
      const tonic = mode === 'minor' ? canonical.slice(0, -1) : canonical;
      const aliases = mode === 'major'
        ? [canonical, `${canonical} major`]
        : [canonical, `${tonic} minor`];
      if (aliases.some((alias) => alias.toLowerCase() === compact.toLowerCase())) {
        const fifths = index - 7;
        return Object.freeze({ name: canonical, tonic, mode, fifths, pitchClass: keyPitchClass(fifths, mode) });
      }
    }
  }
  return null;
}

function keyPitchClass(fifths, mode) {
  return mod((mode === 'minor' ? 9 : 0) + (7 * fifths), 12);
}

function normalizeOperation(value) {
  const descriptors = exactDataDescriptors(
    value,
    ['semitones', 'targetKey', 'spelling'],
    'operation',
    [],
  );
  const hasSemitones = Object.hasOwn(descriptors, 'semitones');
  const hasTargetKey = Object.hasOwn(descriptors, 'targetKey');
  if (hasSemitones === hasTargetKey) {
    invalid('operation must contain exactly one of semitones or targetKey.', { field: 'operation' });
  }
  const spelling = Object.hasOwn(descriptors, 'spelling') ? descriptors.spelling.value : null;
  if (spelling !== null && spelling !== 'sharps' && spelling !== 'flats') {
    invalid('operation.spelling must be sharps or flats.', { field: 'operation.spelling' });
  }
  if (hasSemitones) {
    const semitones = descriptors.semitones.value;
    if (!Number.isSafeInteger(semitones) || semitones === 0 || semitones < -11 || semitones > 11) {
      invalid('operation.semitones must be a non-zero integer from -11 through 11.', { field: 'operation.semitones' });
    }
    if (spelling === null) invalid('Semitone transposition requires an explicit spelling policy.', { field: 'operation.spelling' });
    return Object.freeze({ kind: 'semitones', semitones, spelling, targetKey: null });
  }
  const targetKey = parseKeyName(descriptors.targetKey.value);
  if (!targetKey) invalid('operation.targetKey is not a supported standard major/minor key.', { field: 'operation.targetKey' });
  const impliedSpelling = targetKey.fifths < 0 ? 'flats' : 'sharps';
  if (spelling !== null && spelling !== impliedSpelling && targetKey.fifths !== 0) {
    invalid('operation.spelling conflicts with the explicit target key.', { field: 'operation.spelling' });
  }
  return Object.freeze({ kind: 'target-key', semitones: null, spelling: spelling || impliedSpelling, targetKey });
}

function normalizeRequest(request) {
  const descriptors = exactDataDescriptors(
    request,
    ['fileName', 'bytes', 'expectedInputSha256', 'operation'],
    'request',
    ['fileName', 'bytes', 'operation'],
  );
  const fileName = normalizeFileName(descriptors.fileName.value);
  const bytes = normalizeBytes(descriptors.bytes.value);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (Object.hasOwn(descriptors, 'expectedInputSha256')) {
    const expectedInputSha256 = descriptors.expectedInputSha256.value;
    if (typeof expectedInputSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedInputSha256)) {
      invalid('expectedInputSha256 must be a lowercase SHA-256 digest.', { field: 'expectedInputSha256' });
    }
    if (expectedInputSha256 !== sha256) {
      throw new MusicXmlDocumentTranspositionError(
        'The source snapshot no longer matches expectedInputSha256.',
        'STALE_DOCUMENT_TRANSPOSITION_SOURCE',
        { expectedInputSha256, actualInputSha256: sha256 },
      );
    }
  }
  return Object.freeze({
    fileName,
    bytes,
    sha256,
    operation: normalizeOperation(descriptors.operation.value),
  });
}

function pitchSpelling(targetMidi, policy) {
  if (!Number.isSafeInteger(targetMidi) || targetMidi < 0 || targetMidi > 127) {
    throw new MusicXmlDocumentTranspositionError(
      'Transposed pitch is outside MIDI 0-127.',
      'UNPLAYABLE_DOCUMENT_TRANSPOSITION',
      { targetMidi },
    );
  }
  const [step, alter] = (policy === 'flats' ? FLAT_SPELLINGS : SHARP_SPELLINGS)[targetMidi % 12];
  const octave = Math.floor(targetMidi / 12) - 1;
  return Object.freeze({ step, alter, octave, midi: targetMidi });
}

function transposePitchNode(node, semitones, spelling) {
  const stepNode = requireOne(node, 'step', 'pitch');
  const octaveNode = requireOne(node, 'octave', 'pitch');
  const alterNode = requireOptional(node, 'alter', 'pitch');
  if (stepNode.children.length !== 0 || stepNode.attributes.length !== 0 || !/^[A-G]$/.test(stepNode.text.trim())) {
    throw new MusicXmlDocumentTranspositionError('pitch.step is unsupported.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { field: 'pitch.step' });
  }
  const source = {
    step: stepNode.text.trim(),
    alter: alterNode ? scalarInteger(alterNode, 'pitch.alter') : 0,
    octave: scalarInteger(octaveNode, 'pitch.octave'),
  };
  const target = pitchSpelling(pitchToMidi(source) + semitones, spelling);
  stepNode.text = target.step;
  octaveNode.text = String(target.octave);
  if (target.alter === 0) {
    node.children = node.children.filter((child) => child !== alterNode);
  } else if (alterNode) {
    alterNode.text = String(target.alter);
  } else {
    const index = node.children.indexOf(stepNode);
    node.children.splice(index + 1, 0, createNode(node.uri, 'alter', String(target.alter)));
  }
  return target;
}

const ACCIDENTAL_TEXT = Object.freeze({
  '-2': 'flat-flat',
  '-1': 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'double-sharp',
});

function transposeNoteNode(node, semitones, spelling) {
  const pitches = directChildren(node, 'pitch');
  if (pitches.length === 0) return;
  if (pitches.length !== 1) {
    throw new MusicXmlDocumentTranspositionError(
      'A pitched note must contain exactly one pitch.',
      'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
      { field: 'note.pitch', observedCount: pitches.length },
    );
  }
  const target = transposePitchNode(pitches[0], semitones, spelling);
  const accidentals = directChildren(node, 'accidental');
  if (accidentals.length > 1) {
    throw new MusicXmlDocumentTranspositionError(
      'A note may contain at most one accidental.',
      'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
      { field: 'note.accidental', observedCount: accidentals.length },
    );
  }
  if (accidentals[0]) {
    if (accidentals[0].children.length !== 0) {
      throw new MusicXmlDocumentTranspositionError(
        'note.accidental must be a scalar leaf.',
        'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE',
        { field: 'note.accidental' },
      );
    }
    accidentals[0].text = ACCIDENTAL_TEXT[target.alter];
  }
}

function transposeHarmonyPitch(container, stepName, alterName, semitones, spelling, field) {
  const stepNode = requireOne(container, stepName, field);
  const alterNode = requireOptional(container, alterName, field);
  if (stepNode.children.length !== 0 || stepNode.attributes.length !== 0 || !/^[A-G]$/.test(stepNode.text.trim())) {
    throw new MusicXmlDocumentTranspositionError(`${field}.${stepName} is unsupported.`, 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { field });
  }
  const sourcePc = mod(STEP_PC[stepNode.text.trim()] + (alterNode ? scalarInteger(alterNode, `${field}.${alterName}`) : 0), 12);
  const [step, alter] = (spelling === 'flats' ? FLAT_SPELLINGS : SHARP_SPELLINGS)[mod(sourcePc + semitones, 12)];
  stepNode.text = step;
  if (alter === 0) {
    container.children = container.children.filter((child) => child !== alterNode);
  } else if (alterNode) {
    alterNode.text = String(alter);
  } else {
    const index = container.children.indexOf(stepNode);
    container.children.splice(index + 1, 0, createNode(container.uri, alterName, String(alter)));
  }
}

function transposeHarmonyNode(node, semitones, spelling) {
  const root = requireOne(node, 'root', 'harmony');
  const bass = requireOptional(node, 'bass', 'harmony');
  transposeHarmonyPitch(root, 'root-step', 'root-alter', semitones, spelling, 'harmony.root');
  if (bass) {
    transposeHarmonyPitch(bass, 'bass-step', 'bass-alter', semitones, spelling, 'harmony.bass');
  }
  const kind = requireOne(node, 'kind', 'harmony');
  kind.attributes = kind.attributes.filter(
    (attribute) => !(attribute.uri.length === 0 && attribute.name === 'text'),
  );
}

function createNode(uri, name, text = '') {
  return { name, uri, attributes: [], text, children: [] };
}

function keyFacts(node) {
  const fifthsNode = requireOne(node, 'fifths', 'key');
  const modeNode = requireOptional(node, 'mode', 'key');
  const fifths = scalarInteger(fifthsNode, 'key.fifths');
  if (fifths < -7 || fifths > 7) {
    throw new MusicXmlDocumentTranspositionError('key.fifths is outside -7 through 7.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { fifths });
  }
  let mode = modeNode ? modeNode.text.trim() : 'major';
  if (mode !== 'major' && mode !== 'minor') {
    throw new MusicXmlDocumentTranspositionError('Only major/minor key signatures can be transposed.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { mode });
  }
  return { fifthsNode, modeNode, fifths, mode };
}

function selectFifths(pitchClass, mode, spelling) {
  const candidates = [];
  for (let fifths = -7; fifths <= 7; fifths += 1) {
    if (keyPitchClass(fifths, mode) === pitchClass) candidates.push(fifths);
  }
  candidates.sort((left, right) => {
    const leftPenalty = spelling === 'flats' ? (left > 0 ? 1 : 0) : (left < 0 ? 1 : 0);
    const rightPenalty = spelling === 'flats' ? (right > 0 ? 1 : 0) : (right < 0 ? 1 : 0);
    return leftPenalty - rightPenalty || Math.abs(left) - Math.abs(right) || left - right;
  });
  if (candidates.length === 0) {
    throw new MusicXmlDocumentTranspositionError('Transposed key has no supported standard signature.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { pitchClass, mode });
  }
  return candidates[0];
}

function transposeKeyNode(node, semitones, spelling, targetKey = null, isInitial = false) {
  const facts = keyFacts(node);
  const mode = targetKey && isInitial ? targetKey.mode : facts.mode;
  const fifths = targetKey && isInitial
    ? targetKey.fifths
    : selectFifths(mod(keyPitchClass(facts.fifths, facts.mode) + semitones, 12), mode, spelling);
  facts.fifthsNode.text = String(fifths);
  if (facts.modeNode) facts.modeNode.text = mode;
  else if (mode === 'minor') node.children.push(createNode(node.uri, 'mode', mode));
}

function firstKeyNode(root) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.shift();
    if (node.name === 'key') return node;
    stack.unshift(...node.children);
  }
  return null;
}

function insertInitialKey(root, key) {
  const part = directChildren(root, 'part')[0];
  const measure = part && directChildren(part, 'measure')[0];
  const attributes = measure && directChildren(measure, 'attributes')[0];
  if (!attributes) {
    throw new MusicXmlDocumentTranspositionError('Target-key transposition requires initial attributes.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { field: 'attributes' });
  }
  const keyNode = createNode(attributes.uri, 'key');
  keyNode.children.push(createNode(attributes.uri, 'fifths', String(key.fifths)));
  if (key.mode === 'minor') keyNode.children.push(createNode(attributes.uri, 'mode', key.mode));
  const divisionsIndex = attributes.children.findIndex((child) => child.uri === attributes.uri && child.name === 'divisions');
  attributes.children.splice(divisionsIndex < 0 ? 0 : divisionsIndex + 1, 0, keyNode);
  return keyNode;
}

function cloneNode(node) {
  return {
    name: node.name,
    uri: node.uri,
    attributes: node.attributes.map((attribute) => ({ ...attribute })),
    text: node.text,
    children: node.children.map(cloneNode),
  };
}

function transformDocument(parsedDocument, operation, runtime = null) {
  const root = cloneNode(parsedDocument.root);
  let initialKey = firstKeyNode(root);
  const sourceKey = initialKey ? keyFacts(initialKey) : { fifths: 0, mode: 'major' };
  let semitones = operation.kind === 'target-key'
    ? mod(operation.targetKey.pitchClass - keyPitchClass(sourceKey.fifths, sourceKey.mode), 12)
    : operation.semitones;
  if (operation.kind === 'target-key' && semitones > 6) semitones -= 12;
  if (operation.kind === 'target-key' && !initialKey) initialKey = insertInitialKey(root, operation.targetKey);

  let initialKeySeen = false;
  const stack = [root];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    visited += 1;
    if (runtime && visited % 256 === 0) {
      runtime.checkpoint('document-transposition:transform', { visited });
    }
    if (node.name === 'note') transposeNoteNode(node, semitones, operation.spelling);
    if (node.name === 'key') {
      transposeKeyNode(node, semitones, operation.spelling, operation.targetKey, !initialKeySeen);
      initialKeySeen = true;
    }
    if (node.name === 'harmony') transposeHarmonyNode(node, semitones, operation.spelling);
    for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
  }
  return { root, semitones, targetKey: operation.targetKey };
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serializeNode(node, rootUri = null) {
  if (node.children.length > 0 && node.text.trim().length > 0) {
    throw new MusicXmlDocumentTranspositionError('Mixed-content MusicXML nodes are unsupported.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { node: node.name });
  }
  if (node.children.some((child) => child.uri !== node.uri)) {
    throw new MusicXmlDocumentTranspositionError('Foreign-namespace MusicXML children are unsupported.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { node: node.name });
  }
  if (node.attributes.some((attribute) => attribute.uri.length > 0)) {
    throw new MusicXmlDocumentTranspositionError('Namespaced MusicXML attributes are unsupported.', 'UNSUPPORTED_DOCUMENT_TRANSPOSITION_SOURCE', { node: node.name });
  }
  const namespace = rootUri === null && node.uri ? ` xmlns="${escapeAttribute(node.uri)}"` : '';
  const attributes = node.attributes.map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`).join('');
  if (node.children.length === 0 && node.text.length === 0) return `<${node.name}${namespace}${attributes}/>`;
  return `<${node.name}${namespace}${attributes}>${node.children.length > 0 ? node.children.map((child) => serializeNode(child, node.uri)).join('') : escapeText(node.text)}</${node.name}>`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function blocked(request, error) {
  return deepFreeze({
    documentType: 'MusicXmlDocumentTranspositionResult',
    contractVersion: MUSICXML_DOCUMENT_TRANSPOSITION_VERSION,
    status: 'BLOCKED',
    route: 'UNRESOLVED',
    input: request ? { fileName: request.fileName, byteLength: request.bytes.length, sha256: request.sha256 } : null,
    preflight: {
      status: 'BLOCKED', canProcess: false, summary: null,
      issues: [{
        severity: 'error', category: 'content', code: error.code || 'DOCUMENT_TRANSPOSITION_FAILED',
        message: error.message, location: { measure: null, measureIndex: null, eventIndex: null, sourceEventId: null },
        details: error.details || {},
      }],
    },
    canonicalTabResult: null,
    musicXml: null,
    sourceMusicXml: null,
    transposition: null,
  });
}

function processMusicXmlDocumentTransposition(rawRequest, options = {}, runtime = null) {
  let request = null;
  try {
    exactDataDescriptors(options, [], 'options', []);
    request = normalizeRequest(rawRequest);
    if (runtime) runtime.checkpoint('document-transposition:start');
    const parsedDocument = parseParsedMusicXmlDocument(request.bytes, {}, runtime);
    const transformed = transformDocument(parsedDocument, request.operation, runtime);
    const sourceMusicXml = `<?xml version="1.0" encoding="UTF-8"?>${serializeNode(transformed.root)}`;
    const converted = processMusicXmlUpload(
      { fileName: request.fileName, bytes: Buffer.from(sourceMusicXml, 'utf8') },
      {},
      runtime,
    );
    const result = deepFreeze({
      ...converted,
      documentType: 'MusicXmlDocumentTranspositionResult',
      contractVersion: MUSICXML_DOCUMENT_TRANSPOSITION_VERSION,
      sourceMusicXml: converted.status === 'PASS' ? sourceMusicXml : null,
      transposition: converted.status === 'PASS' ? {
        semitones: transformed.semitones,
        spelling: request.operation.spelling,
        targetKey: transformed.targetKey ? transformed.targetKey.name : null,
        sourceSha256: request.sha256,
      } : null,
    });
    if (runtime) runtime.checkpoint('document-transposition:complete');
    return result;
  } catch (error) {
    return blocked(request, error instanceof Error ? error : new Error('Document transposition failed.'));
  }
}

module.exports = {
  MUSICXML_DOCUMENT_TRANSPOSITION_VERSION,
  MusicXmlDocumentTranspositionError,
  processMusicXmlDocumentTransposition,
};
