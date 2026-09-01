from pathlib import Path

runtime_path = Path('src/app/musicXmlUploadRuntime.js')
test_path = Path('tests/customTuningUploadRuntime.test.js')

runtime = runtime_path.read_text(encoding='utf-8')
old_helper = '''function hasLegacyTabPresentationOnlyTuning(parsedDocument) {
  const pending = [parsedDocument.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.name === 'attributes') {
      for (const staffDetails of directMusicXmlChildren(node, 'staff-details')) {
        const hasTuning = directMusicXmlChildren(staffDetails, 'staff-tuning').length > 0;
        const hasCapo = directMusicXmlChildren(staffDetails, 'capo').length > 0;
        const staffNumber = musicXmlAttribute(staffDetails, 'number') || '1';
        if (hasTuning && !hasCapo && hasTabClefForStaff(node, staffNumber)) return true;
      }
    }
    for (const child of node.children) pending.push(child);
  }
  return false;
}
'''
new_helper = '''function isWellFormedLegacyPartialTabTuning(staffDetails) {
  const tuningNodes = directMusicXmlChildren(staffDetails, 'staff-tuning');
  const capoNodes = directMusicXmlChildren(staffDetails, 'capo');
  const staffLinesNodes = directMusicXmlChildren(staffDetails, 'staff-lines');

  if (
    tuningNodes.length < 1
    || tuningNodes.length >= 6
    || capoNodes.length !== 0
    || staffLinesNodes.length !== 1
    || staffLinesNodes[0].children.length !== 0
    || staffLinesNodes[0].text.trim() !== '6'
  ) {
    return false;
  }

  const seenLines = new Set();
  for (const tuningNode of tuningNodes) {
    if (tuningNode.attributes.some((item) => item.uri.length !== 0 || item.name !== 'line')) {
      return false;
    }
    const lineAttributes = tuningNode.attributes.filter(
      (item) => item.uri.length === 0 && item.name === 'line',
    );
    if (lineAttributes.length !== 1 || !/^[1-6]$/.test(lineAttributes[0].value)) return false;
    if (seenLines.has(lineAttributes[0].value)) return false;
    seenLines.add(lineAttributes[0].value);

    if (tuningNode.children.some((child) => child.uri !== tuningNode.uri)) return false;
    const children = tuningNode.children;
    if (children.some((child) => !['tuning-step', 'tuning-alter', 'tuning-octave'].includes(child.name))) {
      return false;
    }
    const steps = directMusicXmlChildren(tuningNode, 'tuning-step');
    const alters = directMusicXmlChildren(tuningNode, 'tuning-alter');
    const octaves = directMusicXmlChildren(tuningNode, 'tuning-octave');
    if (steps.length !== 1 || alters.length > 1 || octaves.length !== 1) return false;
    if (steps[0].children.length !== 0 || !/^[A-G]$/.test(steps[0].text.trim())) return false;
    if (octaves[0].children.length !== 0 || !/^[0-9]$/.test(octaves[0].text.trim())) return false;
    if (alters.length === 1) {
      if (alters[0].children.length !== 0 || !/^-?\\d+$/.test(alters[0].text.trim())) return false;
      const alter = Number.parseInt(alters[0].text.trim(), 10);
      if (alter < -2 || alter > 2) return false;
    }
  }

  return true;
}

function isLegacyTabPresentationOnlyTuningError(parsedDocument, error) {
  if (
    error?.code !== 'INVALID_GUITAR_CONFIGURATION_PROVENANCE'
    || error?.message !== 'Explicit MusicXML guitar tuning requires six staff-tuning elements.'
    || !Number.isInteger(error?.details?.tuningCount)
    || error.details.tuningCount < 1
    || error.details.tuningCount >= 6
    || error?.details?.capoCount !== 0
  ) {
    return false;
  }

  let presentationBlockCount = 0;
  const pending = [parsedDocument.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.name === 'attributes') {
      for (const staffDetails of directMusicXmlChildren(node, 'staff-details')) {
        const tuningNodes = directMusicXmlChildren(staffDetails, 'staff-tuning');
        const capoNodes = directMusicXmlChildren(staffDetails, 'capo');
        if (tuningNodes.length === 0 && capoNodes.length === 0) continue;
        const staffNumber = musicXmlAttribute(staffDetails, 'number') || '1';
        if (
          !hasTabClefForStaff(node, staffNumber)
          || !isWellFormedLegacyPartialTabTuning(staffDetails)
        ) {
          return false;
        }
        presentationBlockCount += 1;
      }
    }
    for (const child of node.children) pending.push(child);
  }

  return presentationBlockCount > 0;
}
'''
if runtime.count(old_helper) != 1:
    raise SystemExit('Expected exactly one legacy fallback helper')
runtime = runtime.replace(old_helper, new_helper)
old_condition = '    if (hasLegacyTabPresentationOnlyTuning(parsedDocument)) {'
new_condition = '    if (isLegacyTabPresentationOnlyTuningError(parsedDocument, error)) {'
if runtime.count(old_condition) != 1:
    raise SystemExit('Expected exactly one legacy fallback catch condition')
runtime = runtime.replace(old_condition, new_condition)
runtime_path.write_text(runtime, encoding='utf-8')

tests = test_path.read_text(encoding='utf-8')
marker = "test('partial tuning without capo becomes explicit fail-closed provenance instead of being guessed', () => {"
if marker not in tests:
    raise SystemExit('Expected custom tuning runtime test marker')

addition = r'''

test('malformed partial TAB tuning is not downgraded to presentation-only provenance', () => {
  const bytes = score({
    staffDetailsXml: '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>H</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details><clef><sign>TAB</sign><line>5</line></clef>',
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'malformed-tab-partial.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('conflicting complete TAB tunings remain fail-closed', () => {
  const bytes = score({
    staffDetailsXml: `${staffDetails(STANDARD_LOW_TO_HIGH)}${staffDetails(DROP_D_LOW_TO_HIGH)}<clef><sign>TAB</sign><line>5</line></clef>`,
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'conflicting-tab-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'AMBIGUOUS_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('mid-score TAB retuning remains fail-closed', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails(STANDARD_LOW_TO_HIGH)}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
<measure number="2"><attributes>${staffDetails(DROP_D_LOW_TO_HIGH)}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
</part></score-partwise>`);
  const result = processMusicXmlUpload({ fileName: 'mid-score-tab-retuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});
'''
if "malformed partial TAB tuning is not downgraded" in tests:
    raise SystemExit('Safety tests already present')
tests = tests.rstrip() + addition + '\n'
test_path.write_text(tests, encoding='utf-8')
