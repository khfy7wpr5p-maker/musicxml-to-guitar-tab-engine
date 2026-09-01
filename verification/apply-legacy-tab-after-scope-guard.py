from pathlib import Path

runtime_path = Path('src/app/musicXmlUploadRuntime.js')
test_path = Path('tests/customTuningUploadRuntime.test.js')
runtime = runtime_path.read_text(encoding='utf-8')

needle = "    : 'REVERSED_COMPLETE';\n"
if runtime.count(needle) != 1:
    raise SystemExit('Expected exactly one legacy tuning-shape terminator')

guard = '\n'.join([
    "  const partIndex = error?.details?.partIndex;",
    "  const measureIndex = error?.details?.measureIndex;",
    "  const childIndex = error?.details?.childIndex;",
    "  const staffDetailsIndex = error?.details?.staffDetailsIndex;",
    "  const staffNumber = error?.details?.staffNumber;",
    "  if (",
    "    !Number.isInteger(partIndex)",
    "    || !Number.isInteger(measureIndex)",
    "    || !Number.isInteger(childIndex)",
    "    || !Number.isInteger(staffDetailsIndex)",
    "    || typeof staffNumber !== 'string'",
    "    || measureIndex !== 0",
    "  ) return false;",
    "",
    "  const errorPart = directMusicXmlChildren(parsedDocument.root, 'part')[partIndex];",
    "  if (!errorPart) return false;",
    "  const errorMeasure = directMusicXmlChildren(errorPart, 'measure')[measureIndex];",
    "  if (!errorMeasure) return false;",
    "  const errorAttributes = errorMeasure.children[childIndex];",
    "  if (",
    "    !errorAttributes",
    "    || errorAttributes.uri !== errorMeasure.uri",
    "    || errorAttributes.name !== 'attributes'",
    "  ) return false;",
    "",
    "  for (let index = 0; index < childIndex; index += 1) {",
    "    const prior = errorMeasure.children[index];",
    "    if (prior.uri === errorMeasure.uri && ['note', 'backup', 'forward'].includes(prior.name)) {",
    "      return false;",
    "    }",
    "  }",
    "",
    "  const errorStaffDetails = directMusicXmlChildren(errorAttributes, 'staff-details')[staffDetailsIndex];",
    "  if (",
    "    !errorStaffDetails",
    "    || (musicXmlAttribute(errorStaffDetails, 'number') || '1') !== staffNumber",
    "    || !hasTabClefForStaff(errorAttributes, staffNumber)",
    "    || (expectedTuningShape === 'PARTIAL'",
    "      ? !isWellFormedLegacyPartialTabTuning(errorStaffDetails)",
    "      : !isWellFormedLegacyReversedTabTuning(errorStaffDetails))",
    "  ) return false;",
    "",
]) + '\n'
if "const measureIndex = error?.details?.measureIndex;" in runtime:
    raise SystemExit('After-scope guard already present')
runtime = runtime.replace(needle, needle + guard)
runtime_path.write_text(runtime, encoding='utf-8')

tests = test_path.read_text(encoding='utf-8').rstrip()
if 'lone reversed legacy TAB tuning after solve scope remains fail-closed' in tests:
    raise SystemExit('After-scope regression tests already present')

addition = r'''

test('lone reversed legacy TAB tuning after solve scope remains fail-closed', () => {
  const legacyTuning = legacyTabStaffDetails(STANDARD_LOW_TO_HIGH.slice().reverse());
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>${note('E', 4)}</measure>
<measure number="2"><attributes>${legacyTuning}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
</part></score-partwise>`);
  const original = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'late-lone-reversed-legacy-tab.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'late-lone-reversed-legacy-tab.musicxml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(first.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, original);
});

test('lone partial legacy TAB tuning after timing starts remains fail-closed', () => {
  const partialLegacyTuning = '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details>';
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
${note('E', 4)}
<attributes>${partialLegacyTuning}<clef><sign>TAB</sign><line>5</line></clef></attributes>
${note('F', 4)}
</measure></part></score-partwise>`);
  const original = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'after-timing-partial-legacy-tab.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'after-timing-partial-legacy-tab.musicxml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(first.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, original);
});
'''
test_path.write_text(tests + addition + '\n', encoding='utf-8')
