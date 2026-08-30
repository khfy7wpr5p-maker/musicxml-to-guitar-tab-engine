'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

function mirroredGraceScore({ tabAnchorStep = 'F', tabSecondGraceStep = 'G' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <defaults/>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef>
      <clef number="2"><sign>TAB</sign><line>5</line></clef>
    </attributes>
    <note><grace slash="yes"/><pitch><step>F</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff><beam number="1">begin</beam></note>
    <note><grace slash="yes"/><pitch><step>G</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff><beam number="1">end</beam></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>16</duration></backup>
    <note><grace slash="yes"/><pitch><step>F</step><octave>4</octave></pitch><voice>2</voice><type>eighth</type><stem>up</stem><staff>2</staff><beam number="1">begin</beam></note>
    <note><grace slash="yes"/><pitch><step>${tabSecondGraceStep}</step><octave>4</octave></pitch><voice>2</voice><type>eighth</type><stem>up</stem><staff>2</staff><beam number="1">end</beam></note>
    <note><pitch><step>${tabAnchorStep}</step><octave>4</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
  </measure></part>
</score-partwise>`;
}

function graceBodies(xml) {
  return [...xml.matchAll(/<note><grace slash="yes"\/>[\s\S]*?<\/note>/g)].map((match) => match[0]);
}

test('exact TAB mirror collapse runs after display normalization and retains only verified staff-1 grace anchors', () => {
  const bytes = Buffer.from(mirroredGraceScore());
  const before = Buffer.from(bytes);
  const result = processMusicXmlUpload({ fileName: 'normalized-tab-mirror.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(result.normalization, {
    tabStaffMirrorCollapsed: true,
    collapsedStaff: 2,
    omittedRepresentationNoteCount: 1,
  });
  assert.equal(Buffer.compare(bytes, before), 0, 'source upload bytes must remain immutable');
  assert.equal(result.canonicalTabResult.noteDispositions.length, 1);
  assert.equal(result.canonicalTabResult.noteDispositions[0].disposition, 'KEEP');

  const bodies = graceBodies(result.musicXml);
  assert.equal(bodies.length, 4, 'only the verified staff-1 grace group is materialized twice');
  assert.equal(bodies.every((body) => !body.includes('<duration>')), true);
  assert.equal(bodies.filter((body) => body.includes('<step>G</step>')).length, 2);
});

test('a non-exact TAB grace or anchor counterpart is never collapsed as representation-only material', () => {
  for (const [name, source] of [
    ['grace', mirroredGraceScore({ tabSecondGraceStep: 'F' })],
    ['anchor', mirroredGraceScore({ tabAnchorStep: 'E' })],
  ]) {
    const result = processMusicXmlUpload({
      fileName: `non-mirrored-${name}.musicxml`,
      bytes: Buffer.from(source),
    });

    assert.equal(result.normalization.tabStaffMirrorCollapsed, false, name);
    assert.equal(result.normalization.collapsedStaff, null, name);
    assert.equal(result.normalization.omittedRepresentationNoteCount, 0, name);
  }
});
