'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithFermataCompatibility,
} = require('../src/parser/polyphonicFermataNotationNormalizer');
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
    children: node.children.filter((child) => child.uri === node.uri).map((child) => ({
      name: child.name,
      text: child.text.trim(),
      attributes: Object.fromEntries(child.attributes.map((attribute) => [attribute.name, attribute.value])),
    })),
  };
}

function inventory(root) {
  const names = new Set(['slur', 'articulations', 'arpeggiate', 'tuplet', 'time-modification', 'grace']);
  const counts = Object.create(null);
  const shapeCounts = Object.create(null);
  const samples = Object.create(null);

  function record(node) {
    if (!names.has(node.name)) return;
    counts[node.name] = (counts[node.name] || 0) + 1;
    const value = shape(node);
    const key = JSON.stringify(value);
    if (!shapeCounts[node.name]) shapeCounts[node.name] = Object.create(null);
    shapeCounts[node.name][key] = (shapeCounts[node.name][key] || 0) + 1;
    if (!samples[node.name]) samples[node.name] = [];
    if (samples[node.name].length < 20) samples[node.name].push(value);
  }

  function walk(node) {
    record(node);
    for (const child of node.children) walk(child);
  }
  walk(root);
  return { counts, shapeCounts, samples };
}

const xml = fs.readFileSync(inputPath, 'utf8');
const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());
console.log(`PS6B_POST_FERMATA_INVENTORY=${JSON.stringify(inventory(parsed.root))}`);

let projection;
try {
  projection = projectParsedMusicXmlWithFermataCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: projection.sourceModel.measureCount,
    eventCount: projection.sourceModel.eventCount,
    fermataMarkerCount: projection.fermataMarkers.length,
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
    selectedPointStateCount: result.selectedPointStates.length,
    totalCost: result.totalCost,
  })}`);
} catch (error) {
  console.log(`PS6B_SOLVER=${JSON.stringify({ status: 'BLOCKED', error: compactError(error) })}`);
}
