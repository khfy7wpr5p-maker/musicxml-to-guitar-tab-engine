'use strict';

const crypto = require('node:crypto');
const { createGuitarConfiguration } = require('../guitar/tuning');

const REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION = '1.4.0';
const MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION = '1.6.0';

const PLAYBACK_CAPABILITY = Object.freeze({
  FULL: 'FULL',
  APPROXIMATE: 'APPROXIMATE',
  DISABLED: 'DISABLED',
});

const REVIEW_ACTIONS = Object.freeze([
  'ACCEPT_AS_IS',
  'APPLY_SUGGESTED_FIX',
  'EDIT_MANUALLY',
]);

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

function normalizedIssueLocation(issue) {
  const location = issue && typeof issue.location === 'object' && issue.location
    ? issue.location
    : {};
  return {
    measure: location.measure ?? null,
    measureIndex: location.measureIndex ?? null,
    eventIndex: location.eventIndex ?? null,
    sourceEventId: location.sourceEventId ?? null,
  };
}

function stableIssueId(issue, ordinal) {
  if (typeof issue?.issueId === 'string' && issue.issueId.length > 0) return issue.issueId;
  if (typeof issue?.issue_id === 'string' && issue.issue_id.length > 0) return issue.issue_id;
  if (
    typeof issue?.reviewEvidence?.issue_id === 'string'
    && issue.reviewEvidence.issue_id.length > 0
  ) return issue.reviewEvidence.issue_id;

  const location = normalizedIssueLocation(issue);
  const identity = JSON.stringify([
    issue?.code ?? 'UPLOAD_ISSUE',
    issue?.category ?? null,
    location.measure,
    location.measureIndex,
    location.eventIndex,
    location.sourceEventId,
    issue?.details?.feature ?? null,
    issue?.details?.reason ?? null,
    issue?.details?.rawLexeme ?? null,
    ordinal,
  ]);
  return `issue_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}

function issueEffects(issue) {
  const code = String(issue?.code || '').toUpperCase();
  const feature = String(issue?.details?.feature || '').toLowerCase();
  const reason = String(issue?.details?.reason || '').toUpperCase();
  const effects = new Set();

  if (
    code.includes('TEMPO')
    || code.includes('DIRECTION')
    || feature.includes('direction')
    || reason.includes('PERFORMANCE_DIRECTION')
  ) {
    effects.add('playback');
  }
  if (
    code.includes('RHYTHM')
    || code.includes('DURATION')
    || code.includes('ONSET')
    || code.includes('TIMELINE')
    || code.includes('MEASURE_DURATION')
    || reason.includes('MEASURE_EVENT_OVERFLOW')
  ) {
    effects.add('rhythm');
    effects.add('playback');
  }
  if (code.includes('VOICE')) {
    effects.add('voice');
    effects.add('rhythm');
    effects.add('playback');
  }
  if (code.includes('TIE')) {
    effects.add('tie');
    effects.add('playback');
  }
  if (
    code.includes('PITCH')
    || feature.includes('register-displacement')
    || reason.includes('HIGH_REGISTER_OCTAVE_DISPLACEMENT')
  ) {
    effects.add('pitch');
    effects.add('fingering');
    if (
      feature.includes('register-displacement')
      || reason.includes('HIGH_REGISTER_OCTAVE_DISPLACEMENT')
    ) effects.add('playback');
  }
  if (
    code.includes('FINGER')
    || code.includes('LEFT_HAND')
    || code.includes('ASSIGNMENT')
    || code.includes('PHYSICAL_POINT')
    || feature.includes('fingering')
  ) effects.add('fingering');
  if (
    issue?.details?.arrangementArtifact === 'PartialGuitarTabArrangement'
    || issue?.details?.arrangementArtifact === 'NoLossArpeggiatedGuitarArrangement'
  ) {
    effects.add('playback');
  }
  if (
    code.includes('REPEAT')
    || code.includes('ENDING')
    || feature.includes('barline-repeat')
    || feature.includes('barline-ending')
  ) {
    effects.add('structure');
    effects.add('playback');
  }
  if (effects.size === 0) effects.add('review');
  return [...effects];
}

function issueAffectsTab(issue) {
  const code = String(issue?.code || '').toUpperCase();
  const feature = String(issue?.details?.feature || '').toLowerCase();
  if (
    code.includes('TEMPO')
    || code.includes('DIRECTION')
    || code.includes('RHYTHM')
    || code.includes('DURATION')
    || code.includes('ONSET')
    || code.includes('TIMELINE')
    || code.includes('VOICE')
    || code.includes('REPEAT')
    || code.includes('ENDING')
    || code.includes('MEASURE_DURATION')
    || feature.includes('direction')
    || feature.includes('barline-repeat')
    || feature.includes('barline-ending')
  ) return false;
  return code.includes('PITCH')
    || feature.includes('register-displacement')
    || code.includes('FINGER')
    || code.includes('LEFT_HAND')
    || code.includes('ASSIGNMENT')
    || code.includes('PHYSICAL_POINT')
    || issue?.details?.arrangementArtifact === 'PartialGuitarTabArrangement'
    || issue?.details?.arrangementArtifact === 'NoLossArpeggiatedGuitarArrangement';
}

function enrichedIssues(result, tabVisible) {
  const issues = Array.isArray(result?.preflight?.issues) ? result.preflight.issues : [];
  return issues.map((issue, index) => {
    // A document can be REVIEW_REQUIRED because of one localized issue while
    // also carrying ordinary warnings. Only explicitly reviewable issues may
    // require teacher action; document status must not promote warnings.
    const reviewRequired = issue?.reviewDisposition === 'REVIEW_REQUIRED'
      || issue?.details?.reviewDisposition === 'REVIEW_REQUIRED';
    return {
      ...issue,
      issueId: stableIssueId(issue, index),
      location: normalizedIssueLocation(issue),
      affects: issueEffects(issue),
      affectsTab: issueAffectsTab(issue),
      tabVisible,
      teacherActionRequired: reviewRequired,
      allowedActions: reviewRequired ? [...REVIEW_ACTIONS] : [],
    };
  });
}

function playbackCapability(result, renderScore, issues) {
  if (!renderScore || result.status === 'BLOCKED') return PLAYBACK_CAPABILITY.DISABLED;
  if (result.status === 'PASS') return PLAYBACK_CAPABILITY.FULL;
  if (result.status !== 'REVIEW_REQUIRED') return PLAYBACK_CAPABILITY.DISABLED;
  return issues.some((issue) => issue.affects.includes('playback'))
    ? PLAYBACK_CAPABILITY.APPROXIMATE
    : PLAYBACK_CAPABILITY.FULL;
}

function sourceArtifactMusicXml(result) {
  const artifact = result?.sourceArtifact;
  if (
    artifact?.documentType !== 'MusicXmlSourceArtifact'
    || artifact?.contractVersion !== '1.0.0'
  ) return null;
  return typeof artifact.rendererMusicXml === 'string' && artifact.rendererMusicXml.length > 0
    ? artifact.rendererMusicXml
    : null;
}

function rendererMusicXml(result) {
  if (typeof result?.musicXml === 'string' && result.musicXml.length > 0) {
    return result.musicXml;
  }
  return sourceArtifactMusicXml(result);
}

function validPartialArrangementArtifactShape(artifact, result, musicXml) {
  if (
    !artifact
    || artifact.documentType !== 'PartialGuitarTabArrangement'
    || artifact.authority !== 'PROVISIONAL_REVIEW_ONLY'
    || artifact.sourceUploadSha256 !== result?.input?.sha256
    || !Array.isArray(artifact.noteDispositions)
    || artifact.noteDispositions.length !== artifact.sourceNoteCount
    || !Number.isSafeInteger(artifact.assignedNoteCount)
    || !Number.isSafeInteger(artifact.unassignedNoteCount)
    || !Number.isSafeInteger(artifact.omittedNoteCount)
    || artifact.assignedNoteCount + artifact.unassignedNoteCount + artifact.omittedNoteCount
      !== artifact.sourceNoteCount
    || !musicXml
    || artifact.renderer?.byteLength !== Buffer.byteLength(musicXml, 'utf8')
    || artifact.renderer?.sha256 !== crypto.createHash('sha256').update(musicXml).digest('hex')
  ) return false;

  return artifact.noteDispositions.every((entry) => {
    if (entry?.disposition === 'KEPT' || entry?.disposition === 'OCTAVE_SHIFTED') {
      return Boolean(entry.targetPitch && entry.selectedPosition);
    }
    if (entry?.disposition === 'UNASSIGNED' || entry?.disposition === 'OMITTED') {
      return entry.targetPitch === null && entry.selectedPosition === null;
    }
    return false;
  });
}

function validNoLossArpeggiationArtifactV1(artifact, result, musicXml) {
  if (
    !artifact
    || artifact.documentType !== 'NoLossArpeggiatedGuitarArrangement'
    || artifact.contractVersion !== '1.0.0'
    || artifact.authority !== 'PROVISIONAL_REVIEW_ONLY'
    || artifact.sourceUploadSha256 !== result?.input?.sha256
    || !Array.isArray(artifact.noteDispositions)
    || artifact.noteDispositions.length !== artifact.sourceNoteCount
    || artifact.assignedNoteCount !== artifact.sourceNoteCount
    || artifact.unassignedNoteCount !== 0
    || artifact.omittedNoteCount !== 0
    || artifact.coverageBasisPoints !== 10_000
    || !musicXml
    || artifact.renderer?.byteLength !== Buffer.byteLength(musicXml, 'utf8')
    || artifact.renderer?.sha256 !== crypto.createHash('sha256').update(musicXml).digest('hex')
    || artifact.policy !== 'NO_LOSS_ARPEGGIATION_REVIEW_RECOVERY_1.0'
    || artifact.recovery?.transform !== 'ARPEGGIATED'
    || artifact.recovery?.spreadDivisions !== 1
    || artifact.recovery?.targetTimingAuthority !== false
    || artifact.recovery?.candidateOrderIsPreferenceRank !== false
    || artifact.recovery?.orderStrategy !== 'SOURCE_ORDER'
    || artifact.recovery?.physicalValidationStatus !== 'FEASIBLE'
    || artifact.timing?.sourceTimingAuthority !== true
    || artifact.timing?.targetTimingAuthority !== false
    || !Array.isArray(artifact.timing?.source)
    || !Array.isArray(artifact.timing?.provisionalTarget)
    || artifact.timing.source.length !== artifact.sourceNoteCount
    || artifact.timing.provisionalTarget.length !== artifact.sourceNoteCount
  ) return false;
  return artifact.noteDispositions.every((entry) => (
    (entry?.disposition === 'KEPT' || entry?.disposition === 'OCTAVE_SHIFTED')
    && Boolean(entry.targetPitch && entry.selectedPosition)
  ));
}

function validPartialArrangementArtifactV1(artifact, result, musicXml) {
  return artifact?.contractVersion === '1.0.0'
    && validPartialArrangementArtifactShape(artifact, result, musicXml);
}

const R9_ARRANGEMENT_REASON_CODES = new Set([
  'MELODY_ANCHOR_RETAINED',
  'BASS_ANCHOR_RETAINED',
  'INNER_VOICE_RETAINED',
  'TEACHER_ASSIGNMENT_RETAINED',
  'GUITAR_CAPACITY_REDUCTION',
  'DUPLICATE_TARGET_PITCH_REDUCTION',
  'OCTAVE_NEAREST_IN_REGISTER',
  'SOURCE_REPRESENTATION_NORMALIZATION',
  'GRACE_TIMING_REQUIRES_REVIEW',
]);

const R9_RETRY_ERROR_CODES = new Set([
  'GUITAR_VOICING_CANDIDATE_LIMIT_EXCEEDED',
  'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED',
  'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW',
  'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION',
  'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION',
]);

const R9_REASON_CODES_BY_DISPOSITION = Object.freeze({
  KEPT: new Set([
    'MELODY_ANCHOR_RETAINED',
    'BASS_ANCHOR_RETAINED',
    'INNER_VOICE_RETAINED',
    'TEACHER_ASSIGNMENT_RETAINED',
  ]),
  OCTAVE_SHIFTED: new Set(['OCTAVE_NEAREST_IN_REGISTER']),
  UNASSIGNED: new Set([
    'GUITAR_CAPACITY_REDUCTION',
    'DUPLICATE_TARGET_PITCH_REDUCTION',
    'GRACE_TIMING_REQUIRES_REVIEW',
  ]),
  OMITTED: new Set(['SOURCE_REPRESENTATION_NORMALIZATION']),
});

function validR9Recovery(recovery) {
  const attempts = recovery?.attempts;
  if (
    !Number.isSafeInteger(recovery?.retainedNoteCap)
    || recovery.retainedNoteCap < 1
    || recovery.retainedNoteCap > 6
    || !Array.isArray(attempts)
    || attempts.length !== 7 - recovery.retainedNoteCap
  ) return false;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (
      !attempt
      || attempt.retainedNoteCap !== 6 - index
    ) return false;
    const finalAttempt = index === attempts.length - 1;
    if (finalAttempt) {
      if (attempt.outcome !== 'SELECTED' || attempt.errorCode !== null) return false;
    } else if (
      attempt.outcome !== 'REJECTED'
      || !R9_RETRY_ERROR_CODES.has(attempt.errorCode)
    ) return false;
  }
  return recovery.retainedNoteCap === attempts[attempts.length - 1].retainedNoteCap;
}

function validR9DispositionEvidence(artifact) {
  const counts = {
    assigned: 0,
    unassigned: 0,
    omitted: 0,
    unassignedGrace: 0,
  };
  const sourceEventIds = new Set();
  for (const entry of artifact.noteDispositions) {
    if (
      typeof entry?.sourceEventId !== 'string'
      || entry.sourceEventId.length < 1
      || sourceEventIds.has(entry.sourceEventId)
      || !R9_ARRANGEMENT_REASON_CODES.has(entry.reasonCode)
      || !R9_REASON_CODES_BY_DISPOSITION[entry.disposition]?.has(entry.reasonCode)
    ) return false;
    sourceEventIds.add(entry.sourceEventId);
    if (entry.disposition === 'KEPT' || entry.disposition === 'OCTAVE_SHIFTED') {
      counts.assigned += 1;
    } else if (entry.disposition === 'UNASSIGNED') {
      counts.unassigned += 1;
      if (entry.reasonCode === 'GRACE_TIMING_REQUIRES_REVIEW') {
        counts.unassignedGrace += 1;
      }
    } else if (entry.disposition === 'OMITTED') {
      counts.omitted += 1;
    }
  }
  const expectedCoverage = artifact.sourceNoteCount === 0
    ? null
    : Math.floor((counts.assigned * 10_000) / artifact.sourceNoteCount);
  return artifact.assignedNoteCount === counts.assigned
    && artifact.unassignedNoteCount === counts.unassigned
    && artifact.omittedNoteCount === counts.omitted
    && artifact.coverageBasisPoints === expectedCoverage
    && artifact.recovery?.unassignedGraceNoteCount === counts.unassignedGrace;
}

function validPartialArrangementArtifactV11(artifact, result, musicXml) {
  return artifact?.contractVersion === '1.1.0'
    && artifact.policy === 'MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0'
    && validPartialArrangementArtifactShape(artifact, result, musicXml)
    && validR9Recovery(artifact.recovery)
    && validR9DispositionEvidence(artifact);
}

function validPartialArrangementArtifact(result) {
  const artifact = result?.arrangementArtifact;
  const validator = artifact?.documentType === 'PartialGuitarTabArrangement'
    ? {
      '1.0.0': validPartialArrangementArtifactV1,
      '1.1.0': validPartialArrangementArtifactV11,
    }[artifact?.contractVersion]
    : artifact?.documentType === 'NoLossArpeggiatedGuitarArrangement'
      ? { '1.0.0': validNoLossArpeggiationArtifactV1 }[artifact?.contractVersion]
      : null;
  const musicXml = typeof result?.musicXml === 'string' ? result.musicXml : null;
  return Boolean(validator && validator(artifact, result, musicXml));
}

function validReviewEditableProjection(result) {
  const projection = result?.reviewEditableProjection;
  const artifact = result?.arrangementArtifact;
  const shapeValid = Boolean(
    validPartialArrangementArtifact(result)
    && projection?.documentType === 'ReviewEditableTabProjection'
    && projection?.contractVersion === '1.1.0'
    && projection?.authority === 'PROVISIONAL_REVIEW_ONLY'
    && projection?.sourceUploadSha256 === result?.input?.sha256
    && projection?.sourceUploadSha256 === artifact?.sourceUploadSha256
    && Array.isArray(projection.measures)
    && Array.isArray(projection.simultaneousGroups)
    && Array.isArray(projection.noteDispositions)
    && projection.noteDispositions.length
      === artifact.noteDispositions.filter((entry) => !String(entry.sourceEventId).includes(':grace:')).length
  );
  if (!shapeValid) return false;

  const artifactById = new Map(
    artifact.noteDispositions
      .filter((entry) => !String(entry.sourceEventId).includes(':grace:'))
      .map((entry) => [entry.sourceEventId, entry]),
  );
  const projectionIds = new Set();
  const eventById = new Map(
    projection.measures.flatMap((measure) => measure?.events || [])
      .filter((event) => event?.type === 'note')
      .map((event) => [event.sourceEventId, event]),
  );
  const tiedGroupEventIds = new Set();
  for (const group of projection.simultaneousGroups) {
    if (group?.sourceEventIds?.some((sourceEventId) => {
      const member = eventById.get(sourceEventId);
      return member?.tieStart || member?.tieStop;
    })) {
      for (const sourceEventId of group.sourceEventIds) tiedGroupEventIds.add(sourceEventId);
    }
  }
  for (const entry of projection.noteDispositions) {
    const source = artifactById.get(entry?.sourceEventId);
    const event = eventById.get(entry?.sourceEventId);
    const expectedDisposition = source?.disposition === 'KEPT' || source?.disposition === 'OCTAVE_SHIFTED'
      ? 'KEEP'
      : 'OMIT';
    const expectedAssignmentEligible = source?.disposition === 'UNASSIGNED'
      && event?.tieStart === false
      && event?.tieStop === false
      && !tiedGroupEventIds.has(entry?.sourceEventId);
    if (
      !source
      || !event
      || projectionIds.has(entry.sourceEventId)
      || entry.disposition !== expectedDisposition
      || entry.reasonCode !== source.reasonCode
      || entry.assignmentEligible !== expectedAssignmentEligible
      || entry.targetPitch !== source.targetPitch
      || entry.selectedPosition !== source.selectedPosition
    ) return false;
    projectionIds.add(entry.sourceEventId);
  }
  const eventIds = projection.measures.flatMap((measure) => measure?.events || [])
    .filter((event) => event?.type === 'note')
    .map((event) => event.sourceEventId);
  if (
    eventIds.length !== artifactById.size
    || new Set(eventIds).size !== eventIds.length
    || eventIds.some((sourceEventId) => !projectionIds.has(sourceEventId))
  ) return false;
  return projection.simultaneousGroups.every((group) => (
    typeof group?.groupId === 'string'
    && Array.isArray(group.sourceEventIds)
    && group.sourceEventIds.length > 1
    && group.sourceEventIds.every((sourceEventId) => projectionIds.has(sourceEventId))
  ));
}

function validReviewDraftGuitarConfiguration(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tuning)) return false;
  try {
    const normalized = createGuitarConfiguration({
      tuning: value.tuning,
      minimumFret: value.minimumFret,
      maximumFret: value.maximumFret,
      capoFret: value.capoFret,
    });
    return JSON.stringify({
      tuning: value.tuning,
      minimumFret: value.minimumFret,
      maximumFret: value.maximumFret,
      capoFret: value.capoFret,
      fretSemantics: value.fretSemantics,
    }) === JSON.stringify({
      tuning: normalized.tuning,
      minimumFret: normalized.minimumFret,
      maximumFret: normalized.maximumFret,
      capoFret: normalized.capoFret,
      fretSemantics: normalized.fretSemantics,
    });
  } catch {
    return false;
  }
}

function validReviewTabDraft(result) {
  const index = result?.sourceReviewIndex;
  const draft = result?.reviewTabDraft;
  const sourceArtifact = result?.sourceArtifact;
  const inputSha = result?.input?.sha256;

  if (
    index?.documentType !== 'SourceReviewIndex'
    || index?.contractVersion !== '1.0.0'
    || index?.sourceUploadSha256 !== inputSha
    || typeof index?.selectedPartId !== 'string'
    || index.selectedPartId.length === 0
    || !Array.isArray(index.entries)
    || draft?.documentType !== 'ReviewTabDraft'
    || draft?.contractVersion !== '1.0.0'
    || draft?.authority !== 'PROVISIONAL_TEACHER_REVIEW_ONLY'
    || draft?.sourceUploadSha256 !== inputSha
    || draft?.sourceUploadSha256 !== index.sourceUploadSha256
    || draft?.selectedPartId !== index.selectedPartId
    || typeof draft?.revisionId !== 'string'
    || draft.revisionId.length === 0
    || draft?.sourceScoreArtifact !== sourceArtifact
    || sourceArtifact?.sourceUploadSha256 !== inputSha
    || !validReviewDraftGuitarConfiguration(draft?.guitarConfiguration)
    || draft.guitarConfiguration.tuning.length !== 6
    || !Array.isArray(draft?.perNoteDisposition)
    || !Array.isArray(draft?.issues)
    || draft?.renderModel?.documentType !== 'ReviewTabDraftRenderModel'
    || draft?.renderModel?.contractVersion !== '1.0.0'
    || draft?.renderModel?.stringCount !== 6
    || !Array.isArray(draft?.renderModel?.measures)
    || draft?.capabilities?.draftVisible !== true
    || draft?.capabilities?.selectSourceEvent !== true
    || draft?.capabilities?.assignStringFret !== false
    || draft?.capabilities?.export !== false
  ) return false;

  const sourceById = new Map();
  for (const entry of index.entries) {
    if (
      typeof entry?.sourceEventId !== 'string'
      || entry.sourceEventId.length === 0
      || sourceById.has(entry.sourceEventId)
      || entry?.sourceUploadSha256 !== inputSha
      || entry?.selectedPartId !== index.selectedPartId
      || typeof entry?.measureId !== 'string'
      || entry.measureId.length === 0
      || !Array.isArray(entry?.uncertaintyReasonCodes)
    ) return false;
    sourceById.set(entry.sourceEventId, entry);
  }

  const expectedDraftSources = index.entries.filter((entry) => entry.eventKind !== 'REST');
  if (draft.perNoteDisposition.length !== expectedDraftSources.length) return false;

  const dispositionIds = new Set();
  for (const disposition of draft.perNoteDisposition) {
    const source = sourceById.get(disposition?.sourceEventId);
    if (
      !source
      || source.eventKind === 'REST'
      || dispositionIds.has(disposition.sourceEventId)
      || disposition?.measureId !== source.measureId
      || !['UNASSIGNED', 'SOURCE_UNKNOWN'].includes(disposition?.disposition)
      || disposition?.selectedPosition !== null
      || disposition?.knownPitchOrNull !== source.knownPitchOrNull
      || disposition?.knownOnsetOrNull !== source.knownOnsetOrNull
      || disposition?.knownDurationOrNull !== source.knownDurationOrNull
      || disposition?.uncertaintyReasonCodes !== source.uncertaintyReasonCodes
    ) return false;
    const fullyKnown = source.eventKind === 'PITCHED_NOTE'
      && source.knownPitchOrNull !== null
      && source.knownOnsetOrNull !== null
      && source.knownDurationOrNull !== null;
    if (disposition.disposition !== (fullyKnown ? 'UNASSIGNED' : 'SOURCE_UNKNOWN')) return false;
    dispositionIds.add(disposition.sourceEventId);
  }

  const renderIds = new Set();
  const renderMeasureIds = new Set();
  for (const measure of draft.renderModel.measures) {
    if (
      typeof measure?.measureId !== 'string'
      || measure.measureId.length === 0
      || renderMeasureIds.has(measure.measureId)
      || !Array.isArray(measure?.events)
    ) return false;
    renderMeasureIds.add(measure.measureId);
    for (const event of measure.events) {
      const source = sourceById.get(event?.sourceEventId);
      if (
        !source
        || source.measureId !== measure.measureId
        || source.evidenceLocation?.measureIndex !== measure?.measureIndex
        || renderIds.has(event.sourceEventId)
        || source.knownOnsetOrNull === null
        || event?.onsetDivisions !== source.knownOnsetOrNull
        || event?.displayToken !== '?'
        || event?.string !== null
        || event?.fret !== null
      ) return false;
      renderIds.add(event.sourceEventId);
    }
  }

  return expectedDraftSources.every((source) => (
    source.knownOnsetOrNull === null
      ? !renderIds.has(source.sourceEventId)
      : renderIds.has(source.sourceEventId)
  ));
}

function decorateUploadResultWithCapabilities(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('Upload result must be an object.');
  }

  const rendererMusicXmlAvailable = rendererMusicXml(result) !== null;
  const renderScore = rendererMusicXmlAvailable && result.status !== 'BLOCKED';
  const partialArrangementAvailable = validPartialArrangementArtifact(result);
  const reviewEditableProjectionAvailable = validReviewEditableProjection(result);
  const reviewTabDraftAvailable = validReviewTabDraft(result);
  const tabArtifactAvailable = Boolean(result.canonicalTabResult) || partialArrangementAvailable;
  const sourceArtifactAvailable = sourceArtifactMusicXml(result) !== null;
  const sourceReviewIndexAvailable = Boolean(
    reviewTabDraftAvailable
    && result.sourceReviewIndex?.sourceUploadSha256 === result?.input?.sha256
  );
  const reviewable = result.status === 'REVIEW_REQUIRED';
  const passed = result.status === 'PASS';
  const tabVisible = renderScore && tabArtifactAvailable;
  const draftVisible = reviewable && renderScore && reviewTabDraftAvailable;
  const issues = enrichedIssues(result, tabVisible);
  const playback = playbackCapability(result, renderScore, issues);

  const capabilities = {
    renderScore,
    draftVisible,
    generateTab: tabArtifactAvailable,
    // REVIEW_REQUIRED pitch editing is exposed only when a backend-created,
    // source-bound selection model exists; never unlock a browser control by
    // status alone.
    editPitch: (passed && Boolean(result.canonicalTabResult))
      || (reviewable && (Boolean(result.canonicalTabResult) || reviewEditableProjectionAvailable)),
    editRhythm: result.route === 'POLY_V2' && (
      (passed && Boolean(result.canonicalTabResult))
      || (reviewable && (Boolean(result.canonicalTabResult) || reviewEditableProjectionAvailable))
    ),
    assignTabPosition: reviewable
      && reviewEditableProjectionAvailable
      && result.reviewEditableProjection.noteDispositions.some(
        (entry) => entry.assignmentEligible === true,
      ),
    editVoice: false,
    editStructure: false,
    playback,
    export: passed && Boolean(result.canonicalTabResult),
  };

  const artifacts = {
    sourceScoreGraphAvailable: Boolean(
      result.canonicalTabResult?.source
      || (partialArrangementAvailable && result.arrangementArtifact.source),
    ),
    sourceArtifactAvailable,
    rendererMusicXmlAvailable,
    provisionalTabAvailable: reviewable && tabArtifactAvailable,
    reviewTabDraftAvailable: draftVisible,
    sourceReviewIndexAvailable,
    reviewEditableProjectionAvailable,
    canonicalTabAvailable: passed && Boolean(result.canonicalTabResult),
    playbackTimelineReliability: playback === PLAYBACK_CAPABILITY.FULL
      ? 'FULL'
      : playback === PLAYBACK_CAPABILITY.APPROXIMATE
        ? 'PARTIAL'
        : 'NONE',
  };

  return deepFreeze({
    ...result,
    // Keep the established upload runtime contractVersion untouched. The
    // capability extension is additive and therefore carries its own schema
    // version instead of silently changing the meaning of an existing field.
    resultSchemaVersion: MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION,
    capabilityContractVersion: REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION,
    scoreAvailable: renderScore,
    capabilities,
    artifacts,
    issues,
  });
}

module.exports = {
  MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION,
  PLAYBACK_CAPABILITY,
  REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION,
  decorateUploadResultWithCapabilities,
};
