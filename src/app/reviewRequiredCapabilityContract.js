'use strict';

const crypto = require('node:crypto');

const REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION = '1.1.0';
const MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION = '1.3.0';

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
  if (code.includes('PITCH')) {
    effects.add('pitch');
    effects.add('fingering');
  }
  if (
    code.includes('FINGER')
    || code.includes('LEFT_HAND')
    || code.includes('ASSIGNMENT')
    || code.includes('PHYSICAL_POINT')
    || feature.includes('fingering')
  ) effects.add('fingering');
  if (issue?.details?.arrangementArtifact === 'PartialGuitarTabArrangement') {
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
    || code.includes('FINGER')
    || code.includes('LEFT_HAND')
    || code.includes('ASSIGNMENT')
    || code.includes('PHYSICAL_POINT')
    || issue?.details?.arrangementArtifact === 'PartialGuitarTabArrangement';
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

function validPartialArrangementArtifact(result) {
  const artifact = result?.arrangementArtifact;
  const musicXml = typeof result?.musicXml === 'string' ? result.musicXml : null;
  if (
    !artifact
    || artifact.documentType !== 'PartialGuitarTabArrangement'
    || artifact.contractVersion !== '1.0.0'
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

function decorateUploadResultWithCapabilities(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('Upload result must be an object.');
  }

  const rendererMusicXmlAvailable = rendererMusicXml(result) !== null;
  const renderScore = rendererMusicXmlAvailable && result.status !== 'BLOCKED';
  const partialArrangementAvailable = validPartialArrangementArtifact(result);
  const tabArtifactAvailable = Boolean(result.canonicalTabResult) || partialArrangementAvailable;
  const sourceArtifactAvailable = sourceArtifactMusicXml(result) !== null;
  const reviewable = result.status === 'REVIEW_REQUIRED';
  const passed = result.status === 'PASS';
  const tabVisible = renderScore && tabArtifactAvailable;
  const issues = enrichedIssues(result, tabVisible);
  const playback = playbackCapability(result, renderScore, issues);

  const capabilities = {
    renderScore,
    generateTab: tabArtifactAvailable,
    // Existing pitch-edit runtimes are PASS-only. REVIEW_REQUIRED editing is
    // exposed only after the teacher-revision host is connected; do not lie
    // about that capability merely to unlock a browser control.
    editPitch: passed && Boolean(result.canonicalTabResult),
    editRhythm: false,
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
