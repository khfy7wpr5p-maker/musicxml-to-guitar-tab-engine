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
  parsePythonHexFloat,
  validateModelArtifact,
  createGuitarSetObservedVoicingFeatureVector,
  scoreGuitarSetObservedVoicingCandidate,
  createGuitarSetObservedVoicingShadowReport,
} = require('../src/learning/guitarsetObservedVoicingShadow');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const modelArtifact = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'guitarsetObservedVoicingDevelopmentModelV1.json'), 'utf8'),
);
const pythonGolden = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'guitarsetObservedVoicingPythonGoldenV1.json'), 'utf8'),
);

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>GuitarSet shadow</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
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

test('offline adapter validates the exact retained checkpoint transport identity', () => {
  const validated = validateModelArtifact(modelArtifact);
  assert.equal(validated.artifactSha256, EXPECTED_MODEL_ARTIFACT_SHA256);
  assert.equal(validated.transportSha256, EXPECTED_MODEL_TRANSPORT_SHA256);
  assert.equal(validated.mean.length, 28);
  assert.equal(validated.scale.length, 28);
  assert.equal(validated.coefficient.length, 28);
  assert.ok(validated.scale.every((value) => value > 0));
});

test('Python hexadecimal float transport is explicit, bounded and fail-closed', () => {
  assert.equal(parsePythonHexFloat('0x1.0000000000000p+0'), 1);
  assert.equal(parsePythonHexFloat('-0x1.0000000000000p-1'), -0.5);
  assert.equal(parsePythonHexFloat('0x0.0p+0'), 0);
  assert.throws(() => parsePythonHexFloat('1.25'), /hexadecimal/i);
  assert.throws(() => parsePythonHexFloat('0x1.00000000000000p+0'), /hexadecimal/i);
});

test('Node feature/scoring path matches frozen Python golden scores', () => {
  assert.equal(pythonGolden.source_model_artifact_sha256, EXPECTED_MODEL_ARTIFACT_SHA256);
  for (const fixture of pythonGolden.cases) {
    const features = createGuitarSetObservedVoicingFeatureVector(fixture.candidate);
    assert.equal(features.length, 28, fixture.id);
    const observed = scoreGuitarSetObservedVoicingCandidate(fixture.candidate, modelArtifact);
    assert.ok(
      Math.abs(observed - fixture.expected_score) <= pythonGolden.python_score_tolerance,
      `${fixture.id}: expected ${fixture.expected_score}, observed ${observed}`,
    );
  }
});

test('Node candidate ranking matches frozen Python golden ranking', () => {
  const cases = new Map(pythonGolden.cases.map((fixture) => [fixture.id, fixture]));
  for (const group of pythonGolden.ranking_groups) {
    const observedOrder = group.case_ids
      .map((id) => ({ id, score: scoreGuitarSetObservedVoicingCandidate(cases.get(id).candidate, modelArtifact) }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.id);
    assert.deepEqual(observedOrder, group.expected_order, group.id);
  }
});

test('real PA-7 0..19 candidate groups can be scored without influencing authority', () => {
  const runtimeModel = buildDyad('C', 3, 'E', 3);
  assert.equal(runtimeModel.groupCount, 1);
  assert.ok(runtimeModel.groups[0].candidateCount > 1);
  assert.equal(runtimeModel.groups[0].candidates.some(
    (candidate) => candidate.positions.some((position) => position.fret > 19),
  ), false);

  const report = createGuitarSetObservedVoicingShadowReport(runtimeModel, modelArtifact);
  assert.equal(report.mode, 'OFFLINE_ADAPTER_PARITY_ONLY');
  assert.equal(report.groupCount, 1);
  assert.equal(report.candidateCount, runtimeModel.candidateCount);
  assert.equal(report.scoredGroupCount, 1);
  assert.equal(report.unsupportedGroupCount, 0);
  assert.equal(report.groups[0].shadowScored, true);
  assert.equal(report.groups[0].candidateScores.length, runtimeModel.groups[0].candidateCount);
  assert.equal(report.candidateMutationAuthorized, false);
  assert.equal(report.candidateFilteringAuthorized, false);
  assert.equal(report.candidateGenerationAuthorized, false);
  assert.equal(report.shadowExecutionAuthorized, false);
  assert.equal(report.runtimeConnectionAuthorized, false);
  assert.equal(report.authoritativeDecisionEffectAuthorized, false);
  assert.equal(report.tabOutputEffectAuthorized, false);
  assert.equal(report.productionAuthorized, false);
});

test('a real PA-7 fret-20 candidate blocks the whole group without truncation', () => {
  const runtimeModel = buildDyad('C', 4, 'E', 4);
  assert.equal(runtimeModel.groupCount, 1);
  assert.ok(runtimeModel.groups[0].candidateCount > 1);
  assert.equal(runtimeModel.groups[0].candidates.some(
    (candidate) => candidate.positions.some((position) => position.fret === 20),
  ), true);

  const report = createGuitarSetObservedVoicingShadowReport(runtimeModel, modelArtifact);
  assert.equal(report.candidateCount, runtimeModel.candidateCount);
  assert.equal(report.scoredGroupCount, 0);
  assert.equal(report.unsupportedGroupCount, 1);
  assert.equal(report.groups[0].status, 'SHADOW_NOT_SCORED_MODEL_DOMAIN_INCOMPLETE');
  assert.equal(report.groups[0].shadowScored, false);
  assert.equal(report.groups[0].modelDomainComplete, false);
  assert.ok(report.groups[0].outOfModelDomainCandidateCount > 0);
  assert.deepEqual(report.groups[0].candidateScores, []);
  assert.equal(report.groups[0].topCandidateId, null);
  assert.equal(report.groups[0].candidateCount, runtimeModel.groups[0].candidateCount);
});

test('model parameter tampering is rejected even if the claimed artifact ID is left unchanged', () => {
  const tampered = JSON.parse(JSON.stringify(modelArtifact));
  tampered.parameters.logistic_coef_hex[0] = '0x1.0000000000000p+0';
  assert.throws(
    () => validateModelArtifact(tampered),
    /transport digest drift/i,
  );
});
