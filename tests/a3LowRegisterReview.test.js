'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

function twoVoiceScore(lowPitch) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Low register review</part-name></score-part></part-list>
<part id="P1"><measure number="2">
<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>${lowPitch.step}</step><octave>${lowPitch.octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<forward><duration>4</duration></forward>
</measure></part></score-partwise>`);
}

test('two-octave low-register displacement is review-only, deterministic, immutable, and teacher-editable', () => {
  const bytes = twoVoiceScore({ step: 'D', octave: 1 });
  const original = Buffer.from(bytes);

  const first = processMusicXmlUpload({ fileName: 'low-two-octaves.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'low-two-octaves.musicxml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, original);

  assert.equal(first.capabilities.generateTab, true);
  assert.equal(first.capabilities.export, false);
  assert.equal(first.capabilities.playback, 'APPROXIMATE');
  assert.equal(first.artifacts.provisionalTabAvailable, true);
  assert.equal(first.artifacts.canonicalTabAvailable, false);
  assert.equal(first.capabilities.editPitch, true);

  const displaced = first.canonicalTabResult.noteDispositions[0];
  assert.equal(displaced.disposition, 'KEEP');
  assert.equal(displaced.octaveShiftSemitones, 24);
  assert.equal(displaced.targetPitch.written, 'D3');
  assert.equal(displaced.targetPitch.midi, 50);
  assert.equal(displaced.ruleId, 'OCTAVE_NEAREST_IN_REGISTER');
  assert.equal(first.canonicalTabResult.measures[0].events[0].pitch.written, 'D1');

  const issue = first.preflight.issues.find(
    (entry) => entry.code === 'LOW_REGISTER_OCTAVE_DISPLACEMENT_REQUIRES_REVIEW',
  );
  assert.ok(issue);
  assert.equal(issue.reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(issue.location.measure, '2');
  assert.equal(issue.details.writtenPitch, 'D1');
  assert.equal(issue.details.sourceMidi, 26);
  assert.equal(issue.details.targetMidi, 50);
  assert.equal(issue.details.octaveShiftSemitones, 24);
  assert.equal(issue.details.sourceMusicXmlImmutable, true);
});

test('low-register notes requiring more than two octaves remain blocked', () => {
  const bytes = twoVoiceScore({ step: 'C', octave: 0 });
  const result = processMusicXmlUpload({ fileName: 'too-low.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNPLAYABLE_SOURCE_PITCH');
  assert.equal(result.preflight.issues[0].details.writtenPitch, 'C0');
  assert.equal(result.preflight.issues[0].details.permittedOctaveShiftSemitones, 24);
});
