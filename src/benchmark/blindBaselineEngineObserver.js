'use strict';

const { EngineError } = require('../errors/engineError');
const { createGuitarConfiguration } = require('../guitar/tuning');
const { getPositionCandidates } = require('../guitar/fretboard');
const {
  validatePolyphonicSourceModel,
} = require('../music/polyphonicSourceModel');
const {
  createDeterministicReductionPlan,
} = require('../music/deterministicReductionPlan');
const {
  createDeterministicPa7CandidateSnapshotHandoff,
} = require('../music/deterministicPa7CandidateSnapshotHandoff');

const BLIND_BASELINE_ENGINE_OBSERVER_VERSION = '1.0.0';
const BLIND_BASELINE_POLICY = 'PRESERVE_OR_OCTAVE_MIN_ERGONOMIC_1.0';

const configuration = createGuitarConfiguration();
let REGISTER_MINIMUM_MIDI = Number.POSITIVE_INFINITY;
let REGISTER_MAXIMUM_MIDI = Number.NEGATIVE_INFINITY;
for (const string of configuration.tuning) {
  REGISTER_MINIMUM_MIDI = Math.min(
    REGISTER_MINIMUM_MIDI,
    string.midi + configuration.minimumFret,
  );
  REGISTER_MAXIMUM_MIDI = Math.max(
    REGISTER_MAXIMUM_MIDI,
    string.midi + configuration.maximumFret,
  );
}

class BlindBaselineEngineObserverError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_BLIND_BASELINE_ENGINE_OBSERVER',
      Object.freeze({ ...details }),
      'BlindBaselineEngineObserverError',
    );
  }
}

function invalid(message, details = {}) {
  return new BlindBaselineEngineObserverError(message, details);
}

function collectNotes(source) {
  const notes = [];
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') notes.push(event);
    }
  }
  if (notes.length === 0) {
    throw invalid('Blind baseline requires at least one pitched source note.');
  }
  return notes;
}

function createBlindBaselineArrangementDecisions(sourceModel) {
  const source = validatePolyphonicSourceModel(sourceModel);
  return Object.freeze(collectNotes(source).map((event) => Object.freeze({
    decisionType: event.pitch.midi >= REGISTER_MINIMUM_MIDI && event.pitch.midi <= REGISTER_MAXIMUM_MIDI
      ? 'PRESERVED'
      : 'OCTAVE_DISPLACED',
    sourceEventIds: Object.freeze([event.sourceEventId]),
    sourceGroupId: null,
  })));
}

function lexicographicNumbers(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] === undefined ? Number.POSITIVE_INFINITY : left[index];
    const rightValue = right[index] === undefined ? Number.POSITIVE_INFINITY : right[index];
    if (leftValue !== rightValue) return leftValue - rightValue;
  }
  return 0;
}

function chooseSingletonPosition(targetMidi) {
  const candidates = getPositionCandidates(targetMidi);
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => (
    lexicographicNumbers([left.fret, left.string], [right.fret, right.string])
  ))[0];
}

function ergonomicKey(voicing, shape, verdict) {
  const frets = voicing.positions.map((position) => position.fret);
  const strings = voicing.positions.map((position) => position.string);
  const maximumFret = frets.length === 0 ? 0 : Math.max(...frets);
  const fretSum = frets.reduce((sum, fret) => sum + fret, 0);
  const stringSum = strings.reduce((sum, string) => sum + string, 0);
  return [
    verdict.fretSpan,
    verdict.usedFingerCount,
    verdict.barreCount,
    maximumFret,
    fretSum,
    stringSum,
    ...frets,
    ...strings,
  ];
}

function compareCandidate(left, right) {
  const numeric = lexicographicNumbers(left.key, right.key);
  if (numeric !== 0) return numeric;
  const voicingOrder = left.voicing.voicingCandidateId.localeCompare(right.voicing.voicingCandidateId);
  if (voicingOrder !== 0) return voicingOrder;
  return left.shape.shapeCandidateId.localeCompare(right.shape.shapeCandidateId);
}

function choosePlayableShape(leftHand, physical) {
  if (leftHand.groups.length !== 1 || physical.groups.length !== 1) return null;
  const leftGroup = leftHand.groups[0];
  const physicalGroup = physical.groups[0];
  if (leftGroup.sourceGroupId !== physicalGroup.sourceGroupId) {
    throw invalid('PA-8/PA-9 group provenance diverged during blind baseline selection.');
  }

  const physicalByVoicingId = new Map(
    physicalGroup.voicingCandidates.map((entry) => [entry.voicingCandidateId, entry]),
  );
  const candidates = [];

  for (const voicing of leftGroup.voicingCandidates) {
    const physicalVoicing = physicalByVoicingId.get(voicing.voicingCandidateId);
    if (!physicalVoicing) {
      throw invalid('PA-9 omitted a PA-8 voicing candidate during blind baseline selection.', {
        voicingCandidateId: voicing.voicingCandidateId,
      });
    }
    const verdictByShapeId = new Map(
      physicalVoicing.shapeVerdicts.map((entry) => [entry.shapeCandidateId, entry]),
    );
    for (const shape of voicing.shapeCandidates) {
      const verdict = verdictByShapeId.get(shape.shapeCandidateId);
      if (!verdict) {
        throw invalid('PA-9 omitted a PA-8 shape verdict during blind baseline selection.', {
          voicingCandidateId: voicing.voicingCandidateId,
          shapeCandidateId: shape.shapeCandidateId,
        });
      }
      if (verdict.status !== 'PLAYABLE_WITHIN_POLICY' || verdict.reasonCodes.length !== 0) continue;
      candidates.push({
        voicing,
        shape,
        verdict,
        key: ergonomicKey(voicing, shape, verdict),
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort(compareCandidate);
  return candidates[0];
}

function buildSourceMidiIndex(notes) {
  return new Map(notes.map((event) => [event.sourceEventId, event.pitch.midi]));
}

function sourceOutcomesFromReduction(reduction, sourceMidiById) {
  return reduction.instructions.map((instruction) => {
    const sourceMidi = sourceMidiById.get(instruction.sourceEventId);
    if (!Number.isInteger(sourceMidi)) {
      throw invalid('Reduction instruction lost source MIDI provenance.', {
        sourceEventId: instruction.sourceEventId,
      });
    }
    if (instruction.disposition === 'OMIT') {
      return Object.freeze({
        sourceEventId: instruction.sourceEventId,
        sourceMidi,
        disposition: 'OMITTED',
        targetMidis: Object.freeze([]),
      });
    }
    if (instruction.disposition !== 'KEEP' || !Number.isInteger(instruction.targetMidi)) {
      throw invalid('Blind baseline received an unsupported PA-6 instruction.', {
        sourceEventId: instruction.sourceEventId,
        disposition: instruction.disposition,
      });
    }
    return Object.freeze({
      sourceEventId: instruction.sourceEventId,
      sourceMidi,
      disposition: 'RETAINED',
      targetMidis: Object.freeze([instruction.targetMidi]),
    });
  });
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function createBlindBaselineEngineResult(sourceModel) {
  const source = validatePolyphonicSourceModel(sourceModel);
  const notes = collectNotes(source);
  if (notes.length > 6) return null;

  const decisions = createBlindBaselineArrangementDecisions(source);
  const reduction = createDeterministicReductionPlan(source, decisions);
  const sourceMidiById = buildSourceMidiIndex(notes);
  const sourceOutcomes = sourceOutcomesFromReduction(reduction, sourceMidiById);
  const retained = reduction.instructions.filter((instruction) => instruction.disposition === 'KEEP');

  if (retained.length === 0 || retained.length > 6) return null;

  if (retained.length === 1) {
    const instruction = retained[0];
    const position = chooseSingletonPosition(instruction.targetMidi);
    if (!position) return null;
    return deepFreeze({
      sourceOutcomes,
      selectedTones: [{
        sourceEventId: instruction.sourceEventId,
        targetMidi: instruction.targetMidi,
        string: position.string,
        fret: position.fret,
        finger: position.fret === 0 ? 0 : null,
      }],
      barres: [],
    });
  }

  const handoff = createDeterministicPa7CandidateSnapshotHandoff(source, decisions);
  const selected = choosePlayableShape(
    handoff.leftHandShapeSnapshot,
    handoff.physicalPlayabilitySnapshot,
  );
  if (!selected) return null;

  return deepFreeze({
    sourceOutcomes,
    selectedTones: selected.shape.fingerAssignments.map((assignment) => ({
      sourceEventId: assignment.sourceEventId,
      targetMidi: assignment.targetMidi,
      string: assignment.string,
      fret: assignment.fret,
      finger: assignment.finger,
    })),
    barres: selected.shape.barres.map((barre) => ({ ...barre })),
  });
}

module.exports = {
  BLIND_BASELINE_ENGINE_OBSERVER_VERSION,
  BLIND_BASELINE_POLICY,
  BlindBaselineEngineObserverError,
  createBlindBaselineArrangementDecisions,
  createBlindBaselineEngineResult,
};