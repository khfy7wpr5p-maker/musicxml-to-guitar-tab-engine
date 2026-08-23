'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createGuitarVoicingCandidateModel } = require('../src/music/guitarVoicingCandidateModel');
const {
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_MODEL_TRANSPORT_SHA256,
  EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
  MODEL_MAX_FRET,
  SOURCE_OBSERVED_MAX_FRET,
  parsePythonHexFloat,
  validateModelArtifactV2,
  createGuitarSetVoicingModelV2FeatureVector,
  scoreGuitarSetVoicingModelV2Candidate,
  createGuitarSetVoicingModelV2ShadowReport,
} = require('../src/learning/guitarsetVoicingModelV2Shadow');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const modelArtifact = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'guitarsetObservedVoicingDevelopmentModelV2.json'), 'utf8'),
);
const pythonGolden = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'guitarsetObservedVoicingPythonGoldenV2.json'), 'utf8'),
);

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>GuitarSet v2 shadow</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function preserveAll(source) {
  const decisions = [];
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') {
        decisions.push({
          decisionType: 'PRESERVED',
          sourceEventIds: [event.sourceEventId],
          sourceGroupId: null,
        });
      }
    }
  }
  return decisions;
}

function buildDyad(stepA, octaveA, stepB, octaveB) {
  const source = sourceModel(score([
    note(stepA, { octave: octaveA }),
    note(stepB, { octave: octaveB, chord: true }),
  ].join('')));
  return createGuitarVoicingCandidateModel(source, preserveAll(source));
}

test('v2 offline adapter validates exact retained checkpoint and transport identity', () => {
  const validated = validateModelArtifactV2(modelArtifact);
  assert.equal(validated.artifactSha256, EXPECTED_MODEL_ARTIFACT_SHA256);
  assert.equal(validated.transportSha256, EXPECTED_MODEL_TRANSPORT_SHA256);
  assert.deepEqual(validated.candidateFretDomain, [0, 20]);
  assert.deepEqual(validated.sourceObservedFretDomain, [0, 19]);
  assert.equal(validated.fret20QualityAuthority, false);
  assert.equal(MODEL_MAX_FRET, 20);
  assert.equal(SOURCE_OBSERVED_MAX_FRET, 19);
  assert.equal(validated.mean.length, 28);
  assert.equal(validated.scale.length, 28);
  assert.equal(validated.coefficient.length, 28);
  assert.ok(validated.scale.every((value) => value > 0));
});

test('v2 Python hexadecimal float transport is explicit and fail-closed', () => {
  assert.equal(parsePythonHexFloat('0x1.0000000000000p+0'), 1);
  assert.equal(parsePythonHexFloat('-0x1.0000000000000p-1'), -0.5);
  assert.equal(parsePythonHexFloat('0x0.0p+0'), 0);
  assert.throws(() => parsePythonHexFloat('1.25'), /hexadecimal/i);
  assert.throws(() => parsePythonHexFloat('0x1.00000000000000p+0'), /hexadecimal/i);
});

test('v2 Node feature and scoring path matches frozen Python golden including fret 20', () => {
  assert.equal(pythonGolden.source_model_artifact_sha256, EXPECTED_MODEL_ARTIFACT_SHA256);
  assert.equal(
    pythonGolden.source_shadow_integration_review_evidence_sha256,
    EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
  );
  assert.deepEqual(pythonGolden.candidate_fret_domain, [0, 20]);
  assert.deepEqual(pythonGolden.source_observed_fret_domain, [0, 19]);
  assert.equal(pythonGolden.fret20_quality_authority, false);

  for (const fixture of pythonGolden.cases) {
    const features = createGuitarSetVoicingModelV2FeatureVector(fixture.candidate);
    assert.equal(features.length, 28, fixture.id);
    const observed = scoreGuitarSetVoicingModelV2Candidate(fixture.candidate, modelArtifact);
    assert.ok(
      Math.abs(observed - fixture.expected_score) <= pythonGolden.python_score_tolerance,
      `${fixture.id}: expected ${fixture.expected_score}, observed ${observed}`,
    );
  }

  const fret20 = pythonGolden.cases.find((fixture) => fixture.id === 'FRET20_BOUNDARY');
  const features = createGuitarSetVoicingModelV2FeatureVector(fret20.candidate);
  assert.equal(features[2], 1, 'max-fret feature must normalize fret 20 to exactly 1');
});

test('v2 Node candidate ranking matches frozen Python ranking', () => {
  const cases = new Map(pythonGolden.cases.map((fixture) => [fixture.id, fixture]));
  for (const group of pythonGolden.ranking_groups) {
    const observedOrder = group.case_ids
      .map((id) => ({
        id,
        score: scoreGuitarSetVoicingModelV2Candidate(cases.get(id).candidate, modelArtifact),
      }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.id);
    assert.deepEqual(observedOrder, group.expected_order, group.id);
  }
});

test('a real PA-7 fret-20 candidate group is fully scored without truncation or authority', () => {
  const runtimeModel = buildDyad('C', 4, 'E', 4);
  assert.equal(runtimeModel.groupCount, 1);
  assert.ok(runtimeModel.groups[0].candidateCount > 1);
  const originalCandidateCount = runtimeModel.candidateCount;
  const originalGroupCandidateCount = runtimeModel.groups[0].candidateCount;
  assert.equal(runtimeModel.groups[0].candidates.some(
    (candidate) => candidate.positions.some((position) => position.fret === 20),
  ), true);

  const report = createGuitarSetVoicingModelV2ShadowReport(runtimeModel, modelArtifact);
  assert.equal(report.mode, 'OFFLINE_ADAPTER_PARITY_ONLY');
  assert.equal(report.candidateCount, originalCandidateCount);
  assert.equal(report.groups[0].candidateCount, originalGroupCandidateCount);
  assert.equal(report.scoredGroupCount, 1);
  assert.equal(report.unsupportedGroupCount, 0);
  assert.equal(report.noCandidateGroupCount, 0);
  assert.equal(report.groups[0].status, 'SHADOW_SCORED_OFFLINE_NON_AUTHORITATIVE_V2');
  assert.equal(report.groups[0].shadowScored, true);
  assert.equal(report.groups[0].modelDomainComplete, true);
  assert.ok(report.groups[0].fret20CandidateCount > 0);
  assert.ok(report.fret20CandidateCount > 0);
  assert.equal(report.fret20CandidateGroupCount, 1);
  assert.equal(report.groups[0].candidateScores.length, originalGroupCandidateCount);
  assert.ok(report.groups[0].candidateScores.some((entry) => entry.containsFret20));
  assert.equal(report.candidateMutationAuthorized, false);
  assert.equal(report.candidateFilteringAuthorized, false);
  assert.equal(report.candidateGenerationAuthorized, false);
  assert.equal(report.shadowIntegrationAuthorized, true);
  assert.equal(report.shadowExecutionAuthorized, false);
  assert.equal(report.liveOrUserInputAuthorized, false);
  assert.equal(report.runtimeConnectionAuthorized, false);
  assert.equal(report.authoritativeDecisionEffectAuthorized, false);
  assert.equal(report.canonicalResultEffectAuthorized, false);
  assert.equal(report.tabOutputEffectAuthorized, false);
  assert.equal(report.fret20CandidateScoringAuthorized, true);
  assert.equal(report.fret20QualityAuthority, false);
  assert.equal(report.productionAuthorized, false);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.groups));
  assert.ok(Object.isFrozen(report.groups[0]));
});

test('a real PA-7 zero-candidate group remains fail-closed', () => {
  const runtimeModel = buildDyad('E', 2, 'E', 2);
  assert.equal(runtimeModel.groupCount, 1);
  assert.equal(runtimeModel.groups[0].candidateCount, 0);
  assert.equal(runtimeModel.candidateCount, 0);

  const report = createGuitarSetVoicingModelV2ShadowReport(runtimeModel, modelArtifact);
  assert.equal(report.groupCount, 1);
  assert.equal(report.candidateCount, 0);
  assert.equal(report.scoredGroupCount, 0);
  assert.equal(report.unsupportedGroupCount, 1);
  assert.equal(report.noCandidateGroupCount, 1);
  assert.equal(report.groups[0].status, 'SHADOW_NOT_SCORED_NO_AUTHORITATIVE_CANDIDATES');
  assert.equal(report.groups[0].shadowScored, false);
  assert.deepEqual(report.groups[0].candidateScores, []);
  assert.equal(report.groups[0].topCandidateId, null);
  assert.equal(report.runtimeConnectionAuthorized, false);
  assert.equal(report.authoritativeDecisionEffectAuthorized, false);
});

test('v2 model parameter tampering fails closed even if claimed artifact ID is unchanged', () => {
  const tampered = JSON.parse(JSON.stringify(modelArtifact));
  tampered.parameters.logistic_coef_hex[0] = '0x1.0000000000000p+0';
  assert.throws(
    () => validateModelArtifactV2(tampered),
    /transport digest drift/i,
  );
});

test('v2 domain and authority metadata tampering is rejected', () => {
  const wrongDomain = JSON.parse(JSON.stringify(modelArtifact));
  wrongDomain.candidate_fret_domain = [0, 19];
  assert.throws(() => validateModelArtifactV2(wrongDomain), /fret-domain metadata drift/i);

  const fakeFret20Authority = JSON.parse(JSON.stringify(modelArtifact));
  fakeFret20Authority.fret20_quality_authority = true;
  assert.throws(() => validateModelArtifactV2(fakeFret20Authority), /authority boundary drift/i);

  const fakeRuntime = JSON.parse(JSON.stringify(modelArtifact));
  fakeRuntime.runtime_connection_authorized = true;
  assert.throws(() => validateModelArtifactV2(fakeRuntime), /authority boundary drift/i);
});
