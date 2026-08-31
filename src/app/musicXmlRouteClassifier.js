'use strict';

const MUSICXML_ROUTE_REQUIREMENT = Object.freeze({
  MONO_V1: 'MONO_V1',
  POLY_V2: 'POLY_V2',
});

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function trimmedText(node) {
  return typeof node.text === 'string' ? node.text.trim() : '';
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function routeRequirementFromParsedMusicXml(parsedDocument) {
  if (!parsedDocument || parsedDocument.documentType !== 'ParsedMusicXmlDocument') {
    throw new TypeError('parsedDocument must be a ParsedMusicXmlDocument.');
  }

  const voices = new Set();
  let polyphonic = false;

  walk(parsedDocument.root, (node) => {
    if (polyphonic) return;
    if (node.name === 'backup') {
      polyphonic = true;
      return;
    }
    if (node.name === 'attributes') {
      const staves = directChildren(node, 'staves');
      if (staves.some((staffCount) => /^\d+$/.test(trimmedText(staffCount)) && Number(trimmedText(staffCount)) > 1)) {
        polyphonic = true;
      }
      return;
    }
    if (node.name !== 'note') return;

    if (directChildren(node, 'chord').length > 0) {
      polyphonic = true;
      return;
    }
    const staff = directChildren(node, 'staff').at(-1);
    if (staff && trimmedText(staff) !== '1') {
      polyphonic = true;
      return;
    }
    const voice = directChildren(node, 'voice').at(-1);
    voices.add(voice ? trimmedText(voice) : '1');
    if (voices.size > 1) polyphonic = true;
  });

  return polyphonic
    ? MUSICXML_ROUTE_REQUIREMENT.POLY_V2
    : MUSICXML_ROUTE_REQUIREMENT.MONO_V1;
}

module.exports = {
  MUSICXML_ROUTE_REQUIREMENT,
  routeRequirementFromParsedMusicXml,
};
