'use strict';

const RETAINED_NOTE_CAPS = Object.freeze([6, 5, 4, 3, 2, 1]);

const REASON = Object.freeze({
  MELODY: 'MELODY_ANCHOR_RETAINED',
  BASS: 'BASS_ANCHOR_RETAINED',
  INNER: 'INNER_VOICE_RETAINED',
  TEACHER: 'TEACHER_ASSIGNMENT_RETAINED',
  CAPACITY: 'GUITAR_CAPACITY_REDUCTION',
  DUPLICATE: 'DUPLICATE_TARGET_PITCH_REDUCTION',
});

function checkpoint(processing, phase, details = {}) {
  if (processing) processing.checkpoint(phase, details);
}

function indexKeepInstructions(instructions) {
  if (!Array.isArray(instructions)) {
    throw new TypeError('reduction.instructions must be an array.');
  }
  const instructionById = new Map();
  for (const instruction of instructions) {
    if (!instruction || typeof instruction.sourceEventId !== 'string') {
      throw new TypeError('Every reduction instruction must identify a source event.');
    }
    if (instruction.disposition !== 'KEEP') continue;
    if (!Number.isSafeInteger(instruction.targetMidi)) {
      throw new TypeError('Every KEEP instruction must contain an integer targetMidi.');
    }
    instructionById.set(instruction.sourceEventId, instruction);
  }
  return instructionById;
}

function groupSourceNotesByOnset(sourceModel, instructionById) {
  if (!sourceModel || !Array.isArray(sourceModel.measures)) {
    throw new TypeError('sourceModel.measures must be an array.');
  }
  const groups = [];
  const sourceOrder = [];
  for (const measure of sourceModel.measures) {
    const byOnset = new Map();
    for (const event of measure.events || []) {
      if (event?.type !== 'note') continue;
      const instruction = instructionById.get(event.sourceEventId);
      if (!instruction) continue;
      sourceOrder.push(event.sourceEventId);
      const entries = byOnset.get(event.onsetDivisions) || [];
      entries.push({ event, instruction });
      byOnset.set(event.onsetDivisions, entries);
    }
    for (const [onsetDivisions, entries] of byOnset) {
      groups.push({ measureIndex: measure.index, onsetDivisions, entries });
    }
  }
  if (sourceOrder.length !== instructionById.size) {
    throw new TypeError('Reduction instructions must map to exact source notes.');
  }
  return { groups, sourceOrder };
}

function forcedTieClosure(forcedSourceEventIds, tieGraph, instructionById) {
  const forced = new Set(forcedSourceEventIds);
  for (const chain of tieGraph?.chains || []) {
    if (!chain.segments.some((segment) => forced.has(segment.sourceEventId))) continue;
    for (const segment of chain.segments) {
      if (instructionById.has(segment.sourceEventId)) forced.add(segment.sourceEventId);
    }
  }
  return forced;
}

function compareEntries(left, right) {
  return right.instruction.targetMidi - left.instruction.targetMidi
    || left.event.sourceOrder - right.event.sourceOrder
    || left.event.sourceEventId.localeCompare(right.event.sourceEventId);
}

function uniqueRepresentatives(entries, forced, reservedTies, excluded, reasons) {
  const representatives = [];
  const seenTargetMidis = new Set();
  const eligible = [];
  for (const entry of entries) {
    const sourceEventId = entry.event.sourceEventId;
    if (excluded.has(sourceEventId)) {
      reasons.set(sourceEventId, REASON.CAPACITY);
      continue;
    }
    if (forced.has(sourceEventId)) continue;
    eligible.push(entry);
  }
  const tieFirst = [
    ...eligible.filter((entry) => reservedTies.has(entry.event.sourceEventId)),
    ...eligible.filter((entry) => !reservedTies.has(entry.event.sourceEventId)),
  ];
  for (const entry of tieFirst) {
    const sourceEventId = entry.event.sourceEventId;
    const targetMidi = entry.instruction.targetMidi;
    if (seenTargetMidis.has(targetMidi)) {
      reasons.set(sourceEventId, REASON.DUPLICATE);
      continue;
    }
    seenTargetMidis.add(targetMidi);
    representatives.push(entry);
  }
  return representatives.sort(compareEntries);
}

function reserveOrdinaryTieUnits({
  onsetGroups,
  tieGraph,
  retainedNoteCap,
  forcedSourceEventIds,
  preExcludedSourceEventIds,
}) {
  const entryById = new Map();
  const reservedTargetMidisByGroup = new Map();
  for (const group of onsetGroups) {
    const reservedTargets = new Set();
    reservedTargetMidisByGroup.set(group, reservedTargets);
    for (const entry of group.entries) {
      const sourceEventId = entry.event.sourceEventId;
      entryById.set(sourceEventId, { entry, group });
      if (forcedSourceEventIds.has(sourceEventId)) {
        reservedTargets.add(entry.instruction.targetMidi);
      }
    }
  }

  const units = [];
  for (const chain of tieGraph?.chains || []) {
    const refs = chain.segments
      .map((segment) => entryById.get(segment.sourceEventId))
      .filter(Boolean);
    if (refs.length === 0) continue;
    if (refs.some(({ entry }) => forcedSourceEventIds.has(entry.event.sourceEventId))) continue;
    refs.sort((left, right) => (
      left.group.measureIndex - right.group.measureIndex
      || left.group.onsetDivisions - right.group.onsetDivisions
      || left.entry.event.sourceOrder - right.entry.event.sourceOrder
      || left.entry.event.sourceEventId.localeCompare(right.entry.event.sourceEventId)
    ));
    units.push({ chainId: chain.chainId || '', refs });
  }
  units.sort((left, right) => {
    const leftFirst = left.refs[0];
    const rightFirst = right.refs[0];
    return leftFirst.group.measureIndex - rightFirst.group.measureIndex
      || leftFirst.group.onsetDivisions - rightFirst.group.onsetDivisions
      || leftFirst.entry.event.sourceOrder - rightFirst.entry.event.sourceOrder
      || left.chainId.localeCompare(right.chainId);
  });

  const reserved = new Set();
  const excluded = new Set(preExcludedSourceEventIds);
  for (const unit of units) {
    const ids = unit.refs.map(({ entry }) => entry.event.sourceEventId);
    if (ids.some((sourceEventId) => excluded.has(sourceEventId))) {
      for (const sourceEventId of ids) excluded.add(sourceEventId);
      continue;
    }
    const proposedTargetsByGroup = new Map();
    let fits = true;
    for (const { entry, group } of unit.refs) {
      const targets = proposedTargetsByGroup.get(group)
        || new Set(reservedTargetMidisByGroup.get(group));
      proposedTargetsByGroup.set(group, targets);
      const targetMidi = entry.instruction.targetMidi;
      if (targets.has(targetMidi) || targets.size >= retainedNoteCap) {
        fits = false;
        break;
      }
      targets.add(targetMidi);
    }
    if (!fits) {
      for (const sourceEventId of ids) excluded.add(sourceEventId);
      continue;
    }
    for (const [group, targets] of proposedTargetsByGroup) {
      reservedTargetMidisByGroup.set(group, targets);
    }
    for (const sourceEventId of ids) reserved.add(sourceEventId);
  }
  return { reserved, excluded };
}

function outerToInner(entries, retainedNoteCap) {
  if (entries.length === 0) return [];
  if (retainedNoteCap === 1) return [entries[0]];
  const ordered = [entries[0]];
  if (entries.length > 1) ordered.push(entries[entries.length - 1]);
  let highIndex = 1;
  let lowIndex = entries.length - 2;
  while (highIndex <= lowIndex) {
    ordered.push(entries[highIndex]);
    highIndex += 1;
    if (highIndex <= lowIndex) {
      ordered.push(entries[lowIndex]);
      lowIndex -= 1;
    }
  }
  return ordered;
}

function selectRankedOnsetGroups({
  onsetGroups,
  retainedNoteCap,
  forcedSourceEventIds,
  reservedTieSourceEventIds,
  excludedSourceEventIds,
}, processing) {
  const selected = new Set();
  const reasons = new Map();

  for (const group of onsetGroups) {
    checkpoint(processing, 'melody-bass-policy:select-group', {
      measureIndex: group.measureIndex,
      onsetDivisions: group.onsetDivisions,
      sourceNoteCount: group.entries.length,
      retainedNoteCap,
    });
    const entries = [...group.entries].sort(compareEntries);
    const selectedTargetMidis = new Set();
    for (const entry of entries) {
      const sourceEventId = entry.event.sourceEventId;
      if (excludedSourceEventIds.has(sourceEventId)) {
        reasons.set(sourceEventId, REASON.CAPACITY);
        continue;
      }
      if (!forcedSourceEventIds.has(sourceEventId)) continue;
      selected.add(sourceEventId);
      selectedTargetMidis.add(entry.instruction.targetMidi);
      reasons.set(sourceEventId, REASON.TEACHER);
    }

    const representatives = uniqueRepresentatives(
      entries,
      forcedSourceEventIds,
      reservedTieSourceEventIds,
      excludedSourceEventIds,
      reasons,
    );
    const ranked = outerToInner(representatives, retainedNoteCap);
    const melodyId = representatives[0]?.event.sourceEventId || null;
    const bassId = retainedNoteCap > 1
      ? representatives[representatives.length - 1]?.event.sourceEventId || null
      : null;

    for (const entry of representatives) {
      const sourceEventId = entry.event.sourceEventId;
      if (!reservedTieSourceEventIds.has(sourceEventId)) continue;
      selected.add(sourceEventId);
      selectedTargetMidis.add(entry.instruction.targetMidi);
      reasons.set(
        sourceEventId,
        sourceEventId === melodyId
          ? REASON.MELODY
          : sourceEventId === bassId
            ? REASON.BASS
            : REASON.INNER,
      );
    }

    for (const entry of ranked) {
      const sourceEventId = entry.event.sourceEventId;
      const targetMidi = entry.instruction.targetMidi;
      if (selected.has(sourceEventId)) continue;
      if (selectedTargetMidis.has(targetMidi)) {
        reasons.set(sourceEventId, REASON.DUPLICATE);
        continue;
      }
      if (selectedTargetMidis.size >= retainedNoteCap) {
        reasons.set(sourceEventId, REASON.CAPACITY);
        continue;
      }
      selected.add(sourceEventId);
      selectedTargetMidis.add(targetMidi);
      reasons.set(
        sourceEventId,
        sourceEventId === melodyId
          ? REASON.MELODY
          : sourceEventId === bassId
            ? REASON.BASS
            : REASON.INNER,
      );
    }

    for (const entry of representatives) {
      const sourceEventId = entry.event.sourceEventId;
      if (!reasons.has(sourceEventId)) reasons.set(sourceEventId, REASON.CAPACITY);
    }
  }
  return { selected, reasons };
}

function incompleteReservedTieSourceEventIds(selection, tieGraph, reservedTieSourceEventIds) {
  const excluded = new Set();
  for (const chain of tieGraph?.chains || []) {
    const ids = chain.segments.map((segment) => segment.sourceEventId)
      .filter((sourceEventId) => reservedTieSourceEventIds.has(sourceEventId));
    if (ids.length === 0) continue;
    const selectedCount = ids.filter(
      (sourceEventId) => selection.selected.has(sourceEventId),
    ).length;
    if (selectedCount > 0 && selectedCount < ids.length) {
      for (const sourceEventId of ids) excluded.add(sourceEventId);
    }
  }
  return excluded;
}

function enforceMonophonicCapOne(
  selection,
  onsetGroups,
  forcedSourceEventIds,
  reservedTieSourceEventIds,
) {
  let activeMeasureIndex = null;
  let activeEntries = [];
  const orderedGroups = [...onsetGroups].sort((left, right) => (
    left.measureIndex - right.measureIndex
    || left.onsetDivisions - right.onsetDivisions
  ));

  for (const group of orderedGroups) {
    if (group.measureIndex !== activeMeasureIndex) {
      activeMeasureIndex = group.measureIndex;
      activeEntries = [];
    }
    activeEntries = activeEntries.filter((entry) => (
      entry.endDivisions > group.onsetDivisions
      && selection.selected.has(entry.sourceEventId)
    ));
    const selectedHere = group.entries.filter(
      (entry) => selection.selected.has(entry.event.sourceEventId),
    );
    const forcedHere = selectedHere.filter(
      (entry) => forcedSourceEventIds.has(entry.event.sourceEventId),
    );
    const reservedTieHere = selectedHere.filter(
      (entry) => reservedTieSourceEventIds.has(entry.event.sourceEventId),
    );

    if (forcedHere.length > 0) {
      for (const active of activeEntries) {
        if (forcedSourceEventIds.has(active.sourceEventId)) continue;
        selection.selected.delete(active.sourceEventId);
        selection.reasons.set(active.sourceEventId, REASON.CAPACITY);
      }
      activeEntries = activeEntries.filter(
        (entry) => forcedSourceEventIds.has(entry.sourceEventId),
      );
    } else if (
      reservedTieHere.length > 0
      && !activeEntries.some((entry) => (
        forcedSourceEventIds.has(entry.sourceEventId)
        || reservedTieSourceEventIds.has(entry.sourceEventId)
      ))
    ) {
      for (const active of activeEntries) {
        selection.selected.delete(active.sourceEventId);
        selection.reasons.set(active.sourceEventId, REASON.CAPACITY);
      }
      activeEntries = [];
    } else if (activeEntries.length > 0) {
      for (const entry of selectedHere) {
        selection.selected.delete(entry.event.sourceEventId);
        selection.reasons.set(entry.event.sourceEventId, REASON.CAPACITY);
      }
      continue;
    }

    for (const entry of selectedHere) {
      if (!selection.selected.has(entry.event.sourceEventId)) continue;
      activeEntries.push({
        sourceEventId: entry.event.sourceEventId,
        endDivisions: group.onsetDivisions + entry.event.durationDivisions,
      });
    }
  }
}

function freezeSelection(selection, retainedNoteCap, sourceOrder) {
  const selectedSourceEventIds = sourceOrder.filter(
    (sourceEventId) => selection.selected.has(sourceEventId),
  );
  const reasonBySourceEventId = Object.create(null);
  for (const sourceEventId of sourceOrder) {
    const reason = selection.reasons.get(sourceEventId);
    if (!reason) throw new TypeError('Arrangement selection lost source-note provenance.');
    reasonBySourceEventId[sourceEventId] = reason;
  }
  return Object.freeze({
    retainedNoteCap,
    selectedSourceEventIds: Object.freeze(selectedSourceEventIds),
    reasonBySourceEventId: Object.freeze(reasonBySourceEventId),
  });
}

function createMelodyBassArrangementSelection({
  sourceModel,
  reduction,
  tieGraph = null,
  retainedNoteCap,
  forcedSourceEventIds = new Set(),
}, processing = null) {
  if (!RETAINED_NOTE_CAPS.includes(retainedNoteCap)) {
    throw new TypeError('retainedNoteCap must be an integer from 1 through 6.');
  }
  if (!(forcedSourceEventIds instanceof Set)) {
    throw new TypeError('forcedSourceEventIds must be a Set.');
  }
  const instructionById = indexKeepInstructions(reduction?.instructions);
  const onsetGroups = groupSourceNotesByOnset(sourceModel, instructionById);
  const forced = forcedTieClosure(forcedSourceEventIds, tieGraph, instructionById);
  const preExcluded = new Set();
  const maximumPasses = (tieGraph?.chains?.length || 0) + 1;
  let selection = null;
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    const tieUnits = reserveOrdinaryTieUnits({
      onsetGroups: onsetGroups.groups,
      tieGraph,
      retainedNoteCap,
      forcedSourceEventIds: forced,
      preExcludedSourceEventIds: preExcluded,
    });
    selection = selectRankedOnsetGroups({
      onsetGroups: onsetGroups.groups,
      retainedNoteCap,
      forcedSourceEventIds: forced,
      reservedTieSourceEventIds: tieUnits.reserved,
      excludedSourceEventIds: tieUnits.excluded,
    }, processing);
    if (retainedNoteCap === 1) {
      enforceMonophonicCapOne(selection, onsetGroups.groups, forced, tieUnits.reserved);
    }
    const incomplete = incompleteReservedTieSourceEventIds(
      selection,
      tieGraph,
      tieUnits.reserved,
    );
    let added = false;
    for (const sourceEventId of incomplete) {
      if (preExcluded.has(sourceEventId)) continue;
      preExcluded.add(sourceEventId);
      added = true;
    }
    if (!added) break;
  }
  return freezeSelection(selection, retainedNoteCap, onsetGroups.sourceOrder);
}

module.exports = {
  RETAINED_NOTE_CAPS,
  createMelodyBassArrangementSelection,
};
