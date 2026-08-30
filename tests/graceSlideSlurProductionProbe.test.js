'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  processMusicXmlUpload,
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
} = require('../src/app/musicXmlUploadRuntime');

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>grace slide slur probe</part-name></score-part></part-list>
  <part id="P1">
    <measure number="86">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note>
        <grace slash="yes"/>
        <pitch><step>C</step><octave>4</octave></pitch>
        <voice>1</voice><type>32nd</type><stem>up</stem><notehead>normal</notehead><staff>1</staff>
        <notations>
          <technical><string>2</string><fret>1</fret></technical>
          <slur type="start"/>
          <slide number="5" type="start"/>
        </notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff>
        <notations>
          <technical><string>2</string><fret>3</fret></technical>
          <slur type="stop"/>
          <slide number="5" type="stop"/>
        </notations>
      </note>
      <backup><duration>16</duration></backup>
      <note><rest/><duration>16</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('exact Guitar Pro-style grace slur+slide pair reaches POLY_V2 production path', () => {
  const bytes = Buffer.from(SOURCE);
  const before = Buffer.from(bytes);
  const result = processMusicXmlUpload({ fileName: 'grace-slide-slur-probe.musicxml', bytes });

  assert.equal(
    result.status,
    MUSICXML_UPLOAD_STATUS.PASS,
    JSON.stringify({ status: result.status, route: result.route, issues: result.preflight?.issues }, null, 2),
  );
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(Buffer.compare(bytes, before), 0, 'source bytes must remain immutable');
  assert.equal(result.musicXml.includes('<type>32nd</type>'), true);
  assert.equal(result.musicXml.includes('<duration>'), true, 'anchor/rest durations remain present');
});
