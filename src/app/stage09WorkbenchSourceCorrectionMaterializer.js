'use strict';

const { EngineError } = require('../errors/engineError');
const { createSourceEventId } = require('../music/polyphonicSourceModel');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');

const STAGE09_WORKBENCH_SOURCE_MATERIALIZER_VERSION = '1.0.0';
const ACCIDENTAL_TEXT = Object.freeze({
  '-2': 'flat-flat',
  '-1': 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'double-sharp',
});

class Stage09WorkbenchSourceMaterializerError extends EngineError {
  constructor(message, code = 'STAGE09_SOURCE_MATERIALIZATION_FAILED', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'Stage09WorkbenchSourceMaterializerError');
  }
}

function fail(message, code, details = {}) {
  throw new Stage09WorkbenchSourceMaterializerError(message, code, details);
}

function cloneNode(node) {
  return {
    name: node.name,
    uri: node.uri,
    attributes: node.attributes.map((attribute) => ({ ...attribute })),
    text: node.text,
    children: node.children.map(cloneNode),
  };
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function attributeValue(node, name) {
  const matches = node.attributes.filter((attribute) => attribute.uri.length === 0 && attribute.name === name);
  if (matches.length !== 1) fail(`${node.name} must contain exactly one ${name} attribute.`, 'SOURCE_IDENTITY_MISMATCH');
  return matches[0].value;
}

function exactLeaf(node, field) {
  if (!node || node.children.length !== 0 || node.attributes.length !== 0) {
    fail(`${field} must be an attribute-free scalar leaf.`, 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', { field });
  }
  return node;
}

function requireOne(node, name, field) {
  const matches = directChildren(node, name);
  if (matches.length !== 1) {
    fail(`${field} must contain exactly one ${name}.`, 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', {
      field,
      child: name,
      observedCount: matches.length,
    });
  }
  return matches[0];
}

function optionalOne(node, name, field) {
  const matches = directChildren(node, name);
  if (matches.length > 1) {
    fail(`${field} may contain at most one ${name}.`, 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', {
      field,
      child: name,
      observedCount: matches.length,
    });
  }
  return matches[0] || null;
}

function normalizePitch(value, field) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !/^[A-G]$/.test(value.step || '')
    || !Number.isSafeInteger(value.alter)
    || value.alter < -2
    || value.alter > 2
    || !Number.isSafeInteger(value.octave)
    || value.octave < -1
    || value.octave > 9
  ) {
    fail(`${field} is not a supported exact pitch.`, 'INVALID_TEACHER_EDIT_EVIDENCE', { field });
  }
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[value.alter];
  const written = `${value.step}${accidental}${value.octave}`;
  if (typeof value.written === 'string' && value.written !== written) {
    fail(`${field}.written contradicts step/alter/octave.`, 'INVALID_TEACHER_EDIT_EVIDENCE', { field });
  }
  return Object.freeze({
    step: value.step,
    alter: value.alter,
    octave: value.octave,
    written,
  });
}

function pitchFromNode(noteNode, field) {
  if (directChildren(noteNode, 'rest').length !== 0) {
    fail('Teacher pitch correction target resolves to a rest.', 'SOURCE_EDIT_TARGET_MISMATCH', { field });
  }
  const pitchNode = requireOne(noteNode, 'pitch', field);
  const stepNode = exactLeaf(requireOne(pitchNode, 'step', `${field}.pitch`), `${field}.pitch.step`);
  const octaveNode = exactLeaf(requireOne(pitchNode, 'octave', `${field}.pitch`), `${field}.pitch.octave`);
  const alterNode = optionalOne(pitchNode, 'alter', `${field}.pitch`);
  if (alterNode) exactLeaf(alterNode, `${field}.pitch.alter`);
  const step = stepNode.text.trim();
  const alterText = alterNode ? alterNode.text.trim() : '0';
  const octaveText = octaveNode.text.trim();
  if (!/^[A-G]$/.test(step) || !/^-?\d+$/.test(alterText) || !/^-?\d+$/.test(octaveText)) {
    fail('Teacher pitch correction target has unsupported pitch scalars.', 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', { field });
  }
  const pitch = normalizePitch({
    step,
    alter: Number(alterText),
    octave: Number(octaveText),
  }, `${field}.sourcePitch`);
  return { pitchNode, stepNode, alterNode, octaveNode, pitch };
}

function samePitch(left, right) {
  return left.step === right.step && left.alter === right.alter && left.octave === right.octave;
}

function applyPitch(noteNode, after, field) {
  const located = pitchFromNode(noteNode, field);
  located.stepNode.text = after.step;
  located.octaveNode.text = String(after.octave);
  if (after.alter === 0) {
    if (located.alterNode) {
      located.pitchNode.children = located.pitchNode.children.filter((child) => child !== located.alterNode);
    }
  } else if (located.alterNode) {
    located.alterNode.text = String(after.alter);
  } else {
    const stepIndex = located.pitchNode.children.indexOf(located.stepNode);
    located.pitchNode.children.splice(stepIndex + 1, 0, {
      name: 'alter',
      uri: located.pitchNode.uri,
      attributes: [],
      text: String(after.alter),
      children: [],
    });
  }

  const accidental = optionalOne(noteNode, 'accidental', field);
  if (accidental) {
    exactLeaf(accidental, `${field}.accidental`);
    accidental.text = ACCIDENTAL_TEXT[after.alter];
  }
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serializeNode(node, parentUri = null) {
  if (node.children.length > 0 && node.text.trim().length > 0) {
    fail('Mixed-content MusicXML nodes are unsupported by Stage 09 source materialization.', 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', {
      node: node.name,
    });
  }
  if (node.children.some((child) => child.uri !== node.uri)) {
    fail('Foreign-namespace MusicXML children are unsupported by Stage 09 source materialization.', 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', {
      node: node.name,
    });
  }
  if (node.attributes.some((attribute) => attribute.uri.length > 0)) {
    fail('Namespaced MusicXML attributes are unsupported by Stage 09 source materialization.', 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', {
      node: node.name,
    });
  }
  const namespace = parentUri === null && node.uri ? ` xmlns="${escapeAttribute(node.uri)}"` : '';
  const attributes = node.attributes
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('');
  if (node.children.length === 0 && node.text.length === 0) return `<${node.name}${namespace}${attributes}/>`;
  const body = node.children.length > 0
    ? node.children.map((child) => serializeNode(child, node.uri)).join('')
    : escapeText(node.text);
  return `<${node.name}${namespace}${attributes}>${body}</${node.name}>`;
}

function materializeStage09WorkbenchPitchCorrections(originalBytes, appliedEdits) {
  if (!Buffer.isBuffer(originalBytes) && !(originalBytes instanceof Uint8Array)) {
    fail('originalBytes must be a Buffer or Uint8Array.', 'INVALID_TEACHER_EDIT_EVIDENCE');
  }
  if (!Array.isArray(appliedEdits) || appliedEdits.length === 0) {
    fail('A non-empty Workbench applied-edit ledger is required.', 'INVALID_TEACHER_EDIT_EVIDENCE');
  }

  const parsed = parseParsedMusicXmlDocument(Buffer.from(originalBytes));
  const root = cloneNode(parsed.root);
  const parts = directChildren(root, 'part');
  if (parts.length !== 1) {
    fail('Stage 09 pitch materialization currently requires exactly one MusicXML part.', 'UNSUPPORTED_SOURCE_CORRECTION_SHAPE', {
      observedPartCount: parts.length,
    });
  }
  const part = parts[0];
  const partId = attributeValue(part, 'id');
  const measures = directChildren(part, 'measure');

  for (let index = 0; index < appliedEdits.length; index += 1) {
    const edit = appliedEdits[index];
    if (
      !edit
      || typeof edit !== 'object'
      || Array.isArray(edit)
      || edit.commandType !== 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH'
      || edit.affectedEventCount !== 1
      || edit.selectedPosition
      || edit.assignmentMode
      || !Number.isSafeInteger(edit.measureIndex)
      || edit.measureIndex < 0
      || !Number.isSafeInteger(edit.sourceOrder)
      || edit.sourceOrder < 0
    ) {
      fail('Workbench edit cannot be materialized as an exact Stage 09 source pitch correction.', 'INVALID_TEACHER_EDIT_EVIDENCE', {
        revisionIndex: index,
      });
    }
    const measure = measures[edit.measureIndex];
    if (!measure) fail('Teacher edit measure no longer exists in the original source.', 'SOURCE_EDIT_TARGET_MISMATCH', { revisionIndex: index });
    const notes = directChildren(measure, 'note');
    const note = notes[edit.sourceOrder];
    if (!note) fail('Teacher edit note order no longer exists in the original source.', 'SOURCE_EDIT_TARGET_MISMATCH', { revisionIndex: index });
    const expectedEventId = createSourceEventId(partId, edit.measureIndex, edit.sourceOrder);
    if (edit.sourceEventId !== expectedEventId) {
      fail('Teacher edit source-event identity does not match the original source location.', 'SOURCE_EDIT_TARGET_MISMATCH', {
        revisionIndex: index,
        expectedEventId,
        observedEventId: edit.sourceEventId,
      });
    }
    const before = normalizePitch(edit.beforePitch, `appliedEdits[${index}].beforePitch`);
    const after = normalizePitch(edit.afterPitch, `appliedEdits[${index}].afterPitch`);
    if (samePitch(before, after)) {
      fail('Teacher pitch correction is a no-op.', 'INVALID_TEACHER_EDIT_EVIDENCE', { revisionIndex: index });
    }
    const located = pitchFromNode(note, `appliedEdits[${index}]`);
    if (!samePitch(located.pitch, before)) {
      fail('Teacher edit beforePitch does not match the exact original MusicXML note.', 'SOURCE_EDIT_TARGET_MISMATCH', {
        revisionIndex: index,
        expectedBefore: before.written,
        observedBefore: located.pitch.written,
      });
    }
    applyPitch(note, after, `appliedEdits[${index}]`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>${serializeNode(root)}`;
  const correctedBytes = Buffer.from(xml, 'utf8');
  parseParsedMusicXmlDocument(correctedBytes);
  return Object.freeze({
    documentType: 'Stage09WorkbenchCorrectedSource',
    contractVersion: STAGE09_WORKBENCH_SOURCE_MATERIALIZER_VERSION,
    correctedBytes,
  });
}

module.exports = {
  STAGE09_WORKBENCH_SOURCE_MATERIALIZER_VERSION,
  Stage09WorkbenchSourceMaterializerError,
  materializeStage09WorkbenchPitchCorrections,
};
