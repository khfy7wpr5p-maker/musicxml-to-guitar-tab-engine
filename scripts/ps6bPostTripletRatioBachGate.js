'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithTripletTimeModificationCompatibility,
} = require('../src/parser/polyphonicTripletTimeModificationNormalizer');
const {
  createSustainedPolyphonicPathSelection,
} = require('../src/music/sustainedPolyphonicPathSolver');

const inputPath = process.argv[2];
if (!inputPath) throw new Error('MusicXML path is required.');

function compactError(error) {
  return {
    name: error?.name || null,
    code: error?.code || null,
    message: error?.message || String(error),
    details: error?.details || null,
  };
}

const xml = fs.readFileSync(inputPath, 'utf8');
const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());

let projection;
try {
  projection = projectParsedMusicXmlWithTripletTimeModificationCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  const source = projection.sourceModel;
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    tripletTimeModificationMarkerCount: projection.tripletTimeModificationMarkers.length,
    durationPolicy: projection.durationPolicy,
    ignoredFeatures: projection.ignoredFeatures,
  })}`);
} catch (error) {
  console.log(`PS6B_PROJECTOR=${JSON.stringify({ status: 'BLOCKED', error: compactError(error) })}`);
  process.exit(0);
}

try {
  const result = createSustainedPolyphonicPathSelection(
    projection.sourceModel,
    createMusicXmlProcessingRuntime(),
  );
  console.log(`PS6B_SOLVER=${JSON.stringify({
    status: 'PASS',
    documentType: result.documentType,
    contractVersion: result.contractVersion,
    selectedPointStateCount: result.selectedPointStates.length,
    totalCost: result.totalCost,
  })}`);
} catch (error) {
  console.log(`PS6B_SOLVER=${JSON.stringify({ status: 'BLOCKED', error: compactError(error) })}`);
}
