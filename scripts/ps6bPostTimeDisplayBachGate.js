'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithTimeSignatureDisplayCompatibility,
} = require('../src/parser/polyphonicTimeSignatureDisplayNormalizer');
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

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function inventory(root) {
  let timeModificationCount = 0;
  let graceCount = 0;
  const timeModificationShapes = new Map();
  const notationChildCounts = new Map();
  const noteChildCounts = new Map();
  const samples = [];

  function walk(node) {
    if (node.name === 'note') {
      for (const child of node.children.filter((candidate) => candidate.uri === node.uri)) {
        increment(noteChildCounts, child.name);
      }
    }
    if (node.name === 'grace') graceCount += 1;
    if (node.name === 'notations') {
      for (const child of node.children.filter((candidate) => candidate.uri === node.uri)) {
        increment(notationChildCounts, child.name);
      }
    }
    if (node.name === 'time-modification') {
      timeModificationCount += 1;
      const children = node.children.filter((child) => child.uri === node.uri).map((child) => ({
        name: child.name,
        text: child.text.trim(),
        attributes: Object.fromEntries(child.attributes.map((attribute) => [attribute.name, attribute.value])),
      }));
      const shapeKey = children.map((child) => `${child.name}=${child.text}`).join('|');
      increment(timeModificationShapes, shapeKey);
      if (samples.length < 20) samples.push(children);
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return {
    timeModificationCount,
    graceCount,
    timeModificationShapes: Object.fromEntries([...timeModificationShapes.entries()].sort()),
    notationChildCounts: Object.fromEntries([...notationChildCounts.entries()].sort()),
    noteChildCounts: Object.fromEntries([...noteChildCounts.entries()].sort()),
    samples,
  };
}

const xml = fs.readFileSync(inputPath, 'utf8');
const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());
console.log(`PS6B_COMPLEX_NOTATION_INVENTORY=${JSON.stringify(inventory(parsed.root))}`);

let projection;
try {
  projection = projectParsedMusicXmlWithTimeSignatureDisplayCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  const source = projection.sourceModel;
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    notationContextMarkerCount: projection.notationContextMarkers.length,
    timeSignatureDisplayMarkerCount: projection.timeSignatureDisplayMarkers.length,
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
