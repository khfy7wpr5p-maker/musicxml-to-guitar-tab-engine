'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithOctaveShiftCompatibility,
} = require('../src/parser/polyphonicOctaveShiftResolver');
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

function direct(node, name = null) {
  return node.children.filter((child) => (
    child.uri === node.uri && (name === null || child.name === name)
  ));
}

function attributesObject(node) {
  return Object.fromEntries(node.attributes
    .filter((attribute) => attribute.uri.length === 0)
    .map((attribute) => [attribute.name, attribute.value]));
}

function compactNode(node) {
  return {
    name: node.name,
    attributes: attributesObject(node),
    text: node.text.trim(),
    children: direct(node).map((child) => ({
      name: child.name,
      attributes: attributesObject(child),
      text: child.text.trim(),
      children: direct(child).map((grandchild) => ({
        name: grandchild.name,
        attributes: attributesObject(grandchild),
        text: grandchild.text.trim(),
      })),
    })),
  };
}

const xml = fs.readFileSync(inputPath, 'utf8');
let projection;
try {
  const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());
  const root = parsed.root;
  const part = direct(root, 'part')[0];
  const attributeNodes = part ? direct(part, 'measure').flatMap((measure) => direct(measure, 'attributes')) : [];
  const keys = attributeNodes.flatMap((attributes) => direct(attributes, 'key'));
  const clefs = attributeNodes.flatMap((attributes) => direct(attributes, 'clef'));
  console.log(`PS6B_KEY_CLEF_INVENTORY=${JSON.stringify({
    keyCount: keys.length,
    keySamples: keys.slice(0, 10).map(compactNode),
    clefCount: clefs.length,
    clefSamples: clefs.slice(0, 40).map(compactNode),
  })}`);

  projection = projectParsedMusicXmlWithOctaveShiftCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  const source = projection.sourceModel;
  const voices = [...new Set(source.measures.flatMap((measure) => (
    measure.events.map((event) => `${event.staff}:${event.voice}`)
  )))].sort();
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    staffVoiceIds: voices,
    ignoredDirectionCount: projection.ignoredDirectionCount,
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
