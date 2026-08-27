'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithNotationContextCompatibility,
} = require('../src/parser/polyphonicNotationContextNormalizer');
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

function timeInventory(root) {
  const samples = [];
  let count = 0;
  function walk(node) {
    if (node.name === 'time') {
      count += 1;
      if (samples.length < 20) {
        samples.push({
          attributes: Object.fromEntries(node.attributes.map((attribute) => [attribute.name, attribute.value])),
          children: node.children.filter((child) => child.uri === node.uri).map((child) => ({
            name: child.name,
            text: child.text.trim(),
            attributes: Object.fromEntries(child.attributes.map((attribute) => [attribute.name, attribute.value])),
          })),
        });
      }
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return { count, samples };
}

const xml = fs.readFileSync(inputPath, 'utf8');
const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());
console.log(`PS6B_TIME_INVENTORY=${JSON.stringify(timeInventory(parsed.root))}`);

let projection;
try {
  projection = projectParsedMusicXmlWithNotationContextCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  const source = projection.sourceModel;
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    notationContextMarkerCount: projection.notationContextMarkers.length,
    octaveShiftMarkerCount: projection.octaveShiftMarkers.length,
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
