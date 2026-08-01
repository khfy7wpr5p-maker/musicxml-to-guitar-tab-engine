# TAB MusicXML compatibility validation

Status date: 2026-08-01

This document records repeatable compatibility evidence for MusicXML generated
by `serializeCanonicalTabResultToMusicXml`. The validation does not add
alphaTab or MuseScore Studio as production dependencies and does not change
CanonicalTabResult, selected positions, candidate generation or fingering.

## Verdict

**Partially validated.**

- Static MusicXML and repository tests pass.
- The real alphaTab 1.8.4 MusicXML importer passes.
- The real alphaTab SVG renderer passes in Node.js.
- The real alphaTab browser renderer and external-media cursor pass in
  headless Chrome.
- A browser screenshot artifact confirms visible standard notation, six-line
  TAB, fret numbers including fret 10, beams, ties and cursor overlays.
- alphaTab synthesizer initialization remains unverified because alphaTab 1.8.4
  raises an internal recursive `loadedMidiInfo` error in the tested headless
  browser runtime before score, MIDI or SoundFont readiness.
- MuseScore Studio was not installed in the local environment or GitHub-hosted
  runner, so import and semantic round-trip were not executed.
- No MusicXML Writer defect was confirmed and production writer code was not
  changed.

## Scope and fixtures

### Single-note fixture

`tests/fixtures/canonical-tab-single-note.golden.musicxml`

- one quarter-note C4
- standard notation staff and TAB staff
- selected position: string 2, fret 1
- one measure with matching backup duration

### Five-measure compatibility fixture

`tests/fixtures/compatibility/canonicalTabCompatibilityFixture.js`

- five measures, including an implicit pickup
- non-numeric visible measure number
- 12 notes and 2 rests on each rendered staff
- whole, half, quarter, eighth and 16th durations
- dotted half note
- beam begin, continue and end
- tie start and stop
- natural, sharp and flat pitches
- open strings and fret 10
- selected C4 position string 3, fret 5
- alternative C4 position string 2, fret 1, which must not affect output

The larger MusicXML fixture is generated reproducibly without writing to the
repository:

```bash
node tests/compatibility/generateCompatibilityMusicXml.js > /tmp/canonical-tab-compatibility.musicxml
```

## Tested environment

GitHub-hosted runner:

- Ubuntu 24.04
- Node.js 18, 20 and 22
- alphaTab 1.8.4
- Google Chrome 150.0.7871.128
- puppeteer-core 25.3.0
- no MuseScore executable found

The browser package and alphaTab are installed only in the isolated CI
workspace with `--no-save --package-lock=false`. Neither package is added to
`package.json` or `package-lock.json`.

## Validation layers

### Static repository validation

```bash
npm ci --ignore-scripts
npm test
```

Result on Node.js 18, 20 and 22:

- 138 tests passed
- 0 failed
- 0 skipped
- dependency audit reported 0 vulnerabilities

The test suite verifies:

- well-formed UTF-8 XML
- no generated DTD, ENTITY or external URL
- score-partwise structure
- one guitar part with two staves
- standard G-clef staff
- six-line TAB-clef staff
- standard guitar tuning
- measure, event and rhythm order
- pitch, octave, duration, type, dots, ties and beams
- selected string and fret
- alternative positions cannot alter output
- no string or fret on rests
- deterministic output and input immutability

### alphaTab importer

```bash
npm install --no-save --package-lock=false --ignore-scripts @coderline/alphatab@1.8.4
ALPHATAB_EXPECTED_VERSION=1.8.4 node tests/compatibility/alphaTabMusicXmlSmoke.mjs
```

The importer test passes on Node.js 18, 20 and 22. Observed model:

```json
{
  "tracks": 1,
  "staves": 2,
  "measures": 5,
  "notesPerStaff": 12,
  "restsPerStaff": 2,
  "tuning": [64, 59, 55, 50, 45, 40],
  "firstSelectedPosition": { "string": 3, "fret": 5 },
  "doubleDigitFret": true,
  "tieOriginsPerStaff": 1,
  "explicitBeamBeatsPerStaff": 10,
  "synchronizedPlaybackStarts": true
}
```

The small single-note fixture also imports as string 2, fret 1.

### alphaTab low-level SVG renderer

```bash
node tests/compatibility/alphaTabSvgRendererSmoke.mjs
```

The renderer test passes on Node.js 18, 20 and 22. Observed result:

```json
{
  "alphaTabRenderer": "svg",
  "tracks": 1,
  "staves": 2,
  "measures": 5,
  "renderFragments": 3,
  "staffSystems": 1,
  "renderedBeatBounds": 28,
  "renderedNoteBounds": 24,
  "doubleDigitFret": true
}
```

This test exercises the real alphaTab `ScoreRenderer`, not a mock. It verifies
successful SVG generation, positive dimensions and rendered geometry for both
staves.

### alphaTab browser renderer and cursor

```bash
npm install --no-save --package-lock=false --ignore-scripts \
  @coderline/alphatab@1.8.4 puppeteer-core@25.3.0
BROWSER_EXECUTABLE=/path/to/preinstalled/chrome \
  node tests/compatibility/alphaTabBrowserRendererCursorValidated.mjs
```

The test uses an already installed Chrome executable. Puppeteer does not
download a browser. The test runs the real `AlphaTabApi` with SVG rendering,
loads the engine MusicXML through HTTP, waits for score, render and MIDI events,
and moves the external-media cursor to deterministic ticks.

Observed result:

```json
{
  "tracks": 1,
  "staves": 2,
  "measures": 5,
  "svgCount": 5,
  "width": 1280,
  "height": 666,
  "notationBeatBounds": 14,
  "tabBeatBounds": 14,
  "notationVisible": true,
  "tabVisible": true,
  "tuning": [64, 59, 55, 50, 45, 40],
  "fret10Model": true,
  "fret10Text": true,
  "barPlacementCount": 4,
  "beatPlacementCount": 4,
  "cursorBars": [0, 2, 3],
  "defaultBarCursors": 1,
  "defaultBeatCursors": 1,
  "firstTick": 0,
  "lastTick": 9600
}
```

The generated screenshot artifact was inspected and shows:

- standard notation and TAB together
- six TAB lines
- open-string and fretted values, including fret 10
- beam and tie rendering
- a bar highlight and beat cursor
- aligned measure systems

The screenshot is evidence for this fixture and environment only; it is not a
pixel-perfect regression contract.

### alphaTab synthesizer diagnostic

```bash
node tests/compatibility/alphaTabBrowserSynthSmoke.mjs
```

The test uses alphaTab's bundled `soundfont/sonivox.sf2` from the pinned package
and serves it from the isolated local HTTP server. No SoundFont is downloaded
from the network.

The diagnostic is intentionally non-blocking in CI. In Chrome 150 with alphaTab
1.8.4, synthesizer mode did not become ready. The browser reported an internal
recursive error in alphaTab's minified runtime:

```text
RangeError: Maximum call stack size exceeded
at get loadedMidiInfo (.../alphaTab.js:1:1)
```

Observed state before timeout:

```json
{
  "scoreLoaded": false,
  "midiLoaded": false,
  "soundFontLoaded": false,
  "playerReady": false,
  "actualPlayerMode": 2,
  "endTick": 0,
  "audioContextState": null
}
```

The failure occurs before the synthesizer reaches MusicXML score or SoundFont
readiness. The same MusicXML imports, renders and drives the external-media
cursor successfully. Therefore this is classified as an alphaTab 1.8.4
headless synthesizer/runtime limitation or test-environment interaction, not as
a demonstrated Writer defect.

### MuseScore Studio

The local environment and GitHub-hosted runner check these command names without
installing software:

```text
MuseScore4
musescore4
mscore4
MuseScore3
musescore3
mscore3
musescore
mscore
```

No executable was found. The following tests were not run:

- MusicXML import
- CLI warning inspection
- standard notation and TAB visual inspection
- MusicXML re-export
- semantic round-trip comparison
- PDF export

This is an environment evidence gap and is not evidence of compatibility or
incompatibility.

## Compatibility matrix

| Feature | Engine XML | alphaTab importer | alphaTab renderer | Cursor | MuseScore import | MuseScore round-trip |
|---|---|---|---|---|---|---|
| Single note | Pass | Pass | Pass | Partial | Not tested | Not tested |
| Standard notation staff | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Six-line TAB staff | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Selected string/fret | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Alternative positions ignored | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Standard tuning | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Open string | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Double-digit fret | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Notes and rests | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Rhythm values and dots | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Ties | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Beams | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Multiple measures and pickup | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Playback timing model | Pass | Pass | Pass | Pass | Not tested | Not tested |
| Synthesizer/audio initialization | N/A | N/A | N/A | N/A | N/A | N/A |
| MusicXML round-trip | N/A | N/A | N/A | N/A | Not tested | Not tested |

Synthesizer/audio initialization is separately classified as **Partial**:
initialization was attempted with a local bundled SoundFont, but alphaTab 1.8.4
did not reach `playerReady` in the tested headless runtime.

## Findings

### No confirmed MusicXML Writer defect

- Severity: none
- Confidence: high for the tested alphaTab paths
- Tool: alphaTab 1.8.4
- Fixture: both fixtures
- Expected: semantic data survives import and render
- Actual: importer, low-level renderer and browser renderer/cursor assertions pass
- Root cause: not applicable
- Writer defect: no
- Next step: no production writer change

### Browser renderer and cursor compatibility

- Severity: none
- Confidence: high for the tested fixture and Chrome version
- Tool: alphaTab 1.8.4 / Chrome 150
- Fixture: five-measure compatibility fixture
- Expected: standard notation, TAB, fret values and cursor geometry are created
- Actual: real SVG DOM, 28 beat bounds, visible fret 10 and cursor movement
  across bars 0, 2 and 3 were observed
- Root cause: not applicable
- Writer defect: no
- Next step: retain this smoke test as compatibility evidence

### alphaTab synthesizer does not reach readiness

- Severity: medium evidence gap
- Confidence: high for reproduction; medium for upstream root cause
- Tool: alphaTab 1.8.4 / headless Chrome 150
- Fixture: five-measure compatibility fixture
- Expected: score, MIDI and bundled SoundFont load, followed by `playerReady`
- Actual: internal `loadedMidiInfo` recursive RangeError before readiness
- Root cause: alphaTab/headless runtime path; the writer output is not reached by
  the failing synth initialization path
- Writer defect: no evidence
- Next step: repeat against a supported interactive browser/runtime or a newer
  pinned alphaTab version in a separate compatibility-only change

### MuseScore import and round-trip unavailable

- Severity: medium evidence gap
- Confidence: high
- Tool: MuseScore Studio
- Fixture: both fixtures
- Expected: import, visual verification and semantic round-trip
- Actual: executable unavailable locally and in CI
- Root cause: environment limitation; installation was outside approved scope
- Writer defect: undetermined
- Next step: execute the documented fixtures in an isolated environment with a
  preinstalled MuseScore Studio executable

## Production changes

No production source file was changed during compatibility validation:

- `src/writers/canonicalTabMusicXmlWriter.js` is unchanged
- selectedPosition behavior is unchanged
- alternativePositions remain non-authoritative
- no candidate generator or optimizer call was added
- no production alphaTab, Puppeteer or MuseScore dependency was added
- no CanonicalTabResult schema change was made

## CI workflow

`.github/workflows/musicxml-compatibility.yml` runs:

- full repository tests on Node.js 18, 20 and 22
- pinned alphaTab importer tests on Node.js 18, 20 and 22
- real alphaTab SVG renderer tests on Node.js 18, 20 and 22
- browser renderer and cursor validation in preinstalled Chrome
- a non-blocking synthesizer diagnostic
- a non-installing MuseScore CLI availability probe
- screenshot artifact upload for the browser renderer/cursor result

## Future polyphony boundary

The evidence applies only to the existing monophonic CanonicalTabResult
contract. Chords or independent voices require explicit simultaneous-event
identity, chord grouping, multiple voice timelines, voice-aware
backup/forward handling, tie identity across voices and a revised MusicXML
staff/voice mapping. None of those changes belong to this milestone.

## External references

- alphaTab introduction: https://www.alphatab.net/docs/introduction/
- alphaTab web setup: https://www.alphatab.net/docs/getting-started/browser/
- alphaTab player: https://www.alphatab.net/docs/guides/alphaSynth/
- alphaTab custom cursor: https://www.alphatab.net/docs/guides/custom-cursor/
- MuseScore CLI: https://handbook.musescore.org/appendix/command-line-usage
- MuseScore MusicXML: https://handbook.musescore.org/file-management/working-with-musicxml-files
