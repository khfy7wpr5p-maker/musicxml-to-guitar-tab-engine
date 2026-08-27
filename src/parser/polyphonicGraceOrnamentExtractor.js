'use strict';

const { EngineError } = require('../errors/engineError');
const { PitchError, pitchToMidi } = require('../music/pitch');
const {
  normalizePolyphonicTripletDisplay,
} = require('./polyphonicTripletDisplayNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION = '1.0.0';
const POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_AUTHORITY =
  'ORDER_ONLY_GRACE_MUSICAL_MATERIAL_PRESERVATION';
const POLYPHONIC_GRACE_TIMING_POLICY =
  'NO_NUMERIC_DURATION_WITHOUT_MUSICXML_STEAL_OR_MAKE_TIME';
const POLYPHONIC_GRACE_SOLVER_STATUS = Object.freeze({
  MAIN_SOURCE_COMPLETE: 'MAIN_SOURCE_COMPLETE',
  BLOCKED_PENDING_PHYSICAL_INTEGRATION: 'BLOCKED_PENDING_GRACE_PHYSICAL_INTEGRATION',
});
const MAX_GRACE_GROUPS = 128;
const MAX_GRACE_EVENTS = 256;
const MAX_SCALAR_LENGTH = 64;

class PolyphonicGraceOrnamentExtractorError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_GRACE_ORNAMENT', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicGraceOrnamentExtractorError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicGraceOrnamentExtractorError(
    message,
    'INVALID_POLYPHONIC_GRACE_ORNAMENT',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicGraceOrnamentExtractorError(
    message,
    'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
    details,
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime !== null && runtime !== undefined) {
    if (typeof runtime !== 'object' || typeof runtime.checkpoint !== 'function') {
      throw invalid('runtime must expose a ProcessingRuntime checkpoint function.', { field: 'runtime' });
    }
    runtime.checkpoint(phase, details);
  }
}

function cloneAttributes(attributes) {
  return attributes.map((attribute) => ({ ...attribute }));
}

function cloneNode(node, childMapper = null) {
  const children = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const mapped = childMapper ? childMapper(child, index) : cloneNode(child);
    if (mapped !== null) children.push(mapped);
  }
  return {
    name: node.name,
    uri: node.uri,
    attributes: cloneAttributes(node.attributes),
    text: node.text,
    children,
  };
}

function deepFreezeNode(node) {
  for (const attribute of node.attributes) Object.freeze(attribute);
  Object.freeze(node.attributes);
  for (const child of node.children) deepFreezeNode(child);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function unqualifiedAttribute(node, name) {
  return node.attributes.find((attribute) => attribute.uri.length === 0 && attribute.name === name);
}

function requireExactLeaf(node, field, location, { text = null, attributes = null } = {}) {
  if (node.children.length !== 0 || node.attributes.some((attribute) => attribute.uri.length !== 0)) {
    throw unsupported(`${field} must be a bounded leaf element.`, { ...location, field });
  }

  const attributeNames = node.attributes.map((attribute) => attribute.name);
  if (new Set(attributeNames).size !== attributeNames.length) {
    throw unsupported(`${field} must not contain duplicate attributes.`, { ...location, field });
  }

  if (attributes === null) {
    if (node.attributes.length !== 0) {
      throw unsupported(`${field} must not contain attributes.`, {
        ...location,
        field,
        observedAttributes: Object.fromEntries(
          node.attributes.map((attribute) => [attribute.name, attribute.value]),
        ),
      });
    }
  } else {
    const actual = Object.fromEntries(node.attributes.map((attribute) => [attribute.name, attribute.value]));
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(attributes).sort();
    if (
      actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])
      || expectedKeys.some((key) => actual[key] !== attributes[key])
    ) {
      throw unsupported(`${field} has unsupported attributes.`, {
        ...location,
        field,
        observedAttributes: actual,
      });
    }
  }

  if (text !== null && node.text.trim() !== text) {
    throw unsupported(`${field} has an unsupported value.`, {
      ...location,
      field,
      observed: node.text.trim(),
      expected: text,
    });
  }
  return node.text.trim();
}

function requireSingleChild(note, name, location) {
  const matches = directChildren(note, name);
  if (matches.length !== 1) {
    throw unsupported(`Grace note must contain exactly one ${name} element.`, {
      ...location,
      field: name,
      observedCount: matches.length,
    });
  }
  return matches[0];
}

function parseScalar(note, name, location) {
  const node = requireSingleChild(note, name, location);
  requireExactLeaf(node, name, location);
  const value = node.text.trim();
  if (value.length === 0 || value.length > MAX_SCALAR_LENGTH) {
    throw unsupported(`${name} must be a bounded non-empty scalar.`, { ...location, field: name });
  }
  return value;
}

function writtenPitch(step, alter, octave) {
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
  return `${step}${accidental}${octave}`;
}

function parsePitch(note, location) {
  const pitch = requireSingleChild(note, 'pitch', location);
  if (pitch.text.trim().length !== 0 || pitch.attributes.length !== 0) {
    throw unsupported('Grace pitch must use the bounded pitch child form.', location);
  }
  const allowed = new Set(['step', 'alter', 'octave']);
  for (const child of pitch.children) {
    if (child.uri !== pitch.uri || !allowed.has(child.name)) {
      throw unsupported('Grace pitch contains unsupported children.', {
        ...location,
        feature: child.name,
      });
    }
  }
  const stepNode = directChildren(pitch, 'step');
  const alterNode = directChildren(pitch, 'alter');
  const octaveNode = directChildren(pitch, 'octave');
  if (stepNode.length !== 1 || alterNode.length > 1 || octaveNode.length !== 1) {
    throw unsupported('Grace pitch must contain one step, optional alter, and one octave.', location);
  }
  requireExactLeaf(stepNode[0], 'pitch.step', location);
  if (alterNode[0]) requireExactLeaf(alterNode[0], 'pitch.alter', location);
  requireExactLeaf(octaveNode[0], 'pitch.octave', location);
  const step = stepNode[0].text.trim().toUpperCase();
  const alter = alterNode.length === 0 ? 0 : Number.parseInt(alterNode[0].text.trim(), 10);
  const octave = Number.parseInt(octaveNode[0].text.trim(), 10);
  if (!Number.isSafeInteger(alter) || !Number.isSafeInteger(octave)) {
    throw unsupported('Grace pitch alter/octave must be safe integers.', location);
  }
  let midi;
  try {
    midi = pitchToMidi({ step, alter, octave });
  } catch (error) {
    if (error instanceof PitchError) {
      throw unsupported('Grace pitch is outside the supported pitch boundary.', {
        ...location,
        pitchError: error.message,
      });
    }
    throw error;
  }
  return Object.freeze({
    step,
    alter,
    octave,
    midi,
    written: writtenPitch(step, alter, octave),
  });
}

function isGraceNote(note) {
  return directChildren(note, 'grace').length > 0;
}

function parseOptionalStem(note, location) {
  const stems = directChildren(note, 'stem');
  if (stems.length > 1) {
    throw unsupported('Grace note may contain at most one stem element.', {
      ...location,
      field: 'stem',
      observedCount: stems.length,
    });
  }
  if (stems.length === 0) return null;
  requireExactLeaf(stems[0], 'stem', location);
  const value = stems[0].text.trim();
  if (value !== 'up' && value !== 'down') {
    throw unsupported('Grace stem has an unsupported value.', {
      ...location,
      field: 'stem',
      observed: value,
    });
  }
  return value;
}

function parseBeam(note, location, expectedBeamText) {
  const beams = directChildren(note, 'beam');
  if (expectedBeamText === null) {
    if (beams.length !== 0) {
      throw unsupported('Standalone grace note must not carry a beam chain.', {
        ...location,
        observedBeamCount: beams.length,
      });
    }
    return null;
  }
  if (beams.length !== 1) {
    throw unsupported('Paired grace note must contain exactly one beam element.', {
      ...location,
      observedBeamCount: beams.length,
    });
  }
  requireExactLeaf(beams[0], 'beam', location, {
    text: expectedBeamText,
    attributes: { number: '1' },
  });
  return expectedBeamText;
}

function parseGraceNote(note, location, expectedBeamText) {
  if (note.text.trim().length !== 0 || note.attributes.length !== 0) {
    throw unsupported('Extracted grace notes must have no note-level attributes or text.', location);
  }
  if (directChildren(note, 'duration').length !== 0) {
    throw unsupported('Grace note must not contain or be assigned a numeric duration.', location);
  }
  if (directChildren(note, 'rest').length !== 0) {
    throw unsupported('Grace rests are outside the PS-6B6A extraction scope.', location);
  }
  if (directChildren(note, 'chord').length !== 0) {
    throw unsupported('Grace chord members are outside the PS-6B6A extraction scope.', location);
  }

  const allowedChildren = new Set(['grace', 'pitch', 'voice', 'type', 'stem', 'staff', 'beam']);
  for (const child of note.children) {
    if (child.uri !== note.uri || !allowedChildren.has(child.name)) {
      throw unsupported('Grace note contains unsupported musical semantics.', {
        ...location,
        feature: child.name,
      });
    }
  }

  const grace = requireSingleChild(note, 'grace', location);
  requireExactLeaf(grace, 'grace', location, { attributes: { slash: 'yes' }, text: '' });
  const pitch = parsePitch(note, location);
  const voice = parseScalar(note, 'voice', location);
  const staffText = parseScalar(note, 'staff', location);
  const staff = Number.parseInt(staffText, 10);
  if (!Number.isSafeInteger(staff) || staff < 1 || staff > 2 || String(staff) !== staffText) {
    throw unsupported('Grace staff must be 1 or 2.', { ...location, staff: staffText });
  }
  const type = requireSingleChild(note, 'type', location);
  requireExactLeaf(type, 'type', location, { text: 'eighth', attributes: {} });
  const stem = parseOptionalStem(note, location);
  const beam = parseBeam(note, location, expectedBeamText);

  return Object.freeze({
    pitch,
    voice,
    staff,
    nominalType: 'eighth',
    slash: 'yes',
    stem,
    beam,
  });
}

function parseAnchorLane(note, location) {
  if (isGraceNote(note) || directChildren(note, 'chord').length !== 0) {
    throw unsupported('Grace sequence must anchor to a non-grace, non-chord note.', location);
  }
  if (directChildren(note, 'rest').length !== 0 || directChildren(note, 'pitch').length !== 1) {
    throw unsupported('Grace sequence must anchor to one pitched normal note.', location);
  }
  const voice = parseScalar(note, 'voice', location);
  const staffText = parseScalar(note, 'staff', location);
  const staff = Number.parseInt(staffText, 10);
  if (!Number.isSafeInteger(staff) || staff < 1 || staff > 2 || String(staff) !== staffText) {
    throw unsupported('Grace anchor staff must be 1 or 2.', { ...location, staff: staffText });
  }
  return Object.freeze({ voice, staff });
}

function freezeGraceEvent(event) {
  Object.freeze(event.pitch);
  Object.freeze(event.source);
  return Object.freeze(event);
}

function freezeGraceGroup(group) {
  for (const note of group.notes) freezeGraceEvent(note);
  Object.freeze(group.notes);
  Object.freeze(group.anchor);
  return Object.freeze(group);
}

function analyzeMeasure(measure, context, partId, counters, runtime) {
  const noteChildren = measure.children.filter(
    (child) => child.uri === measure.uri && child.name === 'note',
  );
  const removedSourceOrders = new Set();
  const groups = [];
  let removedBefore = 0;

  for (let sourceOrder = 0; sourceOrder < noteChildren.length; sourceOrder += 1) {
    checkpoint(runtime, 'polyphonic-grace-ornament-extractor:note', {
      ...context,
      sourceOrder,
    });
    if (!isGraceNote(noteChildren[sourceOrder])) continue;

    const startOrder = sourceOrder;
    const run = [];
    while (sourceOrder < noteChildren.length && isGraceNote(noteChildren[sourceOrder])) {
      run.push({ note: noteChildren[sourceOrder], sourceOrder });
      sourceOrder += 1;
    }
    sourceOrder -= 1;

    if (run.length < 1 || run.length > 2) {
      throw unsupported('This stage supports one or two consecutive slashed eighth grace notes per group.', {
        ...context,
        startSourceOrder: startOrder,
        observedGraceCount: run.length,
      });
    }

    counters.graceGroups += 1;
    counters.graceEvents += run.length;
    if (counters.graceGroups > MAX_GRACE_GROUPS || counters.graceEvents > MAX_GRACE_EVENTS) {
      throw unsupported('Grace ornament extraction exceeds the fixed resource boundary.', {
        maximumGraceGroups: MAX_GRACE_GROUPS,
        maximumGraceEvents: MAX_GRACE_EVENTS,
      });
    }

    const beamExpectations = run.length === 1 ? [null] : ['begin', 'end'];
    const parsedRun = run.map((entry, index) => {
      checkpoint(runtime, 'polyphonic-grace-ornament-extractor:grace-event', {
        ...context,
        sourceOrder: entry.sourceOrder,
        graceIndex: index,
      });
      return parseGraceNote(
        entry.note,
        { ...context, sourceOrder: entry.sourceOrder },
        beamExpectations[index],
      );
    });

    const first = parsedRun[0];
    for (let index = 1; index < parsedRun.length; index += 1) {
      if (parsedRun[index].voice !== first.voice || parsedRun[index].staff !== first.staff) {
        throw invalid('Grace sequence notes must remain in one voice/staff lane.', {
          ...context,
          startSourceOrder: startOrder,
        });
      }
    }

    const anchorOriginalSourceOrder = run[run.length - 1].sourceOrder + 1;
    const anchorNote = noteChildren[anchorOriginalSourceOrder];
    if (!anchorNote) {
      throw invalid('Grace sequence must be followed by an anchor note in the same measure.', {
        ...context,
        startSourceOrder: startOrder,
      });
    }
    const anchorLane = parseAnchorLane(anchorNote, {
      ...context,
      sourceOrder: anchorOriginalSourceOrder,
    });
    if (anchorLane.voice !== first.voice || anchorLane.staff !== first.staff) {
      throw invalid('Grace sequence anchor must match the grace voice/staff lane.', {
        ...context,
        startSourceOrder: startOrder,
        graceVoice: first.voice,
        graceStaff: first.staff,
        anchorVoice: anchorLane.voice,
        anchorStaff: anchorLane.staff,
      });
    }

    const projectedAnchorSourceOrder = anchorOriginalSourceOrder - removedBefore - run.length;
    const graceGroupIndex = groups.length;
    const graceGroupId = `${partId}:measure:${context.measureIndex}:grace-group:${graceGroupIndex}`;
    const notes = run.map((entry, index) => {
      const parsed = parsedRun[index];
      removedSourceOrders.add(entry.sourceOrder);
      return freezeGraceEvent({
        graceEventId: `${partId}:measure:${context.measureIndex}:grace:${entry.sourceOrder}`,
        orderIndex: index,
        originalSourceOrder: entry.sourceOrder,
        pitch: parsed.pitch,
        voice: parsed.voice,
        staff: parsed.staff,
        nominalType: parsed.nominalType,
        slash: parsed.slash,
        stem: parsed.stem,
        beam: parsed.beam,
        source: {
          partId,
          measureIndex: context.measureIndex,
          measureNumber: context.measureNumber,
          sourceOrder: entry.sourceOrder,
        },
      });
    });
    removedBefore += run.length;
    groups.push(freezeGraceGroup({
      graceGroupId,
      kind: run.length === 1
        ? 'slashed-single-eighth-grace'
        : 'slashed-two-note-eighth-grace-sequence',
      timingAuthority: 'ORDER_ONLY_BEFORE_ANCHOR',
      measureIndex: context.measureIndex,
      measureNumber: context.measureNumber,
      voice: first.voice,
      staff: first.staff,
      notes,
      anchor: {
        originalSourceOrder: anchorOriginalSourceOrder,
        projectedSourceOrder: projectedAnchorSourceOrder,
        projectedSourceEventId: `${partId}:measure:${context.measureIndex}:note:${projectedAnchorSourceOrder}`,
      },
    }));
  }

  return Object.freeze({
    removedSourceOrders,
    groups: Object.freeze(groups),
    originalNoteElementCount: noteChildren.length,
  });
}

function sanitizePart(part, partId, allGroups, accounting, counters, runtime) {
  let measureIndex = 0;
  return cloneNode(part, (measure) => {
    if (measure.uri !== part.uri || measure.name !== 'measure') return cloneNode(measure);
    const currentMeasureIndex = measureIndex;
    measureIndex += 1;
    const measureNumber = unqualifiedAttribute(measure, 'number')?.value
      ?? String(currentMeasureIndex + 1);
    checkpoint(runtime, 'polyphonic-grace-ornament-extractor:measure', {
      measureIndex: currentMeasureIndex,
      measureNumber,
    });
    const analysis = analyzeMeasure(
      measure,
      { measureIndex: currentMeasureIndex, measureNumber },
      partId,
      counters,
      runtime,
    );
    accounting.originalNoteElementCount += analysis.originalNoteElementCount;
    allGroups.push(...analysis.groups);

    let sourceOrder = 0;
    return cloneNode(measure, (measureChild) => {
      if (measureChild.uri !== measure.uri || measureChild.name !== 'note') {
        return cloneNode(measureChild);
      }
      const currentSourceOrder = sourceOrder;
      sourceOrder += 1;
      return analysis.removedSourceOrders.has(currentSourceOrder) ? null : cloneNode(measureChild);
    });
  });
}

function extractPolyphonicGraceOrnaments(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-grace-ornament-extractor:start');
  const upstream = normalizePolyphonicTripletDisplay(parsedDocument, runtime);
  const root = upstream.parsedDocument.root;
  const parts = root.children.filter((child) => child.uri === root.uri && child.name === 'part');
  if (parts.length !== 1) {
    throw unsupported('Grace ornament extraction requires exactly one MusicXML part.', {
      observedPartCount: parts.length,
    });
  }
  const partId = unqualifiedAttribute(parts[0], 'id')?.value;
  if (typeof partId !== 'string' || partId.length === 0 || partId.length > 256) {
    throw invalid('MusicXML part id is required for deterministic grace provenance.', { field: 'part.id' });
  }

  const groups = [];
  const accounting = { originalNoteElementCount: 0 };
  const counters = { graceGroups: 0, graceEvents: 0 };
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, partId, groups, accounting, counters, runtime);
    }
    return cloneNode(rootChild);
  });
  const frozenGroups = Object.freeze(groups);
  const extractedFeatures = Object.freeze(
    frozenGroups.length === 0 ? [] : ['grace-note:order-only-ornament'],
  );
  const parsedMainDocument = Object.freeze({
    documentType: upstream.parsedDocument.documentType,
    contractVersion: upstream.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-grace-ornament-extractor:complete', {
    graceGroupCount: frozenGroups.length,
    graceEventCount: counters.graceEvents,
  });

  return Object.freeze({
    contractVersion: POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION,
    authority: POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_AUTHORITY,
    timingPolicy: POLYPHONIC_GRACE_TIMING_POLICY,
    solverCompatibility: frozenGroups.length === 0
      ? POLYPHONIC_GRACE_SOLVER_STATUS.MAIN_SOURCE_COMPLETE
      : POLYPHONIC_GRACE_SOLVER_STATUS.BLOCKED_PENDING_PHYSICAL_INTEGRATION,
    parsedMainDocument,
    graceOrnamentGroups: frozenGroups,
    extractedGraceEventCount: counters.graceEvents,
    originalNoteElementCount: accounting.originalNoteElementCount,
    extractedFeatures,
    ignoredFeatures: upstream.ignoredFeatures,
    performanceTimingCaveats: upstream.performanceTimingCaveats,
    ignoredDirectionCount: upstream.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: upstream.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: upstream.octaveShiftMarkers,
    notationContextMarkers: upstream.notationContextMarkers,
    timeSignatureDisplayMarkers: upstream.timeSignatureDisplayMarkers,
    fermataMarkers: upstream.fermataMarkers,
    staccatoMarkers: upstream.staccatoMarkers,
    tripletTimeModificationMarkers: upstream.tripletTimeModificationMarkers,
    tripletDisplayMarkers: upstream.tripletDisplayMarkers,
  });
}

function projectParsedMusicXmlWithGraceOrnamentExtraction(parsedDocument, runtime = null) {
  const extraction = extractPolyphonicGraceOrnaments(parsedDocument, runtime);
  const mainSourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    extraction.parsedMainDocument,
    runtime,
  );
  const reconciledNoteElementCount = mainSourceModel.eventCount + extraction.extractedGraceEventCount;
  if (reconciledNoteElementCount !== extraction.originalNoteElementCount) {
    throw invalid('Grace extraction failed musical-material accounting reconciliation.', {
      originalNoteElementCount: extraction.originalNoteElementCount,
      mainProjectedEventCount: mainSourceModel.eventCount,
      extractedGraceEventCount: extraction.extractedGraceEventCount,
      reconciledNoteElementCount,
    });
  }
  const musicalMaterialAccounting = Object.freeze({
    originalNoteElementCount: extraction.originalNoteElementCount,
    mainProjectedEventCount: mainSourceModel.eventCount,
    extractedGraceEventCount: extraction.extractedGraceEventCount,
    reconciledNoteElementCount,
    reconciled: true,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION,
    authority: POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_AUTHORITY,
    timingPolicy: POLYPHONIC_GRACE_TIMING_POLICY,
    solverCompatibility: extraction.solverCompatibility,
    mainSourceModel,
    graceOrnamentGroups: extraction.graceOrnamentGroups,
    extractedFeatures: extraction.extractedFeatures,
    musicalMaterialAccounting,
    ignoredFeatures: extraction.ignoredFeatures,
    performanceTimingCaveats: extraction.performanceTimingCaveats,
    ignoredDirectionCount: extraction.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: extraction.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: extraction.octaveShiftMarkers,
    notationContextMarkers: extraction.notationContextMarkers,
    timeSignatureDisplayMarkers: extraction.timeSignatureDisplayMarkers,
    fermataMarkers: extraction.fermataMarkers,
    staccatoMarkers: extraction.staccatoMarkers,
    tripletTimeModificationMarkers: extraction.tripletTimeModificationMarkers,
    tripletDisplayMarkers: extraction.tripletDisplayMarkers,
  });
}

module.exports = {
  POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_VERSION,
  POLYPHONIC_GRACE_ORNAMENT_EXTRACTOR_AUTHORITY,
  POLYPHONIC_GRACE_TIMING_POLICY,
  POLYPHONIC_GRACE_SOLVER_STATUS,
  PolyphonicGraceOrnamentExtractorError,
  extractPolyphonicGraceOrnaments,
  projectParsedMusicXmlWithGraceOrnamentExtraction,
};
