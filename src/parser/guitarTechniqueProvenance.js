'use strict';

const { EngineError } = require('../errors/engineError');

const GUITAR_TECHNIQUE_PROVENANCE_VERSION = '1.0.0';
const COLLECTION_VERSION = '1.0.0';
const SAFE_METADATA_ONLY = 'SAFE_METADATA_ONLY';
const KINDS = new Set(['HAMMER_ON', 'SLIDE', 'HARMONIC', 'MUTE', 'POSITION']);
const STATES = new Set(['START', 'STOP', 'SINGLE']);
const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  'pitch', 'octave', 'onset', 'duration', 'voice', 'staff', 'tie', 'grace',
  'chordMembership', 'candidate', 'candidates', 'ranking', 'solverState',
]);

class GuitarTechniqueProvenanceError extends EngineError {
  constructor(message, code = 'INVALID_GUITAR_TECHNIQUE_PROVENANCE', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'GuitarTechniqueProvenanceError');
  }
}

function fail(message, code = 'INVALID_GUITAR_TECHNIQUE_PROVENANCE', details = {}) {
  throw new GuitarTechniqueProvenanceError(message, code, details);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name && child.uri === node.uri);
}

function unqualifiedAttributes(node) {
  return node.attributes.filter((attribute) => attribute.uri.length === 0);
}

function attributeMap(node, allowedNames, path) {
  const result = {};
  const seen = new Set();
  for (const item of node.attributes) {
    if (item.uri.length !== 0 || !allowedNames.has(item.name) || seen.has(item.name)) {
      fail(`${path} contains unsupported or duplicate attributes.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
    }
    seen.add(item.name);
    if (item.name.length > 64 || item.value.length > 256) {
      fail(`${path} contains unbounded source attributes.`, 'GUITAR_TECHNIQUE_PROVENANCE_LIMIT_EXCEEDED', { path });
    }
    result[item.name] = item.value;
  }
  return Object.freeze(Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))));
}

function scalarInteger(node, path, minimum, maximum, allowedAttributes = new Set()) {
  attributeMap(node, allowedAttributes, path);
  if (node.children.length !== 0 || !/^-?\d+$/.test(node.text.trim())) {
    fail(`${path} must be an integer scalar.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  }
  const value = Number.parseInt(node.text.trim(), 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum || Object.is(value, -0)) {
    fail(`${path} is outside the supported bounds.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path, value });
  }
  return value;
}

function boundedSourceText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 256) {
    fail('Technique source text exceeds the bounded provenance contract.', 'GUITAR_TECHNIQUE_PROVENANCE_LIMIT_EXCEEDED');
  }
  return value;
}

function createGuitarTechniqueProvenance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('Technique provenance input must be an object.');
  }
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (Object.hasOwn(input, field)) {
      fail('Technique provenance must not carry musical facts or solver authority.', 'GUITAR_TECHNIQUE_AUTHORITY_FORBIDDEN', { field });
    }
  }
  if (!KINDS.has(input.kind)) fail('Unsupported guitar technique provenance kind.', 'UNSUPPORTED_GUITAR_TECHNIQUE_KIND', { kind: input.kind });
  if (!STATES.has(input.state)) fail('Unsupported guitar technique provenance state.', 'UNSUPPORTED_GUITAR_TECHNIQUE_STATE', { state: input.state });
  if (input.capabilityClass !== SAFE_METADATA_ONLY) {
    fail('PROD-TECH-01 only authorizes metadata-only provenance.', 'GUITAR_TECHNIQUE_PHYSICAL_AUTHORITY_FORBIDDEN');
  }
  if (typeof input.subtype !== 'string' || input.subtype.length < 1 || input.subtype.length > 96) fail('Technique subtype must be bounded.');
  if (typeof input.sourcePath !== 'string' || input.sourcePath.length > 192 || !/^note(?:\/[A-Za-z][A-Za-z0-9_-]*)+$/.test(input.sourcePath)) fail('Technique sourcePath is invalid.');
  if (typeof input.normalizedSemantics !== 'string' || !/^[A-Z][A-Z0-9_:-]*$/.test(input.normalizedSemantics) || input.normalizedSemantics.length > 96) fail('Technique normalized semantics is invalid.');

  const sourceAttributes = input.sourceAttributes || Object.freeze({});
  if (typeof sourceAttributes !== 'object' || Array.isArray(sourceAttributes) || Object.keys(sourceAttributes).length > 16) {
    fail('Technique sourceAttributes must be a bounded object.', 'GUITAR_TECHNIQUE_PROVENANCE_LIMIT_EXCEEDED');
  }
  const copiedAttributes = {};
  for (const [key, value] of Object.entries(sourceAttributes).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(key) || key.length > 64 || typeof value !== 'string' || value.length > 256) {
      fail('Technique sourceAttributes are invalid or unbounded.', 'GUITAR_TECHNIQUE_PROVENANCE_LIMIT_EXCEEDED', { key });
    }
    copiedAttributes[key] = value;
  }

  return Object.freeze({
    documentType: 'GuitarTechniqueProvenance',
    contractVersion: GUITAR_TECHNIQUE_PROVENANCE_VERSION,
    kind: input.kind,
    subtype: input.subtype,
    state: input.state,
    sourcePath: input.sourcePath,
    sourceAttributes: Object.freeze(copiedAttributes),
    sourceText: boundedSourceText(input.sourceText),
    pairingId: null,
    pairingBasis: null,
    sourcePairingToken: null,
    normalizedSemantics: input.normalizedSemantics,
    capabilityClass: SAFE_METADATA_ONLY,
  });
}

function record(records, input) {
  records.push(createGuitarTechniqueProvenance({ ...input, capabilityClass: SAFE_METADATA_ONLY }));
}

function parseHammerOn(node, records) {
  const path = 'note/notations/technical/hammer-on';
  const attrs = attributeMap(node, new Set(['number', 'type']), path);
  if (!/^\d+$/.test(attrs.number || '') || Number(attrs.number) < 1 || Number(attrs.number) > 16) {
    fail(`${path} requires bounded number 1..16.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  }
  if (!['start', 'stop'].includes(attrs.type)) fail(`${path} requires type=start|stop.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (node.children.length !== 0) fail(`${path} must not contain children.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const text = node.text.trim();
  if ((attrs.type === 'start' && text !== 'H') || (attrs.type === 'stop' && text !== '')) {
    fail(`${path} text does not match the verified Guitar Pro source form.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  }
  record(records, {
    kind: 'HAMMER_ON', subtype: 'musicxml-hammer-on', state: attrs.type === 'start' ? 'START' : 'STOP',
    sourcePath: path, sourceAttributes: attrs, sourceText: text, normalizedSemantics: 'HAMMER_ON',
  });
}

function parseSlide(node, records) {
  const path = 'note/notations/slide';
  const attrs = attributeMap(node, new Set(['number', 'type']), path);
  if (!/^\d+$/.test(attrs.number || '') || Number(attrs.number) < 1 || Number(attrs.number) > 16) fail(`${path} requires bounded number 1..16.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (!['start', 'stop'].includes(attrs.type)) fail(`${path} requires type=start|stop.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (node.children.length !== 0 || node.text.trim().length !== 0) fail(`${path} must be an empty marker.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  record(records, {
    kind: 'SLIDE', subtype: 'musicxml-slide', state: attrs.type === 'start' ? 'START' : 'STOP',
    sourcePath: path, sourceAttributes: attrs, sourceText: '', normalizedSemantics: 'SLIDE',
  });
}

function emptyMarker(node, path) {
  attributeMap(node, new Set(), path);
  return node.children.length === 0 && node.text.trim().length === 0;
}

function parseHarmonic(node, records) {
  const path = 'note/notations/technical/harmonic';
  attributeMap(node, new Set(), path);
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.length === 0 && node.text.trim().length === 0) {
    record(records, { kind: 'HARMONIC', subtype: 'unspecified-harmonic-marker', state: 'SINGLE', sourcePath: path, sourceAttributes: Object.freeze({}), sourceText: '', normalizedSemantics: 'HARMONIC_UNSPECIFIED' });
    return;
  }
  if (node.text.trim().length !== 0 || children.length !== 2 || children[0].name !== 'natural' || children[1].name !== 'base-pitch' || !emptyMarker(children[0], `${path}/natural`) || !emptyMarker(children[1], `${path}/base-pitch`)) {
    fail(`${path} is outside the verified metadata-only harmonic shapes.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  }
  record(records, { kind: 'HARMONIC', subtype: 'natural-base-pitch', state: 'SINGLE', sourcePath: path, sourceAttributes: Object.freeze({}), sourceText: '', normalizedSemantics: 'HARMONIC_NATURAL_BASE_PITCH' });
}

function parsePositionChild(node, records) {
  const base = 'note/notations/technical';
  if (node.name === 'string') {
    scalarInteger(node, `${base}/string`, 1, 16, new Set(['placement']));
    record(records, { kind: 'POSITION', subtype: 'string', state: 'SINGLE', sourcePath: `${base}/string`, sourceAttributes: attributeMap(node, new Set(['placement']), `${base}/string`), sourceText: node.text.trim(), normalizedSemantics: 'POSITION_STRING' });
    return;
  }
  if (node.name === 'fret') {
    scalarInteger(node, `${base}/fret`, 0, 48, new Set(['placement']));
    record(records, { kind: 'POSITION', subtype: 'fret', state: 'SINGLE', sourcePath: `${base}/fret`, sourceAttributes: attributeMap(node, new Set(['placement']), `${base}/fret`), sourceText: node.text.trim(), normalizedSemantics: 'POSITION_FRET' });
    return;
  }
  if (node.name === 'fingering' || node.name === 'pluck') {
    scalarInteger(node, `${base}/${node.name}`, 1, 5);
    record(records, { kind: 'POSITION', subtype: node.name, state: 'SINGLE', sourcePath: `${base}/${node.name}`, sourceAttributes: Object.freeze({}), sourceText: node.text.trim(), normalizedSemantics: `POSITION_${node.name.toUpperCase()}` });
  }
}

function parseTechnical(node, records) {
  const path = 'note/notations/technical';
  attributeMap(node, new Set(), path);
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.length === 0) fail(`${path} must contain verified technique evidence.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const allowed = new Set(['harmonic', 'hammer-on', 'string', 'fret', 'fingering', 'pluck']);
  if (children.some((child) => !allowed.has(child.name))) {
    const child = children.find((candidate) => !allowed.has(candidate.name));
    fail(`${path}/${child.name} is not cleared for PROD-TECH-01.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: `${path}/${child.name}` });
  }
  for (const singleton of ['harmonic', 'string', 'fret', 'fingering', 'pluck']) {
    if (directChildren(node, singleton).length > 1) fail(`${path}/${singleton} is duplicated.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: `${path}/${singleton}` });
  }
  const hammerSeen = new Set();
  for (const hammer of directChildren(node, 'hammer-on')) {
    const attrs = attributeMap(hammer, new Set(['number', 'type']), `${path}/hammer-on`);
    const key = `${attrs.number || ''}:${attrs.type || ''}`;
    if (hammerSeen.has(key)) fail(`${path}/hammer-on contains duplicate event markers.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: `${path}/hammer-on` });
    hammerSeen.add(key);
  }
  for (const child of children) {
    if (child.name === 'harmonic') parseHarmonic(child, records);
    else if (child.name === 'hammer-on') parseHammerOn(child, records);
    else parsePositionChild(child, records);
  }
}

function parsePlay(node, records) {
  const path = 'note/play';
  attributeMap(node, new Set(), path);
  if (node.children.length !== 1) fail(`${path} is outside the verified straight-mute shape.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const muteNodes = directChildren(node, 'mute');
  if (muteNodes.length !== 1) fail(`${path} is outside the verified straight-mute shape.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const mute = muteNodes[0];
  const mutePath = 'note/play/mute';
  attributeMap(mute, new Set(), mutePath);
  if (mute.children.length !== 0 || mute.text.trim() !== 'straight') fail(`${mutePath} must be exact text straight.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: mutePath });
  record(records, { kind: 'MUTE', subtype: 'straight', state: 'SINGLE', sourcePath: mutePath, sourceAttributes: Object.freeze({}), sourceText: 'straight', normalizedSemantics: 'MUTE_STRAIGHT' });
}

function parseNote(node, records) {
  for (const play of directChildren(node, 'play')) parsePlay(play, records);
  for (const notations of directChildren(node, 'notations')) {
    for (const child of notations.children) {
      if (child.uri !== notations.uri) continue;
      if (child.name === 'technical') parseTechnical(child, records);
      else if (child.name === 'slide') parseSlide(child, records);
    }
  }
}

function extractGuitarTechniqueProvenance(parsedDocument) {
  if (!parsedDocument || parsedDocument.documentType !== 'ParsedMusicXmlDocument' || parsedDocument.contractVersion !== '1.0.0' || !parsedDocument.root || parsedDocument.root.name !== 'score-partwise') {
    fail('Expected ParsedMusicXmlDocument score-partwise input.');
  }
  const records = [];
  for (const part of directChildren(parsedDocument.root, 'part')) {
    for (const measure of directChildren(part, 'measure')) {
      for (const note of directChildren(measure, 'note')) parseNote(note, records);
    }
  }
  return Object.freeze({
    documentType: 'GuitarTechniqueProvenanceCollection',
    contractVersion: COLLECTION_VERSION,
    status: records.length === 0 ? 'ABSENT' : 'EXPLICIT',
    authority: 'SOURCE_TECHNIQUE_EVIDENCE_ONLY',
    capabilityClass: SAFE_METADATA_ONLY,
    physicalSemanticsEnabled: false,
    recordCount: records.length,
    records: Object.freeze(records),
  });
}

module.exports = {
  GUITAR_TECHNIQUE_PROVENANCE_VERSION,
  GuitarTechniqueProvenanceError,
  createGuitarTechniqueProvenance,
  extractGuitarTechniqueProvenance,
};
