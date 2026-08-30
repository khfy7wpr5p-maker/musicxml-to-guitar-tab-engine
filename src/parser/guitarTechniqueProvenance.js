'use strict';

const crypto = require('node:crypto');
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

function requireSameNamespaceChildren(node, path) {
  if (node.children.some((child) => child.uri !== node.uri)) {
    fail(`${path} contains foreign-namespace children.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  }
}

function scalarInteger(node, path, minimum, maximum, allowedAttributes = new Set()) {
  attributeMap(node, allowedAttributes, path);
  requireSameNamespaceChildren(node, path);
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

function validatePairing(input, kind, state) {
  const pairingFields = ['pairingId', 'pairingBasis', 'sourcePairingToken'];
  const hasAnyPairing = pairingFields.some(
    (field) => Object.hasOwn(input, field) && input[field] !== undefined && input[field] !== null,
  );
  if (!hasAnyPairing) {
    return Object.freeze({ pairingId: null, pairingBasis: null, sourcePairingToken: null });
  }
  if (kind !== 'HAMMER_ON') {
    fail(
      'Deterministic pairing is not cleared for this technique kind.',
      'GUITAR_TECHNIQUE_PAIRING_KIND_NOT_CLEARED',
      { kind },
    );
  }
  if (state !== 'START' && state !== 'STOP') {
    fail(
      'Only START or STOP technique provenance may carry deterministic pairing identity.',
      'GUITAR_TECHNIQUE_PAIRING_STATE_INVALID',
      { state },
    );
  }
  if (
    typeof input.pairingId !== 'string'
    || input.pairingId.length < 1
    || input.pairingId.length > 96
    || !/^[A-Za-z0-9_.:-]+$/.test(input.pairingId)
  ) {
    fail('pairingId must be a bounded deterministic identifier.', 'GUITAR_TECHNIQUE_PAIRING_INVALID');
  }
  if (input.pairingBasis !== 'DETERMINISTIC_SOURCE_IDENTITY') {
    fail(
      'pairingBasis must prove deterministic source identity.',
      'GUITAR_TECHNIQUE_NON_DETERMINISTIC_PAIRING_FORBIDDEN',
    );
  }
  if (
    typeof input.sourcePairingToken !== 'string'
    || input.sourcePairingToken.length < 1
    || input.sourcePairingToken.length > 128
  ) {
    fail(
      'sourcePairingToken must be a bounded deterministic source token.',
      'GUITAR_TECHNIQUE_PAIRING_INVALID',
    );
  }
  return Object.freeze({
    pairingId: input.pairingId,
    pairingBasis: input.pairingBasis,
    sourcePairingToken: input.sourcePairingToken,
  });
}

function createGuitarTechniqueProvenance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Technique provenance input must be an object.');
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (Object.hasOwn(input, field)) {
      fail('Technique provenance must not carry musical facts or solver authority.', 'GUITAR_TECHNIQUE_AUTHORITY_FORBIDDEN', { field });
    }
  }
  if (!KINDS.has(input.kind)) fail('Unsupported guitar technique provenance kind.', 'UNSUPPORTED_GUITAR_TECHNIQUE_KIND', { kind: input.kind });
  if (!STATES.has(input.state)) fail('Unsupported guitar technique provenance state.', 'UNSUPPORTED_GUITAR_TECHNIQUE_STATE', { state: input.state });
  if (input.capabilityClass !== SAFE_METADATA_ONLY) fail('PROD-TECH-01 only authorizes metadata-only provenance.', 'GUITAR_TECHNIQUE_PHYSICAL_AUTHORITY_FORBIDDEN');
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

  const pairing = validatePairing(input, input.kind, input.state);
  return Object.freeze({
    documentType: 'GuitarTechniqueProvenance',
    contractVersion: GUITAR_TECHNIQUE_PROVENANCE_VERSION,
    kind: input.kind,
    subtype: input.subtype,
    state: input.state,
    sourcePath: input.sourcePath,
    sourceAttributes: Object.freeze(copiedAttributes),
    sourceText: boundedSourceText(input.sourceText),
    pairingId: pairing.pairingId,
    pairingBasis: pairing.pairingBasis,
    sourcePairingToken: pairing.sourcePairingToken,
    normalizedSemantics: input.normalizedSemantics,
    capabilityClass: SAFE_METADATA_ONLY,
  });
}

function record(records, input) {
  const recordIndex = records.length;
  records.push(createGuitarTechniqueProvenance({ ...input, capabilityClass: SAFE_METADATA_ONLY }));
  return recordIndex;
}

function parseHammerOn(node, records) {
  const path = 'note/notations/technical/hammer-on';
  const attrs = attributeMap(node, new Set(['number', 'type']), path);
  requireSameNamespaceChildren(node, path);
  if (!/^\d+$/.test(attrs.number || '') || Number(attrs.number) < 1 || Number(attrs.number) > 16) fail(`${path} requires bounded number 1..16.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (!['start', 'stop'].includes(attrs.type)) fail(`${path} requires type=start|stop.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (node.children.length !== 0) fail(`${path} must not contain children.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const text = node.text.trim();
  if ((attrs.type === 'start' && text !== 'H') || (attrs.type === 'stop' && text !== '')) {
    fail(`${path} text does not match the verified Guitar Pro source form.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  }
  const recordIndex = record(records, {
    kind: 'HAMMER_ON', subtype: 'musicxml-hammer-on', state: attrs.type === 'start' ? 'START' : 'STOP',
    sourcePath: path, sourceAttributes: attrs, sourceText: text, normalizedSemantics: 'HAMMER_ON',
  });
  return Object.freeze({ attrs, recordIndex });
}

function parseSlide(node, records) {
  const path = 'note/notations/slide';
  const attrs = attributeMap(node, new Set(['number', 'type']), path);
  requireSameNamespaceChildren(node, path);
  if (!/^\d+$/.test(attrs.number || '') || Number(attrs.number) < 1 || Number(attrs.number) > 16) fail(`${path} requires bounded number 1..16.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (!['start', 'stop'].includes(attrs.type)) fail(`${path} requires type=start|stop.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  if (node.children.length !== 0 || node.text.trim().length !== 0) fail(`${path} must be an empty marker.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  record(records, {
    kind: 'SLIDE', subtype: 'musicxml-slide', state: attrs.type === 'start' ? 'START' : 'STOP',
    sourcePath: path, sourceAttributes: attrs, sourceText: '', normalizedSemantics: 'SLIDE',
  });
  return attrs;
}

function emptyMarker(node, path) {
  attributeMap(node, new Set(), path);
  requireSameNamespaceChildren(node, path);
  return node.children.length === 0 && node.text.trim().length === 0;
}

function parseHarmonic(node, records) {
  const path = 'note/notations/technical/harmonic';
  attributeMap(node, new Set(), path);
  requireSameNamespaceChildren(node, path);
  const children = node.children;
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

function pairingContextFromNote(note, partIndex) {
  const voices = directChildren(note, 'voice');
  const staffs = directChildren(note, 'staff');
  if (voices.length !== 1 || staffs.length !== 1) {
    fail('Paired guitar technique evidence requires explicit voice and staff context.', 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING', { path: 'note' });
  }
  const voice = voices[0].text.trim();
  const staff = staffs[0].text.trim();
  if (voices[0].attributes.length !== 0 || voices[0].children.length !== 0 || voice.length < 1 || voice.length > 64 || /\s/.test(voice)) {
    fail('Technique voice context is invalid.', 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING', { path: 'note/voice' });
  }
  if (staffs[0].attributes.length !== 0 || staffs[0].children.length !== 0 || !/^\d+$/.test(staff) || Number(staff) < 1 || Number(staff) > 16) {
    fail('Technique staff context is invalid.', 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING', { path: 'note/staff' });
  }
  return Object.freeze({ partIndex, voice, staff });
}

function pushPairEvent(pairEvents, context, kind, attrs, recordIndex = null, sourceToken = null) {
  pairEvents.push(Object.freeze({
    ...context,
    kind,
    number: attrs.number,
    state: attrs.type,
    recordIndex,
    sourceToken,
  }));
}

function pairEventKey(event) {
  return `${event.partIndex}\u0000${event.voice}\u0000${event.staff}\u0000${event.kind}\u0000${event.number}`;
}

function validatePairEvents(pairEvents) {
  const balances = new Map();
  const labels = new Map();
  for (const event of pairEvents) {
    const key = pairEventKey(event);
    const current = balances.get(key) || 0;
    labels.set(key, event);
    if (event.state === 'start') {
      balances.set(key, current + 1);
      continue;
    }
    if (current <= 0) {
      fail('Technique stop marker has no preceding compatible start marker.', 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING', {
        kind: event.kind, number: event.number, voice: event.voice, staff: event.staff,
      });
    }
    balances.set(key, current - 1);
  }
  for (const [key, balance] of balances) {
    if (balance === 0) continue;
    const event = labels.get(key);
    fail('Technique start marker has no compatible stop endpoint.', 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING', {
      kind: event.kind, number: event.number, voice: event.voice, staff: event.staff, unmatchedStarts: balance,
    });
  }
}

function sourceIdentityToken(location, markerIndex) {
  const token = [
    `p${location.partIndex}`,
    `m${location.measureIndex}`,
    `n${location.noteIndex}`,
    `o${location.notationsIndex}`,
    `t${location.technicalIndex}`,
    `h${markerIndex}`,
  ].join('.');
  if (token.length > 64) {
    fail(
      'Technique source identity token exceeds the bounded pairing contract.',
      'GUITAR_TECHNIQUE_PROVENANCE_LIMIT_EXCEEDED',
    );
  }
  return token;
}

function rebindRecordWithPairing(recordValue, pairing) {
  return createGuitarTechniqueProvenance({
    kind: recordValue.kind,
    subtype: recordValue.subtype,
    state: recordValue.state,
    sourcePath: recordValue.sourcePath,
    sourceAttributes: recordValue.sourceAttributes,
    sourceText: recordValue.sourceText,
    normalizedSemantics: recordValue.normalizedSemantics,
    capabilityClass: SAFE_METADATA_ONLY,
    ...pairing,
  });
}

function applyDeterministicHammerPairing(records, pairEvents) {
  const groups = new Map();
  for (const event of pairEvents) {
    if (event.kind !== 'HAMMER_ON') continue;
    const key = pairEventKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  for (const events of groups.values()) {
    let balance = 0;
    let segment = [];
    let ambiguous = false;
    for (const event of events) {
      segment.push(event);
      if (event.state === 'start') {
        balance += 1;
        if (balance > 1) ambiguous = true;
      } else {
        balance -= 1;
      }

      if (balance !== 0) continue;
      if (
        !ambiguous
        && segment.length === 2
        && segment[0].state === 'start'
        && segment[1].state === 'stop'
        && Number.isInteger(segment[0].recordIndex)
        && Number.isInteger(segment[1].recordIndex)
        && typeof segment[0].sourceToken === 'string'
        && typeof segment[1].sourceToken === 'string'
      ) {
        const start = segment[0];
        const stop = segment[1];
        const sourcePairingToken = `${start.sourceToken}>${stop.sourceToken}`;
        const pairingDigest = crypto.createHash('sha256').update(sourcePairingToken).digest('hex').slice(0, 24);
        const pairingId = `HAMMER_ON:n${start.number}:${pairingDigest}`;
        const pairing = {
          pairingId,
          pairingBasis: 'DETERMINISTIC_SOURCE_IDENTITY',
          sourcePairingToken,
        };
        records[start.recordIndex] = rebindRecordWithPairing(records[start.recordIndex], pairing);
        records[stop.recordIndex] = rebindRecordWithPairing(records[stop.recordIndex], pairing);
      }
      segment = [];
      ambiguous = false;
    }
  }
}

function parseTechnical(node, records, pairEvents, pairingContext, location) {
  const path = 'note/notations/technical';
  attributeMap(node, new Set(), path);
  requireSameNamespaceChildren(node, path);
  const children = node.children;
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
  children.forEach((child, childIndex) => {
    if (child.name === 'harmonic') parseHarmonic(child, records);
    else if (child.name === 'hammer-on') {
      const parsedHammer = parseHammerOn(child, records);
      pushPairEvent(
        pairEvents,
        pairingContext(),
        'HAMMER_ON',
        parsedHammer.attrs,
        parsedHammer.recordIndex,
        sourceIdentityToken(location, childIndex),
      );
    } else parsePositionChild(child, records);
  });
}

function parsePlay(node, records) {
  const path = 'note/play';
  attributeMap(node, new Set(), path);
  requireSameNamespaceChildren(node, path);
  if (node.children.length !== 1) fail(`${path} is outside the verified straight-mute shape.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const muteNodes = directChildren(node, 'mute');
  if (muteNodes.length !== 1) fail(`${path} is outside the verified straight-mute shape.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path });
  const mute = muteNodes[0];
  const mutePath = 'note/play/mute';
  attributeMap(mute, new Set(), mutePath);
  requireSameNamespaceChildren(mute, mutePath);
  if (mute.children.length !== 0 || mute.text.trim() !== 'straight') fail(`${mutePath} must be exact text straight.`, 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: mutePath });
  record(records, { kind: 'MUTE', subtype: 'straight', state: 'SINGLE', sourcePath: mutePath, sourceAttributes: Object.freeze({}), sourceText: 'straight', normalizedSemantics: 'MUTE_STRAIGHT' });
}

function parseNote(node, records, pairEvents, partIndex, measureIndex, noteIndex) {
  const plays = directChildren(node, 'play');
  if (plays.length > 1) fail('note/play is duplicated; mute provenance scope is ambiguous.', 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: 'note/play' });
  for (const play of plays) parsePlay(play, records);

  let context = null;
  const pairingContext = () => {
    if (!context) context = pairingContextFromNote(node, partIndex);
    return context;
  };

  directChildren(node, 'notations').forEach((notations, notationsIndex) => {
    const slideSeen = new Set();
    notations.children.forEach((child, technicalIndex) => {
      if (child.uri !== notations.uri) return;
      if (child.name === 'technical') {
        parseTechnical(
          child,
          records,
          pairEvents,
          pairingContext,
          Object.freeze({ partIndex, measureIndex, noteIndex, notationsIndex, technicalIndex }),
        );
        return;
      }
      if (child.name === 'slide') {
        const attrs = attributeMap(child, new Set(['number', 'type']), 'note/notations/slide');
        const key = `${attrs.number || ''}:${attrs.type || ''}`;
        if (slideSeen.has(key)) fail('note/notations/slide contains duplicate event markers.', 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE', { path: 'note/notations/slide' });
        slideSeen.add(key);
        const parsedAttrs = parseSlide(child, records);
        pushPairEvent(pairEvents, pairingContext(), 'SLIDE', parsedAttrs);
      }
    });
  });
}

function extractGuitarTechniqueProvenance(parsedDocument) {
  if (!parsedDocument || parsedDocument.documentType !== 'ParsedMusicXmlDocument' || parsedDocument.contractVersion !== '1.0.0' || !parsedDocument.root || parsedDocument.root.name !== 'score-partwise') {
    fail('Expected ParsedMusicXmlDocument score-partwise input.');
  }
  const records = [];
  const pairEvents = [];
  const parts = directChildren(parsedDocument.root, 'part');
  parts.forEach((part, partIndex) => {
    directChildren(part, 'measure').forEach((measure, measureIndex) => {
      directChildren(measure, 'note').forEach((note, noteIndex) => {
        parseNote(note, records, pairEvents, partIndex, measureIndex, noteIndex);
      });
    });
  });
  validatePairEvents(pairEvents);
  applyDeterministicHammerPairing(records, pairEvents);
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
