'use strict';

const {
  admitSemanticReferenceBundle,
} = require('./semanticReferenceBundle');

function freezeDiagnostic(diagnostic) {
  return Object.freeze({ ...diagnostic });
}

function freezeResult(status, diagnostics, unverifiedContexts = []) {
  return Object.freeze({
    status,
    diagnostics: Object.freeze(diagnostics.map(freezeDiagnostic)),
    unverifiedContexts: Object.freeze([...unverifiedContexts].sort()),
  });
}

function unsupported(code, details = {}, unverifiedContexts = []) {
  return freezeResult('UNSUPPORTED', [{ code, ...details }], unverifiedContexts);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function supportedUnverifiedContexts(projection) {
  if (!isRecord(projection?.contextSupport)) return [];
  const contexts = [];
  if (projection.contextSupport.clefs === false) contexts.push('clefs');
  if (projection.contextSupport.keySignatures === false) contexts.push('keySignatures');
  return contexts;
}

function measureDurationDivisions(meter) {
  if (!isRecord(meter)
    || !Number.isSafeInteger(meter.divisions)
    || !Number.isSafeInteger(meter.beats)
    || !Number.isSafeInteger(meter.beatType)
    || meter.divisions <= 0
    || meter.beats <= 0
    || meter.beatType <= 0) {
    return null;
  }
  const numerator = meter.divisions * meter.beats * 4;
  if (!Number.isSafeInteger(numerator) || numerator % meter.beatType !== 0) {
    return null;
  }
  return numerator / meter.beatType;
}

function buildMeasureStarts(projection, expectedDivisions) {
  if (!Array.isArray(projection.meters)
    || projection.meters.length !== projection.measureCount) {
    return null;
  }

  const starts = [];
  let start = 0;
  for (let index = 0; index < projection.meters.length; index += 1) {
    const meter = projection.meters[index];
    if (meter.measureIndex !== index || meter.divisions !== expectedDivisions) {
      return null;
    }
    const duration = measureDurationDivisions(meter);
    if (duration === null || start > Number.MAX_SAFE_INTEGER - duration) {
      return null;
    }
    starts.push(start);
    start += duration;
  }
  return starts;
}

function guitarSlot(note, measureStarts) {
  if (!isRecord(note)
    || !Number.isSafeInteger(note.measureIndex)
    || note.measureIndex < 0
    || note.measureIndex >= measureStarts.length
    || !Number.isSafeInteger(note.onsetDivisions)
    || !Number.isSafeInteger(note.durationDivisions)
    || !Number.isSafeInteger(note.pitchMidi)
    || typeof note.voice !== 'string'
    || !Number.isSafeInteger(note.staff)
    || typeof note.tieStart !== 'boolean'
    || typeof note.tieStop !== 'boolean') {
    return null;
  }
  const measureStart = measureStarts[note.measureIndex];
  if (measureStart > Number.MAX_SAFE_INTEGER - note.onsetDivisions) return null;
  return {
    measureIndex: note.measureIndex,
    onsetDiv: measureStart + note.onsetDivisions,
    durationDiv: note.durationDivisions,
    voice: note.voice,
    staff: note.staff,
    pitchMidi: note.pitchMidi,
    tieStart: note.tieStart,
    tieStop: note.tieStop,
  };
}

function semanticSlot(note, measureCount) {
  if (!isRecord(note)
    || !Number.isSafeInteger(note.measure_index)
    || note.measure_index < 0
    || note.measure_index >= measureCount
    || !Number.isSafeInteger(note.onset_div)
    || !Number.isSafeInteger(note.duration_div)
    || !Number.isSafeInteger(note.pitch_midi)
    || !Number.isSafeInteger(note.voice)
    || !Number.isSafeInteger(note.staff)) {
    return null;
  }
  return {
    measureIndex: note.measure_index,
    onsetDiv: note.onset_div,
    durationDiv: note.duration_div,
    voice: String(note.voice),
    staff: note.staff,
    pitchMidi: note.pitch_midi,
    tieStart: note.tie_next !== null,
    tieStop: note.tie_prev !== null,
  };
}

function structuralKey(slot) {
  return [
    slot.measureIndex,
    slot.onsetDiv,
    slot.durationDiv,
    slot.voice,
    slot.staff,
    slot.tieStart ? 1 : 0,
    slot.tieStop ? 1 : 0,
  ].join(':');
}

function bucketByStructuralSlot(slots) {
  const buckets = new Map();
  for (const slot of slots) {
    const key = structuralKey(slot);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(slot);
    } else {
      buckets.set(key, [slot]);
    }
  }
  return buckets;
}

function effectiveTimeSignatureAt(snapshot, onsetDiv, partId) {
  if (!Array.isArray(snapshot.time_signatures)) return null;
  let effective = null;
  for (const context of snapshot.time_signatures) {
    if (!isRecord(context)
      || context.part_id !== partId
      || !Number.isSafeInteger(context.onset_div)
      || !Number.isSafeInteger(context.beats)
      || !Number.isSafeInteger(context.beat_type)) {
      return null;
    }
    if (context.onset_div <= onsetDiv
      && (effective === null || context.onset_div >= effective.onset_div)) {
      effective = context;
    }
  }
  return effective;
}

function diagnosticSort(left, right) {
  return (left.measureIndex ?? -1) - (right.measureIndex ?? -1)
    || (left.onsetDiv ?? -1) - (right.onsetDiv ?? -1)
    || String(left.voice ?? '').localeCompare(String(right.voice ?? ''))
    || (left.staff ?? -1) - (right.staff ?? -1)
    || left.code.localeCompare(right.code)
    || String(left.side ?? '').localeCompare(String(right.side ?? ''));
}

function compareGuitarSourceWithSemanticReference({
  guitarProjection,
  referenceBundle,
} = {}) {
  const admission = admitSemanticReferenceBundle(referenceBundle);
  const projection = guitarProjection?.projection;
  const unverifiedContexts = supportedUnverifiedContexts(projection);

  if (admission.status !== 'PASS') {
    return unsupported(
      'REFERENCE_NOT_ADMITTED',
      { cause: admission.diagnostics[0] ?? 'UNKNOWN' },
      unverifiedContexts,
    );
  }

  if (guitarProjection?.status !== 'PASS' || !isRecord(projection)) {
    return unsupported(
      'GUITAR_PROJECTION_UNSUPPORTED',
      { cause: guitarProjection?.diagnostics?.[0] ?? 'UNKNOWN' },
      unverifiedContexts,
    );
  }

  const snapshot = referenceBundle.snapshot;
  const profile = referenceBundle.provenance.profile;
  if (!isRecord(snapshot)
    || !Array.isArray(snapshot.notes)
    || !Number.isSafeInteger(snapshot.measure_count)
    || !Number.isSafeInteger(snapshot.part_count)
    || !isRecord(profile)
    || !Number.isSafeInteger(profile.divisions)) {
    return unsupported('MALFORMED_SEMANTIC_REFERENCE', {}, unverifiedContexts);
  }

  if (Array.isArray(snapshot.diagnostics) && snapshot.diagnostics.length > 0) {
    return unsupported('SEMANTIC_REFERENCE_DIAGNOSTICS', {}, unverifiedContexts);
  }

  const measureStarts = buildMeasureStarts(projection, profile.divisions);
  if (measureStarts === null) {
    return unsupported('UNSUPPORTED_TIMING_PROFILE', {}, unverifiedContexts);
  }

  const guitarSlots = [];
  for (const note of projection.notes ?? []) {
    const slot = guitarSlot(note, measureStarts);
    if (slot === null) {
      return unsupported('MALFORMED_GUITAR_PROJECTION', {}, unverifiedContexts);
    }
    guitarSlots.push(slot);
  }

  const semanticSlots = [];
  for (const note of snapshot.notes) {
    const slot = semanticSlot(note, snapshot.measure_count);
    if (slot === null) {
      return unsupported('MALFORMED_SEMANTIC_REFERENCE', {}, unverifiedContexts);
    }
    semanticSlots.push(slot);
  }

  const guitarBuckets = bucketByStructuralSlot(guitarSlots);
  const semanticBuckets = bucketByStructuralSlot(semanticSlots);
  if ([...guitarBuckets.values(), ...semanticBuckets.values()]
    .some((bucket) => bucket.length !== 1)) {
    return unsupported('AMBIGUOUS_STRUCTURAL_MATCH', {}, unverifiedContexts);
  }

  const diagnostics = [];

  if (projection.measureCount !== snapshot.measure_count || snapshot.part_count !== 1) {
    diagnostics.push({
      code: 'MEASURE_COUNT_MISMATCH',
      guitarMeasureCount: projection.measureCount,
      semanticMeasureCount: snapshot.measure_count,
    });
  }

  for (const meter of projection.meters) {
    const effective = effectiveTimeSignatureAt(
      snapshot,
      measureStarts[meter.measureIndex],
      projection.partId,
    );
    if (effective === null
      || effective.beats !== meter.beats
      || effective.beat_type !== meter.beatType) {
      diagnostics.push({
        code: 'METER_MISMATCH',
        measureIndex: meter.measureIndex,
        guitarBeats: meter.beats,
        guitarBeatType: meter.beatType,
        semanticBeats: effective?.beats ?? null,
        semanticBeatType: effective?.beat_type ?? null,
      });
    }
  }

  const structuralKeys = [...new Set([
    ...guitarBuckets.keys(),
    ...semanticBuckets.keys(),
  ])].sort();

  for (const key of structuralKeys) {
    const guitar = guitarBuckets.get(key)?.[0] ?? null;
    const semantic = semanticBuckets.get(key)?.[0] ?? null;
    if (guitar === null || semantic === null) {
      const slot = guitar ?? semantic;
      diagnostics.push({
        code: 'NOTE_STRUCTURE_MISMATCH',
        measureIndex: slot.measureIndex,
        onsetDiv: slot.onsetDiv,
        voice: slot.voice,
        staff: slot.staff,
        side: guitar === null ? 'SEMANTIC_ONLY' : 'GUITAR_ONLY',
      });
      continue;
    }

    if (guitar.pitchMidi !== semantic.pitchMidi) {
      diagnostics.push({
        code: 'PITCH_MISMATCH',
        measureIndex: guitar.measureIndex,
        onsetDiv: guitar.onsetDiv,
        voice: guitar.voice,
        staff: guitar.staff,
        guitarPitchMidi: guitar.pitchMidi,
        semanticPitchMidi: semantic.pitchMidi,
      });
    }
  }

  diagnostics.sort(diagnosticSort);
  return freezeResult(
    diagnostics.length === 0 ? 'PASS' : 'DIAGNOSTIC',
    diagnostics,
    unverifiedContexts,
  );
}

module.exports = {
  compareGuitarSourceWithSemanticReference,
};
