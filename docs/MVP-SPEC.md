# MusicXML to Guitar TAB Engine — MVP Specification

## 1. Project Purpose

The purpose of this project is to convert MusicXML scores into playable six-string guitar tablature.

The engine will:

1. Read musical notes, measures, rests and rhythm values from MusicXML.
2. Calculate all playable guitar string and fret positions for each note.
3. Select a consistent and playable fingering sequence.
4. Generate structured Guitar TAB output.
5. Preserve the original musical timing and measure structure.
6. Prepare output that can later be rendered as an editable score and PDF.

The project is independent from the existing SesliTab application.

## 2. Processing Flow

```text
MusicXML input
       ↓
MusicXML validation
       ↓
Note and rhythm parsing
       ↓
Pitch normalization
       ↓
Guitar string and fret candidate calculation
       ↓
Playable fingering selection
       ↓
Structured TAB data
       ↓
JSON / ASCII TAB / TAB MusicXML
       ↓
PDF rendering
```

## 3. Input

### Supported in the first version

- Uncompressed MusicXML files: `.musicxml` and `.xml`
- MusicXML `score-partwise` structure
- A single musical part
- A single melodic voice
- Notes, rests and measures
- Pitch information: `step`, `alter`, `octave`
- Rhythm information: `divisions`, `duration`, `type`, `dot`
- Time signatures
- Ties where they can be preserved safely

### Planned later

- Compressed MusicXML (`.mxl`)
- Multiple parts
- Multiple voices
- Polyphonic classical guitar scores
- Cross-staff notation
- Irregular tuplets
- Grace notes
- Alternative guitar tunings

## 4. Guitar Configuration

The first version will use standard six-string guitar tuning:

```text
String 6: E2
String 5: A2
String 4: D3
String 3: G3
String 2: B3
String 1: E4
```

### Fret range

```text
Minimum fret: 0
Maximum fret: 20
```

Open strings use fret `0`.

The fret limit must be configurable internally so that future versions can support 22, 24 or more frets.

## 5. Core Data Model

Each musical event will be represented independently from its visual output.

```json
{
  "measure": 1,
  "eventIndex": 0,
  "pitch": {
    "step": "C",
    "alter": 0,
    "octave": 4,
    "midi": 60
  },
  "rhythm": {
    "duration": 1,
    "type": "quarter",
    "dots": 0
  },
  "position": {
    "string": 2,
    "fret": 1
  },
  "confidence": 1,
  "requiresTeacherReview": false
}
```

The structured data model will be the primary result. ASCII TAB, MusicXML and PDF will be generated from this model.

## 6. Fretboard Calculation

For every parsed pitch, the engine must calculate all valid guitar positions within the configured fret range.

Example for `C4`:

```json
[
  { "string": 2, "fret": 1 },
  { "string": 3, "fret": 5 },
  { "string": 4, "fret": 10 },
  { "string": 5, "fret": 15 },
  { "string": 6, "fret": 20 }
]
```

The engine must reject:

- Negative fret values
- Fret values above the configured limit
- Notes below the lowest playable pitch
- Notes above the highest playable pitch
- Invalid or incomplete pitch definitions

## 7. Fingering Selection

The first fingering algorithm must select a valid and reasonably playable sequence.

The initial cost model should consider:

- Distance from the previous fret
- Size of position shifts
- Number of string changes
- Excessive movement between low and high strings
- Preference for lower positions
- Optional preference for open strings
- Avoidance of unnecessary large stretches

The first version does not need to produce the only or universally best fingering. Its goal is to produce a valid, playable and internally consistent Guitar TAB result.

Every selected position must also retain the other possible positions for future teacher review or alternative fingering generation.

## 8. Outputs

### 8.1 Structured JSON

The primary machine-readable output must contain:

- Original pitch
- Rhythm information
- Measure number
- Event order
- Selected string
- Selected fret
- Alternative positions
- Validation warnings
- Teacher-review status

### 8.2 ASCII Guitar TAB

A simple text representation intended for debugging, quick inspection, basic sharing and automated tests.

ASCII TAB is not the authoritative data source.

### 8.3 Guitar TAB MusicXML

The engine should generate MusicXML containing:

- Six-line TAB staff
- TAB clef
- Standard guitar tuning
- Original note durations
- Original measure structure
- String numbers
- Fret numbers
- Technical notation using MusicXML string and fret elements

Where possible, the output should support standard notation above and Guitar TAB below. The first implementation may begin with TAB-only MusicXML if combined notation introduces unnecessary complexity.

### 8.4 PDF

PDF output will be produced from generated TAB MusicXML through a separate rendering component.

The initial PDF layout should support:

- A4 portrait
- Title
- Measure numbers
- Standard notation and TAB together
- Readable fret numbers
- Preserved rhythm beams and note stems
- Page numbers

PDF rendering is part of the planned product architecture, but the core conversion engine must remain functional if PDF rendering fails or is unavailable.

## 9. Rhythm Preservation

The engine must preserve musical timing from the input MusicXML.

The first version should retain:

- Whole notes
- Half notes
- Quarter notes
- Eighth notes
- Sixteenth notes
- Dotted values
- Rests
- Measure boundaries
- Time signatures
- Ties where supported

Rhythm values must not be inferred from visual TAB images. They must come directly from MusicXML data.

TAB rhythm stems and beams in the final PDF must be generated from these MusicXML rhythm values.

## 10. Validation and Error Handling

The engine must reject invalid input safely.

Required error codes:

```text
EMPTY_INPUT
FILE_TOO_LARGE
INVALID_XML
INVALID_MUSICXML
UNSUPPORTED_SCORE_FORMAT
UNSUPPORTED_MULTIPART_SCORE
UNSUPPORTED_POLYPHONY
INVALID_PITCH
UNPLAYABLE_NOTE
INVALID_DURATION
CONVERSION_FAILED
TAB_MUSICXML_GENERATION_FAILED
PDF_RENDERING_FAILED
```

Errors must:

- Be understandable
- Not expose server paths
- Not expose environment variables
- Not expose command output containing sensitive information
- Identify the affected measure and note where possible

One unsupported note must not silently produce an incorrect fret number.

## 11. Security Requirements

### XML safety

The parser must:

- Disable external XML entities
- Disable network access
- Reject document type declarations where appropriate
- Limit XML nesting depth
- Limit total element count
- Limit input file size
- Reject malformed XML
- Avoid evaluating embedded scripts or expressions

### File safety

The system must:

- Use isolated temporary directories
- Never overwrite the input file
- Never access unrelated project folders
- Validate output paths
- Prevent directory traversal
- Delete only temporary files created by the current operation

### Process safety

External PDF rendering processes must:

- Run without a shell
- Use fixed executable paths
- Receive validated arguments
- Have a strict timeout
- Have memory and concurrency limits
- Have no unnecessary network access

### Project isolation

This repository must not:

- Modify the SesliTab repository
- Modify Audiveris files
- Modify `.omr` files
- Modify existing HTML files
- Share writable storage with the existing OMR service
- Require access to SesliTab source code

Future integration must use a documented API or exported MusicXML files.

## 12. Initial Limitations

The first version will not attempt to support:

- Direct PDF input
- Optical music recognition
- Audiveris execution
- TAB image recognition
- Multiple instruments
- Multiple simultaneous voices
- Complex classical guitar polyphony
- Automatic right-hand fingering
- Left-hand finger numbers
- Barres
- Harmonics
- Bends
- Slides
- Hammer-ons
- Pull-offs
- Tremolo notation
- Scordatura
- Capo transposition
- Automatic student delivery

These features may be added only after the core conversion is validated.

## 13. Teacher Review

All educational output must initially be marked as requiring teacher review.

The engine should provide:

- Selected position
- Alternative positions
- Warnings
- Unplayable notes
- Large position shifts
- Low-confidence conversion decisions

The first version must not claim that an automatically generated fingering is pedagogically optimal.

## 14. MVP Acceptance Criteria

The MVP will be considered successful when it can:

1. Read a valid single-part, monophonic MusicXML file.
2. Preserve its notes, rests, measures and basic rhythm values.
3. Calculate all valid string and fret positions for each playable note.
4. Reject pitches outside the configured guitar range.
5. Select a complete playable fingering sequence.
6. Produce valid structured JSON.
7. Produce readable ASCII Guitar TAB.
8. Produce valid TAB MusicXML.
9. Preserve measure order and note durations.
10. Return explicit errors instead of silently producing invalid TAB.
11. Pass automated tests for fretboard mathematics and MusicXML parsing.
12. Convert a controlled set of real MusicXML examples correctly.
13. Keep all work isolated from SesliTab, Audiveris, OMR and HTML files.

PDF export will be accepted as a separate rendering milestone after the TAB MusicXML output has been validated.

## 15. Initial Test Material

The first controlled test set should contain:

- Open-string exercise
- C major scale
- Chromatic scale
- Melody using accidentals
- Melody containing rests
- Dotted rhythm example
- Eighth-note beam example
- Sixteenth-note beam example
- Melody requiring a position shift
- Lowest playable guitar note
- Highest supported note
- One note below the guitar range
- One note above the configured range
- Malformed XML file
- Unsupported polyphonic MusicXML file

## 16. Future Visual Dataset Project

A separate future repository may be created:

```text
tab-rhythm-visual-dataset
```

Its purpose will be to collect and label visual examples of:

- TAB fret numbers
- Rhythm stems
- Beams
- Measure lines
- Chords
- Rests
- Guitar techniques
- Clean digital scores
- Scanned and photographed pages

This visual dataset project will remain independent from the MusicXML conversion engine.

The shared connection between the projects will be a documented event-data schema, not shared source code or shared writable storage.
