'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlWithTripletDisplayCompatibility,
} = require('../src/parser/polyphonicTripletDisplayNormalizer');
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

function attrMap(node) {
  return Object.fromEntries(node.attributes.map((attribute) => [attribute.name, attribute.value]));
}

function childSummary(node) {
  return node.children
    .filter((child) => child.uri === node.uri)
    .map((child) => ({
      name: child.name,
      text: child.text.trim(),
      attributes: attrMap(child),
      children: child.children
        .filter((grandchild) => grandchild.uri === child.uri)
        .map((grandchild) => ({
          name: grandchild.name,
          text: grandchild.text.trim(),
          attributes: attrMap(grandchild),
          children: grandchild.children
            .filter((greatGrandchild) => greatGrandchild.uri === grandchild.uri)
            .map((greatGrandchild) => ({
              name: greatGrandchild.name,
              text: greatGrandchild.text.trim(),
              attributes: attrMap(greatGrandchild),
            })),
        })),
    }));
}

function compactNote(note) {
  if (!note) return null;
  return {
    attributes: attrMap(note),
    children: childSummary(note),
  };
}

function graceInventory(root) {
  const result = [];
  const parts = root.children.filter((child) => child.uri === root.uri && child.name === 'part');
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    const measures = part.children.filter((child) => child.uri === part.uri && child.name === 'measure');
    for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
      const measure = measures[measureIndex];
      const measureNumber = measure.attributes.find(
        (attribute) => attribute.uri.length === 0 && attribute.name === 'number',
      )?.value ?? null;
      const notes = measure.children.filter((child) => child.uri === measure.uri && child.name === 'note');
      for (let sourceOrder = 0; sourceOrder < notes.length; sourceOrder += 1) {
        const note = notes[sourceOrder];
        const grace = note.children.find((child) => child.uri === note.uri && child.name === 'grace');
        if (!grace) continue;
        result.push({
          partIndex,
          measureIndex,
          measureNumber,
          sourceOrder,
          grace: compactNote(note),
          previousNote: compactNote(notes[sourceOrder - 1]),
          nextNote: compactNote(notes[sourceOrder + 1]),
        });
      }
    }
  }
  return result;
}

const xml = fs.readFileSync(inputPath, 'utf8');
const parsed = parseParsedMusicXmlDocument(xml, {}, createMusicXmlProcessingRuntime());
console.log(`PS6B_GRACE_INVENTORY=${JSON.stringify(graceInventory(parsed.root))}`);

let projection;
try {
  projection = projectParsedMusicXmlWithTripletDisplayCompatibility(
    parsed,
    createMusicXmlProcessingRuntime(),
  );
  const source = projection.sourceModel;
  console.log(`PS6B_PROJECTOR=${JSON.stringify({
    status: 'PASS',
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    tripletTimeModificationMarkerCount: projection.tripletTimeModificationMarkers.length,
    tripletDisplayMarkerCount: projection.tripletDisplayMarkers.length,
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
