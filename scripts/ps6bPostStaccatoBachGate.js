'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithStaccatoCompatibility,
} = require('../src/parser/polyphonicStaccatoNotationNormalizer');
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

function shape(node) {
  return {
    name: node.name,
    text: node.text.trim(),
    attributes: Object.fromEntries(node.attributes.map((attribute) => [attribute.name, attribute.value])),
    children: node.children
      .filter((child) => child.uri === node.uri)
      .map((child) => ({
        name: child.name,
        text: child.text.trim(),
        attributes: Object.fromEntries(child.attributes.map((attribute) => [attribute.name, attribute.value])),
      })),
  };
}

function inventory(root) {
  const tracked = new Set(['slur', 'arpeggiate', 'tuplet', 'time-modification', 'grace']);
  const counts = Object.create(null);
  const shapes = Object.create(null);
  function walk(node) {
    if (tracked.has(node.name)) {
      counts[node.name] = (counts[node.name] || 0) + 1;
      const key = JSON.stringify(shape(node));
      shapes[node.name] ||= Object.create(null);
      shapes[node.name][key] = (shapes[node.name][key] || 0) + 1;
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return { counts, shapes };
}

const xml = fs.readFileSync(inputPath, 'utf8');
const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());
console.log(`PS6B_POST_STACCATO_INVENTORY=${JSON.stringify(inventory(parsed.root))}`);

let projection;
try {
  projection = projectParsedMusicXmlWithStaccatoCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  const source = projection.sourceModel;
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    staccatoMarkerCount: projection.staccatoMarkers.length,
    performanceTimingCaveats: projection.performanceTimingCaveats,
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
