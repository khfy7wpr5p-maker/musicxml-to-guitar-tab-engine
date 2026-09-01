from pathlib import Path
import re

# Upload admission.
path = Path('src/app/musicXmlUploadRuntime.js')
text = path.read_text()
text, count = re.subn(r"const \{ createGuitarConfiguration \} = require\('\.\./guitar/tuning'\);\n", '', text, count=1)
if count != 1: raise SystemExit('runtime createGuitarConfiguration import mismatch')
old_authority = """const {
  resolveGuitarConfigurationAuthority,
  sameConfiguration,
} = require('../guitar/guitarConfigurationAuthority');
"""
new_authority = """const {
  resolveGuitarConfigurationAuthority,
} = require('../guitar/guitarConfigurationAuthority');
"""
if text.count(old_authority) != 1: raise SystemExit('runtime authority import mismatch')
text = text.replace(old_authority, new_authority, 1)
text, count = re.subn(r"\nconst STANDARD_GUITAR = createGuitarConfiguration\(\);\n", '\n', text, count=1)
if count != 1: raise SystemExit('runtime STANDARD_GUITAR mismatch')
pattern = re.compile(
    r"function hasExplicitCapoDeclaration\(parsedDocument\) \{.*?\n\}\n\n"
    r"function assertSupportedSourceGuitarConfiguration\(parsedDocument\) \{.*?\n\}\n\n"
    r"function graceWriterTransitions", re.S,
)
replacement = """function assertSupportedSourceGuitarConfiguration(parsedDocument) {
  const sourceProvenance = extractMusicXmlGuitarConfigurationProvenance(parsedDocument);
  const resolved = resolveGuitarConfigurationAuthority({ sourceProvenance });

  if (sourceProvenance.status === 'ABSENT') {
    return Object.freeze({
      authority: resolved.authority,
      sourceStatus: sourceProvenance.status,
    });
  }

  return Object.freeze({
    authority: resolved.authority,
    sourceStatus: sourceProvenance.status,
    guitar: resolved.configuration,
  });
}

function graceWriterTransitions"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1: raise SystemExit('runtime source configuration guard mismatch')
text = text.replace(
    'Source note is outside the standard-guitar range and cannot be raised by exactly one octave.',
    'Source note is outside the configured guitar arrangement register and cannot be raised by exactly one octave.',
)
path.write_text(text)

# PA-6 reducer envelope.
path = Path('src/music/deterministicReductionPlan.js')
text = path.read_text()
old_import = "const { createGuitarConfiguration } = require('../guitar/tuning');\n"
new_import = "const { createGuitarArrangementRegister } = require('../guitar/guitarArrangementRegister');\n"
if text.count(old_import) != 1: raise SystemExit('PA-6 import mismatch')
text = text.replace(old_import, new_import, 1)
block = re.compile(
    r"\nconst STANDARD_CONFIGURATION = createGuitarConfiguration\(\);\n"
    r"let REGISTER_MINIMUM_MIDI = Number\.POSITIVE_INFINITY;\n"
    r"let REGISTER_MAXIMUM_MIDI = Number\.NEGATIVE_INFINITY;\n"
    r"for \(const string of STANDARD_CONFIGURATION\.tuning\) \{.*?\n\}\n", re.S,
)
text, count = block.subn('\n', text, count=1)
if count != 1: raise SystemExit('PA-6 fixed register block mismatch')
old = "function inRegister(midi) {\n  return midi >= REGISTER_MINIMUM_MIDI && midi <= REGISTER_MAXIMUM_MIDI;\n}"
new = "function inRegister(midi, registerEnvelope) {\n  return midi >= registerEnvelope.minimumMidi && midi <= registerEnvelope.maximumMidi;\n}"
if text.count(old) != 1: raise SystemExit('PA-6 inRegister mismatch')
text = text.replace(old, new, 1)
text = text.replace('function selectOctaveTarget(sourceMidi, runtime, details) {', 'function selectOctaveTarget(sourceMidi, runtime, details, registerEnvelope) {', 1)
text = text.replace('for (let targetMidi = REGISTER_MINIMUM_MIDI; targetMidi <= REGISTER_MAXIMUM_MIDI; targetMidi += 1) {', 'for (let targetMidi = registerEnvelope.minimumMidi; targetMidi <= registerEnvelope.maximumMidi; targetMidi += 1) {', 1)
text = text.replace('minimumMidi: REGISTER_MINIMUM_MIDI,\n      maximumMidi: REGISTER_MAXIMUM_MIDI,', 'minimumMidi: registerEnvelope.minimumMidi,\n      maximumMidi: registerEnvelope.maximumMidi,', 1)
text = text.replace('function instructionForSingleNote(event, decision, analysisEntry, runtime) {', 'function instructionForSingleNote(event, decision, analysisEntry, runtime, registerEnvelope) {', 1)
text = text.replace('if (!inRegister(event.pitch.midi)) {', 'if (!inRegister(event.pitch.midi, registerEnvelope)) {', 1)
text = text.replace('PRESERVED source pitch lies outside the fixed PA-6 register envelope.', 'PRESERVED source pitch lies outside the configured PA-6 register envelope.', 1)
old_select = """const targetMidi = selectOctaveTarget(event.pitch.midi, runtime, {
      sourceEventId: event.sourceEventId,
      decisionId: decision.decisionId,
    });"""
new_select = """const targetMidi = selectOctaveTarget(event.pitch.midi, runtime, {
      sourceEventId: event.sourceEventId,
      decisionId: decision.decisionId,
    }, registerEnvelope);"""
if text.count(old_select) != 1: raise SystemExit('PA-6 octave target call mismatch')
text = text.replace(old_select, new_select, 1)
text = text.replace('|| !inRegister(targetMidi)', '|| !inRegister(targetMidi, registerEnvelope)', 1)
text = text.replace('function buildChordReductionOutcomes(decision, notesById, analysisByEventId, runtime) {', 'function buildChordReductionOutcomes(decision, notesById, analysisByEventId, runtime, registerEnvelope) {', 1)
if text.count('if (!inRegister(event.pitch.midi)) {') != 1: raise SystemExit('PA-6 chord register check mismatch')
text = text.replace('if (!inRegister(event.pitch.midi)) {', 'if (!inRegister(event.pitch.midi, registerEnvelope)) {', 1)
text = text.replace('CHORD_REDUCED outer survivor lies outside the fixed PA-6 register envelope.', 'CHORD_REDUCED outer survivor lies outside the configured PA-6 register envelope.', 1)
old_sig = 'function createDeterministicReductionPlan(sourceModel, arrangementDecisions, runtime = null) {'
new_sig = 'function createDeterministicReductionPlan(sourceModel, arrangementDecisions, runtime = null, guitarOptions = {}) {'
if text.count(old_sig) != 1: raise SystemExit('PA-6 builder signature mismatch')
text = text.replace(old_sig, new_sig, 1)
anchor = """  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const arrangement = createGuitarArrangementPlan(source, arrangementDecisions, runtime);
  const analysis = createDeterministicVoiceAnalysis(source, runtime);
"""
if text.count(anchor) != 1: raise SystemExit('PA-6 builder anchor mismatch')
text = text.replace(anchor, anchor + "  const registerEnvelope = createGuitarArrangementRegister(guitarOptions);\n", 1)
old_group = """          analysisByEventId,
          runtime,
        );"""
new_group = """          analysisByEventId,
          runtime,
          registerEnvelope,
        );"""
if text.count(old_group) != 1: raise SystemExit('PA-6 group call mismatch')
text = text.replace(old_group, new_group, 1)
old_single = 'outcome = instructionForSingleNote(event, decision, analysisEntry, runtime);'
if text.count(old_single) != 1: raise SystemExit('PA-6 single call mismatch')
text = text.replace(old_single, 'outcome = instructionForSingleNote(event, decision, analysisEntry, runtime, registerEnvelope);', 1)
old_envelope = """registerEnvelope: Object.freeze({
      minimumMidi: REGISTER_MINIMUM_MIDI,
      maximumMidi: REGISTER_MAXIMUM_MIDI,
    }),"""
new_envelope = """registerEnvelope: Object.freeze({
      minimumMidi: registerEnvelope.minimumMidi,
      maximumMidi: registerEnvelope.maximumMidi,
    }),"""
if text.count(old_envelope) != 1: raise SystemExit('PA-6 result envelope mismatch')
text = text.replace(old_envelope, new_envelope, 1)
path.write_text(text)

# Internal callers that already own guitarOptions.
for file_name in [
    'src/tab/canonicalTabResultV2.js',
    'src/music/guitarVoicingCandidateModel.js',
    'src/music/deterministicPolyphonicFinalSelector.js',
]:
    p = Path(file_name)
    t = p.read_text()
    old = 'createDeterministicReductionPlan(source, arrangementDecisions, runtime)'
    if t.count(old) != 1: raise SystemExit(f'{file_name} PA-6 call mismatch')
    p.write_text(t.replace(old, 'createDeterministicReductionPlan(source, arrangementDecisions, runtime, guitarOptions)', 1))

# Sustained fallback.
p = Path('src/music/sustainedCanonicalSelectionBridgeV1.js')
t = p.read_text()
old = """function createSustainedCanonicalSelectionBridgeProjection(
  sourceModel,
  arrangementDecisions,
  runtime = null,
) {"""
new = """function createSustainedCanonicalSelectionBridgeProjection(
  sourceModel,
  arrangementDecisions,
  runtime = null,
  guitarOptions = {},
) {"""
if t.count(old) != 1: raise SystemExit('sustained bridge signature mismatch')
t = t.replace(old, new, 1)
old_call = """  const reductionPlan = createDeterministicReductionPlan(
    source,
    arrangementDecisions,
    runtime,
  );"""
new_call = """  const reductionPlan = createDeterministicReductionPlan(
    source,
    arrangementDecisions,
    runtime,
    guitarOptions,
  );"""
if t.count(old_call) != 1: raise SystemExit('sustained bridge reducer call mismatch')
p.write_text(t.replace(old_call, new_call, 1))

p = Path('src/music/sustainedCanonicalFinalSelector.js')
t = p.read_text()
old_call = """  const projection = createSustainedCanonicalSelectionBridgeProjection(
    sourceModel,
    arrangementDecisions,
    runtime,
  );"""
new_call = """  const projection = createSustainedCanonicalSelectionBridgeProjection(
    sourceModel,
    arrangementDecisions,
    runtime,
    guitarOptions,
  );"""
if t.count(old_call) != 1: raise SystemExit('sustained final bridge call mismatch')
p.write_text(t.replace(old_call, new_call, 1))
