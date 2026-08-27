'use strict';

const fs = require('node:fs');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { normalizePolyphonicPresentationMetadata } = require('../src/parser/polyphonicPresentationMetadataNormalizer');

const inputPath = process.argv[2];
if (!inputPath) throw new Error('MusicXML path is required.');
const parsed = parseParsedMusicXmlDocument(
  fs.readFileSync(inputPath, 'utf8'),
  {},
  createMusicXmlProcessingRuntime(),
);
const normalized = normalizePolyphonicPresentationMetadata(
  parsed,
  createMusicXmlProcessingRuntime(),
).parsedDocument;
const root = normalized.root;
const direct = (node, name = null) => node.children.filter((child) => (
  child.uri === node.uri && (name === null || child.name === name)
));
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const mapObject = (map) => Object.fromEntries([...map].sort((a, b) => a[0].localeCompare(b[0])));
const attrSig = (node) => node.attributes
  .filter((attribute) => attribute.uri.length === 0)
  .map((attribute) => `${attribute.name}=${attribute.value}`)
  .sort()
  .join('|') || '(none)';

const directionChildCounts = new Map();
const directionAttrSignatures = new Map();
const typeCounts = new Map();
const typeAttrSignatures = new Map();
const directionExtraChildren = new Map();
const octaveShiftSamples = [];
let directionCount = 0;

for (const part of direct(root, 'part')) {
  for (const measure of direct(part, 'measure')) {
    for (const direction of direct(measure, 'direction')) {
      directionCount += 1;
      bump(directionAttrSignatures, attrSig(direction));
      for (const child of direct(direction)) {
        bump(directionChildCounts, child.name);
        if (child.name !== 'direction-type') bump(directionExtraChildren, child.name);
      }
      for (const directionType of direct(direction, 'direction-type')) {
        for (const type of direct(directionType)) {
          bump(typeCounts, type.name);
          bump(typeAttrSignatures, `${type.name}|${attrSig(type)}`);
          if (type.name === 'octave-shift' && octaveShiftSamples.length < 20) {
            octaveShiftSamples.push({ attributes: attrSig(type), text: type.text.trim() });
          }
        }
      }
    }
  }
}

console.log(`PS6B_DIRECTION_INVENTORY=${JSON.stringify({
  directionCount,
  directionChildCounts: mapObject(directionChildCounts),
  directionAttrSignatures: mapObject(directionAttrSignatures),
  directionExtraChildren: mapObject(directionExtraChildren),
  typeCounts: mapObject(typeCounts),
  typeAttrSignatures: mapObject(typeAttrSignatures),
  octaveShiftSamples,
})}`);
