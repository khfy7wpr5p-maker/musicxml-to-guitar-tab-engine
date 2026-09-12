'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MUSICXML_UPLOAD_RUNTIME_VERSION,
  MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  decorateUploadResultWithCapabilities,
} = require('../src/app/reviewRequiredCapabilityContract');

function polyphonicScore(direction = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${direction}
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

test('upload result schema 1.2 exposes additive capability and artifact authority', () => {
  assert.equal(MUSICXML_UPLOAD_RUNTIME_VERSION, '1.0.0');
  assert.equal(MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION, '1.2.0');
  const result = processMusicXmlUpload({
    fileName: 'capability-pass.musicxml',
    bytes: Buffer.from(polyphonicScore()),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.resultSchemaVersion, '1.2.0');
  assert.equal(result.capabilityContractVersion, '1.0.0');
  assert.equal(result.scoreAvailable, true);
  assert.equal(result.capabilities.renderScore, true);
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.playback, 'FULL');
  assert.equal(result.capabilities.export, true);
  assert.equal(result.artifacts.canonicalTabAvailable, true);
  assert.equal(result.artifacts.provisionalTabAvailable, false);
  assert.equal(result.artifacts.playbackTimelineReliability, 'FULL');
  assert.ok(Object.isFrozen(result));
});

test('combined direction review retains only the safely parsed source score', () => {
  const direction = '<direction placement="above"><direction-type><words>Larghetto</words></direction-type><direction-type><metronome><beat-unit>half</beat-unit><per-minute>32</per-minute></metronome></direction-type><staff>1</staff><sound tempo="80"/></direction>';
  const request = {
    fileName: 'conflicting-combined-tempo.musicxml',
    bytes: Buffer.from(polyphonicScore(direction)),
  };
  const first = processMusicXmlUpload(request);
  const second = processMusicXmlUpload(request);

  assert.equal(first.status, 'REVIEW_REQUIRED');
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.contractVersion, '1.0.0');
  assert.equal(first.resultSchemaVersion, '1.2.0');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.equal(first.sourceArtifact.documentType, 'MusicXmlSourceArtifact');
  assert.equal(first.sourceArtifact.contractVersion, '1.0.0');
  assert.equal(first.sourceArtifact.sourceUploadSha256, first.input.sha256);
  assert.equal(first.sourceArtifact.sourceKind, 'DIRECT_XML');
  assert.equal(first.sourceArtifact.mediaType, 'application/vnd.recordare.musicxml+xml');
  assert.equal(first.sourceArtifact.byteLength, Buffer.byteLength(first.sourceArtifact.rendererMusicXml));
  assert.match(first.sourceArtifact.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.sourceArtifact.rendererMusicXml, request.bytes.toString('utf8'));
  assert.equal(Object.isFrozen(first.sourceArtifact), true);
  assert.equal(first.scoreAvailable, true);
  assert.equal(first.capabilities.renderScore, true);
  assert.equal(first.capabilities.generateTab, false);
  assert.equal(first.capabilities.playback, 'APPROXIMATE');
  assert.equal(first.capabilities.export, false);
  assert.equal(first.artifacts.sourceArtifactAvailable, true);
  assert.equal(first.artifacts.rendererMusicXmlAvailable, true);
  assert.equal(first.artifacts.provisionalTabAvailable, false);
  assert.equal(first.artifacts.canonicalTabAvailable, false);
  assert.equal(first.artifacts.playbackTimelineReliability, 'PARTIAL');
  assert.equal(first.issues.length > 0, true);
  assert.match(first.issues[0].issueId, /^issue_[0-9a-f]{20}$/);
  assert.equal(first.issues[0].affectsTab, false);
  assert.equal(first.issues[0].tabVisible, false);
  assert.equal(first.issues[0].teacherActionRequired, true);
  assert.deepEqual(
    first.issues[0].allowedActions,
    ['ACCEPT_AS_IS', 'APPLY_SUGGESTED_FIX', 'EDIT_MANUALLY'],
  );
  assert.deepEqual(first, second);
});

test('timeline review keeps TAB capability when a provisional artifact exists', () => {
  const result = decorateUploadResultWithCapabilities({
    documentType: 'MusicXmlUploadRuntimeResult',
    contractVersion: '1.0.0',
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    preflight: {
      status: 'REVIEW_REQUIRED',
      canProcess: false,
      issues: [{
        severity: 'warning',
        category: 'semantic',
        code: 'RHYTHM_TIMELINE_CONFLICT',
        message: 'Measure timing requires teacher review.',
        location: { measure: 8, measureIndex: 7 },
      }],
    },
    canonicalTabResult: { source: { documentType: 'PolyphonicSourceModel' } },
    musicXml: '<score-partwise version="4.0"></score-partwise>',
  });

  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.resultSchemaVersion, '1.2.0');
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.playback, 'APPROXIMATE');
  assert.equal(result.artifacts.provisionalTabAvailable, true);
  assert.equal(result.issues[0].affectsTab, false);
  assert.equal(result.issues[0].tabVisible, true);
  assert.deepEqual(result.issues[0].affects, ['rhythm', 'playback']);
});

test('only explicitly reviewable issues require teacher action', () => {
  const result = decorateUploadResultWithCapabilities({
    documentType: 'MusicXmlUploadRuntimeResult',
    contractVersion: '1.0.0',
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    preflight: {
      status: 'REVIEW_REQUIRED',
      canProcess: false,
      issues: [
        { severity: 'error', category: 'semantic', code: 'CONFLICTING_PERFORMANCE_TEMPO', reviewDisposition: 'REVIEW_REQUIRED', message: 'Tempo requires review.' },
        { severity: 'warning', category: 'quality', code: 'INVALID_PERFORMANCE_DYNAMICS', message: 'Playback-only dynamics was excluded.' },
      ],
    },
    canonicalTabResult: { source: { documentType: 'PolyphonicSourceModel' } },
    musicXml: '<score-partwise version="4.0"></score-partwise>',
  });

  assert.equal(result.issues[0].teacherActionRequired, true);
  assert.deepEqual(result.issues[0].allowedActions, ['ACCEPT_AS_IS', 'APPLY_SUGGESTED_FIX', 'EDIT_MANUALLY']);
  assert.equal(result.issues[1].teacherActionRequired, false);
  assert.deepEqual(result.issues[1].allowedActions, []);
});

test('hard block remains capability-closed', () => {
  const result = processMusicXmlUpload({
    fileName: 'unsafe.musicxml',
    bytes: Buffer.from('<!DOCTYPE score [<!ENTITY x "boom">]><score>&x;</score>'),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.resultSchemaVersion, '1.2.0');
  assert.equal(result.scoreAvailable, false);
  assert.equal(result.capabilities.renderScore, false);
  assert.equal(result.capabilities.generateTab, false);
  assert.equal(result.capabilities.playback, 'DISABLED');
  assert.equal(result.capabilities.export, false);
  assert.equal(result.artifacts.provisionalTabAvailable, false);
  assert.equal(result.artifacts.canonicalTabAvailable, false);
  assert.equal(result.sourceArtifact, null);
  assert.equal(result.artifacts.sourceArtifactAvailable, false);
  assert.equal(result.artifacts.rendererMusicXmlAvailable, false);
});
