# MusicXML to Guitar TAB Engine — Architecture

## Current implementation authority

This document includes planned architecture as well as implemented behavior. For the current `CanonicalTabResult` contract, use the following sources in order:

1. `src/tab/canonicalTabResult.js`
2. the reviewed golden fixtures and canonical result tests
3. [`canonical-contract-audit.md`](./canonical-contract-audit.md)

[`DATA-CONTRACT.md`](./DATA-CONTRACT.md) is a deprecated historical draft until the shared schema and validator milestone is completed. Planned fields must not be treated as current runtime fields. Writers may validate and serialize the canonical result, but must not recalculate fingering or introduce undocumented result fields.

## 1. Architecture Goal

The system converts validated MusicXML scores into playable six-string guitar tablature while preserving musical timing, measure structure and pitch information.

The architecture separates:

- MusicXML parsing
- Musical data normalization
- Guitar fretboard calculation
- Fingering optimization
- Output generation
- PDF rendering

This separation allows each component to be tested independently and prevents PDF rendering or external tools from affecting the core conversion engine.

## 2. System Boundary

The engine begins with MusicXML and ends with Guitar TAB outputs.

```text
Input MusicXML
      ↓
MusicXML validation and parsing
      ↓
Normalized musical events
      ↓
Guitar position candidates
      ↓
Playable fingering selection
      ↓
Canonical TAB result
      ↓
JSON / ASCII TAB / TAB MusicXML / PDF
```

The engine does not:

- Read PDF scores directly
- Perform optical music recognition
- Run Audiveris
- Read or modify `.omr` files
- Access SesliTab source files
- Modify existing HTML files
- Share writable storage with the existing OMR service

PDF-to-MusicXML conversion remains outside this repository.

## 3. Repository Structure

Planned initial structure:

```text
musicxml-to-guitar-tab-engine/
│
├── docs/
│   ├── MVP-SPEC.md
│   └── ARCHITECTURE.md
│
├── src/
│   ├── parser/
│   │   ├── musicXmlValidator.js
│   │   ├── musicXmlParser.js
│   │   └── parserErrors.js
│   ├── music/
│   │   ├── pitch.js
│   │   ├── rhythm.js
│   │   ├── measure.js
│   │   └── eventModel.js
│   ├── guitar/
│   │   ├── tuning.js
│   │   ├── fretboard.js
│   │   ├── positionCandidate.js
│   │   └── playability.js
│   ├── fingering/
│   │   ├── costModel.js
│   │   ├── fingeringOptimizer.js
│   │   └── fingeringWarnings.js
│   ├── output/
│   │   ├── jsonWriter.js
│   │   ├── asciiTabWriter.js
│   │   ├── musicXmlTabWriter.js
│   │   └── pdfRenderer.js
│   ├── validation/
│   │   ├── inputLimits.js
│   │   ├── eventValidator.js
│   │   ├── resultValidator.js
│   │   └── securityValidator.js
│   ├── core/
│   │   ├── conversionPipeline.js
│   │   └── conversionResult.js
│   └── index.js
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── fixtures/
├── examples/
├── package.json
└── README.md
```

This structure is a plan. Source files will be added incrementally and only after explicit approval.

## 4. Core Architectural Principle

The canonical output of the conversion engine is structured event data.

PDF, ASCII TAB and output MusicXML are presentation formats derived from the same canonical result.

```text
                 ┌── JSON
Canonical TAB ───┼── ASCII TAB
event model      ├── TAB MusicXML
                 └── PDF
```

No output generator should recalculate string or fret positions independently. This prevents different outputs from showing different fingerings.

## 5. Conversion Pipeline

### Stage 1 — Input validation

Responsibilities:

- Confirm that input exists
- Enforce maximum file size
- Reject unsupported extensions
- Reject malformed XML
- Reject unsafe document declarations
- Confirm supported MusicXML root structure
- Detect unsupported multipart or polyphonic scores

Possible errors:

```text
EMPTY_INPUT
FILE_TOO_LARGE
INVALID_XML
INVALID_MUSICXML
UNSUPPORTED_SCORE_FORMAT
```

### Stage 2 — MusicXML parsing

Responsibilities:

- Read parts and measures
- Read pitch information
- Read rests
- Read durations
- Read note types and dots
- Read time signatures
- Read ties
- Preserve original event order
- Preserve source location information for errors

The parser must not assign guitar strings or frets.

### Stage 3 — Musical normalization

Responsibilities:

- Convert pitch to MIDI number
- Normalize accidentals
- Normalize rhythm values
- Calculate event start positions
- Validate measure duration
- Represent rests consistently
- Preserve ties and measure boundaries

The normalized model must not depend on MusicXML-specific XML nodes. This allows future input formats to use the same guitar engine.

### Stage 4 — Guitar configuration

The initial guitar model uses standard tuning:

```text
String 6: E2 — MIDI 40
String 5: A2 — MIDI 45
String 4: D3 — MIDI 50
String 3: G3 — MIDI 55
String 2: B3 — MIDI 59
String 1: E4 — MIDI 64
```

Initial fret range:

```text
0–20
```

The guitar configuration must be stored separately from conversion logic.

This allows later support for 22- or 24-fret guitars, Drop D, alternative tunings and capo positions. These features are outside the MVP.

### Stage 5 — Position candidate calculation

For every playable pitch:

```text
fret = note MIDI − open-string MIDI
```

A position is valid when:

```text
0 ≤ fret ≤ maximum fret
```

Responsibilities:

- Generate all valid positions
- Reject negative frets
- Enforce maximum fret
- Detect notes outside the guitar range
- Preserve all alternatives for teacher review

The candidate generator must not select the final position.

### Stage 6 — Fingering optimization

The optimizer receives a sequence of musical events and position candidates. Its goal is to find a complete playable path through the candidate sets.

The first implementation should use deterministic dynamic programming rather than artificial intelligence.

Benefits:

- Reproducible results
- Easy testing
- Transparent cost calculation
- No external service
- No training data required

## 6. Fingering Cost Model

Each transition between two positions receives a cost.

Initial factors:

- Fret movement
- String movement
- Position shifts
- High-fret usage
- Configurable open-string preference
- Repeated-note stability
- Unplayable transitions

Unplayable transitions receive an infinite cost and cannot be selected.

## 7. Determinism

The same MusicXML input, guitar configuration, fingering settings and engine version must produce the same output.

The result should record the engine version, tuning, maximum fret and fingering profile to support reproducible testing and later comparison between algorithm versions.

## 8. Canonical Event Model

The canonical conversion result should contain:

- Engine metadata
- Teacher-review requirement
- Score metadata
- Measures and time signatures
- Event order and start time
- Pitch and rhythm information
- Selected string and fret
- Alternative positions
- Validation warnings

Rests use `selectedPosition: null`.

## 9. Output Architecture

### JSON writer

Responsibilities:

- Serialize the canonical model
- Include warnings
- Include alternative positions
- Include engine settings
- Preserve event order

JSON is the authoritative machine-readable output.

### ASCII TAB writer

Responsibilities:

- Produce six TAB lines
- Insert measure boundaries
- Align simultaneous events
- Represent rests or spacing
- Handle double-digit fret values without breaking alignment

ASCII TAB will prioritize debugging and readability rather than professional engraving.

### TAB MusicXML writer

Responsibilities:

- Preserve musical durations
- Preserve measure structure
- Add string and fret technical elements
- Define six-line TAB staff
- Define TAB clef
- Define standard guitar tuning
- Generate valid MusicXML
- Optionally retain standard notation

The writer must use the selected positions from the canonical model and must not rerun fingering optimization.

### PDF renderer

The PDF renderer is an optional external boundary.

```text
Generated TAB MusicXML
       ↓
PDF renderer
       ↓
PDF score
```

Planned renderer: MuseScore Studio command-line export.

The core engine must remain successful when PDF rendering is disabled, MuseScore is unavailable or PDF generation times out. JSON, ASCII TAB and TAB MusicXML must remain available.

## 10. PDF Rendering Safety

The PDF renderer must:

- Run in a separate temporary directory
- Use a fixed executable
- Use `spawn` or `execFile`
- Never use a shell command string
- Enforce a strict timeout
- Limit concurrent rendering jobs
- Validate the generated file
- Confirm the `%PDF` file signature
- Reject empty output
- Remove only its own temporary files
- Avoid network access
- Avoid user-controlled command arguments

It must never read unrelated project directories, overwrite input MusicXML, or modify SesliTab, Audiveris, OMR or HTML files.

## 11. Error Architecture

Errors should use structured codes and include safe contextual details such as measure number, event index and pitch where available.

Error details must not contain:

- Absolute server paths
- Environment variables
- Raw command output
- Internal stack traces in production
- API keys or credentials

Errors are grouped into input, parsing, music-model, playability, output-generation, PDF-rendering and internal errors.

## 12. Security Architecture

### XML parser isolation

The XML parser must disable:

- External entities
- External DTD loading
- Network retrieval
- Script execution
- XInclude or equivalent external inclusion

The parser must enforce input size, nesting depth, element count, text-node size and processing limits.

### Path isolation

All temporary paths must be created internally. User file names must not control folder paths or executable arguments.

### Dependency control

Before adding any dependency:

- Its purpose must be documented
- Its license must be checked
- Its maintenance status must be checked
- Known vulnerabilities must be reviewed
- Its version must be pinned through a lockfile
- Unnecessary dependencies must be rejected

No install script should be trusted automatically.

### Resource limits

The application should define maximum input size, measures, notes, XML elements, conversion duration, PDF-render duration, concurrent jobs and generated-output size.

Exact values will be selected before implementation.

## 13. Testing Architecture

### Unit tests

Cover pitch conversion, candidate calculation, range checks, cost calculation, fingering selection, rhythm normalization, ASCII alignment and error generation.

### Integration tests

Cover:

```text
MusicXML → JSON
MusicXML → ASCII TAB
MusicXML → TAB MusicXML
TAB MusicXML → PDF
```

### Security tests

Cover XML entity attacks, oversized XML, excessive nesting, invalid paths, malformed MusicXML, process timeout, missing PDF renderer and invalid generated PDF.

### Musical verification tests

Compare expected and generated notes, octaves, durations, measures, strings, frets and position shifts.

## 14. Test Fixtures

Fixtures should be small and independently verifiable.

Planned fixtures:

```text
open-strings.musicxml
c-major-scale.musicxml
chromatic-scale.musicxml
accidentals.musicxml
rests.musicxml
dotted-rhythm.musicxml
eighth-beams.musicxml
sixteenth-beams.musicxml
position-shift.musicxml
lowest-note.musicxml
highest-note.musicxml
below-range.musicxml
above-range.musicxml
invalid-xml.xml
polyphonic-score.musicxml
```

Each valid fixture should include an expected JSON result.

## 15. Development Sequence

```text
1. Documentation
2. Canonical event schema
3. Pitch and MIDI utilities
4. Guitar configuration
5. Fretboard candidate generation
6. Candidate-generation tests
7. MusicXML validation
8. MusicXML parser
9. Rhythm normalization
10. Fingering cost model
11. Fingering optimizer
12. Structured JSON output
13. ASCII TAB output
14. TAB MusicXML output
15. PDF renderer
16. Independent API
17. External integration
```

No stage should depend on unverified behavior from a later stage.

## 16. Deployment Architecture

Deployment is not part of the first implementation milestone.

A possible later architecture uses a separate HTTP API, MusicXML conversion worker and optional PDF-rendering worker.

The service should use a separate repository, Docker image, deployment, temporary storage and environment variables, with no writable mount shared with SesliTab or Audiveris.

## 17. Future Visual Dataset Project

The future repository `tab-rhythm-visual-dataset` will remain independent.

It may contain:

- Rendered score images
- Scanned TAB pages
- Bounding-box annotations
- Rhythm-beam labels
- Stem labels
- Fret-number labels
- Expected event JSON
- Expected MusicXML fragments

The canonical event schema from this engine may be reused as a documented format.

The repositories must not share runtime code, writable storage, secrets or deployment environments.

## 18. Architecture Acceptance Criteria

The architecture will be considered successfully implemented when:

1. Each module has one clear responsibility.
2. MusicXML parsing is independent from guitar calculation.
3. Guitar calculation is independent from output rendering.
4. All output formats use the same canonical result.
5. The same input and settings produce deterministic output.
6. Invalid input fails explicitly.
7. Unplayable notes never receive invented fret values.
8. PDF failure does not destroy other outputs.
9. XML processing is isolated from external resources.
10. Tests cover musical correctness and security boundaries.
11. The repository remains independent from SesliTab, Audiveris, OMR and HTML files.
12. External integration occurs only through documented files or APIs.

## 19. Milestone 2A single-pass MusicXML foundation

The MusicXML input boundary now separates XML reading from structural and semantic projection.

```text
Raw MusicXML
      ↓
normalizeXmlInput()
      ↓
one SaxesParser pass
      ↓
ParsedMusicXmlDocument 1.0.0
      ├─ structural adapter → validateMusicXml()
      └─ semantic adapter   → parseMusicXmlNotes()
```

`ParsedMusicXmlDocument` is an immutable internal XML representation. It preserves local element names, namespace URIs, non-namespaced attributes, direct text and child order. It contains no guitar positions, fingering data or output-specific fields.

The structural adapter validates the supported score-partwise container, direct part-list and part relationships, identifiers and measure count. It intentionally does not reject chord, grace-note, tuplet or other semantically unsupported note content when the caller requests structural validation only.

The semantic adapter projects the same parsed representation into the existing deterministic monophonic parser result. Existing parser field names, ordering, source locations, rhythm normalization and error codes remain the compatibility boundary.

For each direct entry point, XML normalization and SAX parsing occur once:

- `validateMusicXml(input)` performs one SAX pass and one structural projection.
- `parseMusicXmlNotes(input)` performs one SAX pass and then structural plus semantic projection without reparsing the source.

Resource ceilings beyond the existing byte limit, including depth, element, text, measure, event and deadline limits, remain Milestone 2C work.

## 20. Milestone 2B shared public conversion parse

The public conversion pipeline now shares one immutable semantic parse between preflight reporting and canonical conversion.

```text
Raw MusicXML
      ↓
parseMusicXmlNotes() — one SAX pass
      ↓
Parsed monophonic notes
      ├─ preflight report
      └─ CanonicalMusicDocument
             ↓
        CanonicalTabResult
```

`inspectMusicXml(input, parserOptions)` is an internal validation-module boundary. It returns a frozen pair containing the preflight report and the parsed monophonic notes. On a blocked input, the report preserves the existing safety, structure, capability or content classification and `parsedNotes` is `null`.

`preflightMusicXml()` remains the standalone public preflight entry point and returns only the report. `parseCanonicalTabResult()` remains a standalone direct conversion entry point. Neither package-root export shape nor the canonical TAB contract changes.

`convertMusicXmlToCanonicalTab()` validates conversion options before parsing, performs one semantic MusicXML parse, preserves PASS, WARNING and BLOCKED behavior, and feeds the same parsed notes into `CanonicalMusicDocument` and `CanonicalTabResult` creation. PASS, WARNING and BLOCKED public conversion paths therefore construct one `SaxesParser`; invalid conversion options construct none.

Explicit XML depth, element, text, measure, event, deadline and cancellation ceilings remain Milestone 2C work. The common public error contract remains Milestone 2D work.

## 21. Milestone 2C-1 central processing budget contract

Milestone 2C begins with one internal, versioned source of truth for resource and processing defaults:

```text
src/core/processingBudget.js
      ↓
ProcessingBudget 1.0.0
      ↓
immutable validated limits
```

`createProcessingBudget(options)` accepts a plain object containing partial overrides, rejects unknown fields, and requires every limit to be a positive safe integer. Invalid configuration uses `ProcessingBudgetConfigurationError` with the stable code `INVALID_PROCESSING_BUDGET` and safe `field` and `value` details where applicable.

The approved defaults are:

| Limit | Default |
|---|---:|
| `maxBytes` | 5 MiB |
| `maxDepth` | 128 |
| `maxElements` | 100,000 |
| `maxAttributes` | 200,000 |
| `maxTextBytes` | 4 MiB |
| `maxMeasures` | 2,000 |
| `maxEvents` | 50,000 |
| `maxProcessingMilliseconds` | 10,000 ms |

The returned budget has the identity `ProcessingBudget 1.0.0` and is deeply immutable. The existing `maxBytes` option name is retained so later enforcement can converge without introducing a second byte-limit vocabulary.

This sub-milestone defines only the central contract. It does not yet connect the budget to SAX callbacks, MusicXML measure/event projection, candidate generation, fingering optimization, preflight error classification, deadlines, or cancellation. It does not change package-root exports, canonical schemas, public conversion output, or supported musical features.
