# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents, coding assistants, and automated development tools must begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Project purpose

The engine reads musical information from MusicXML, preserves measures and rhythm, calculates every physically valid guitar string/fret position, and selects a reproducible fingering path.

Its primary output is a structured canonical TAB result that can be reviewed by a teacher and then rendered into downstream formats without recalculating the approved fingering.

The project is designed as an independent music-processing engine. It is not tied to a specific user interface, OMR provider, mobile application, or the SesliTab codebase.

## Design goals

- Preserve pitch, rhythm, rests, measures, ties, beams, and source order.
- Never invent an unplayable string or fret position.
- Produce deterministic results from the same input and configuration.
- Keep MusicXML parsing, musical normalization, guitar logic, fingering optimization, and output generation separate.
- Preserve all playable alternatives for teacher review.
- Keep the selected position in one authoritative canonical result.
- Allow future learning systems to rank valid candidates without replacing musical or physical validation rules.

## Processing pipeline

```text
MusicXML input
      ↓
XML safety checks and MusicXML preflight
      ↓
MusicXML parsing and normalization
      ↓
CanonicalMusicDocument
      ↓
Playable guitar position candidates
      ↓
Deterministic fingering cost model and optimizer
      ↓
CanonicalTabResult
      ↓
JSON / TAB MusicXML / future ASCII and external adapters
```

## Architecture overview

### 1. Input and validation boundary

The validation layer checks XML safety, MusicXML structure, supported capabilities, and whether an input can enter the monophonic conversion pipeline.

Relevant modules:

- `src/validation/xmlSafety.js`
- `src/validation/musicxmlValidation.js`
- `src/validation/musicxmlPreflight.js`

### 2. MusicXML parser adapter

The parser reads supported MusicXML notation and converts source-specific XML content into normalized musical events. It must not assign guitar strings or frets.

Relevant modules:

- `src/parser/musicxmlNoteParser.js`
- `src/parser/parseCanonicalMusicDocument.js`
- `src/parser/parseCanonicalTabResult.js`

### 3. Canonical music domain

`CanonicalMusicDocument` is the normalized, immutable musical representation used by the guitar engine. It preserves musical meaning without exposing MusicXML nodes as an alternate source of truth.

Relevant modules:

- `src/music/canonicalMusicDocument.js`
- `src/music/pitch.js`

### 4. Guitar domain

The guitar layer owns tuning, fretboard calculations, playability checks, and the generation of every valid string/fret candidate.

Relevant modules:

- `src/guitar/tuning.js`
- `src/guitar/fretboard.js`
- `src/guitar/playability.js`
- `src/fingering/candidateLayerBuilder.js`

### 5. Fingering engine

The fingering layer evaluates positions and transitions with an explainable cost model. A deterministic dynamic-programming optimizer selects a complete playable path with stable tie-breaking.

Relevant modules:

- `src/fingering/costModel.js`
- `src/fingering/fingeringOptimizer.js`
- `src/fingering/assignCanonicalFingering.js`

### 6. Canonical TAB result

`CanonicalTabResult` is the authoritative conversion result. It records the selected position, remaining alternatives, cost breakdowns, warnings, guitar configuration, engine version, and the requirement for teacher review.

Relevant module:

- `src/tab/canonicalTabResult.js`

### 7. Output writers

Writers derive presentation formats from the approved canonical result. They must not regenerate candidates, run the optimizer again, or replace the selected string/fret positions.

Relevant modules:

- `src/writers/canonicalTabJsonWriter.js`
- `src/writers/canonicalTabMusicXmlWriter.js`

### 8. Application and public API boundary

The application layer coordinates preflight and conversion. The package root exposes the controlled conversion API together with the existing fretboard helpers.

Relevant modules:

- `src/core/conversionPipeline.js`
- `src/index.js`

Current package-root exports include:

- `convertMusicXmlToCanonicalTab`
- `preflightMusicXml`
- `PREFLIGHT_STATUS`
- `getPositionCandidates`
- `positionToMidi`
- `validateMidi`
- `FretboardError`

## Core architectural rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers must use `selectedPosition` and must not re-optimize fingering.
3. The parser must not contain guitar-specific decision logic.
4. The optimizer must not depend on JSON, MusicXML, HTTP, UI, PDF, OMR, or SesliTab adapters.
5. Unsupported notation must produce an explicit warning or error rather than silent data loss.
6. The same input, configuration, profile, and engine version must produce the same result.
7. Educational output requires teacher review.

## Current scope

- MusicXML `.musicxml` and `.xml` input
- Standard six-string tuning: E2 A2 D3 G3 B3 E4
- Frets 0–20
- Single-part, single-staff, single-voice monophonic material
- Notes and rests
- Whole, half, quarter, eighth, and 16th note values
- Dotted values within the supported parser contract
- Measure and time-signature preservation
- Ties and beam metadata within the supported monophonic contract
- Detection of unsupported notation and unplayable pitches
- Teacher review before educational use

## Planned capability expansion

The following features require separate contracts, tests, and controlled milestones:

- Compressed MusicXML (`.mxl`)
- ASCII TAB on the complete public output surface
- Alternative guitar tunings
- Grace notes and tuplets
- Chords and polyphony
- Multipart and multistaff selection
- HTTP service and accessible teacher-review interfaces
- Provider-independent PDF/OMR processing
- Audiveris integration
- SesliTab integration
- Teacher-feedback learning and student-specific fingering profiles

## Future AI-assisted fingering boundary

The intended learning direction is a controlled hybrid system:

```text
Validated musical events
      ↓
Physically valid guitar candidates
      ↓
Learned candidate preference scores
      ↓
Deterministic constrained optimizer
      ↓
Teacher review and correction
```

A future model may learn from approved teacher decisions and improve candidate ranking. It must not:

- create notes,
- create invalid string/fret positions,
- bypass guitar configuration rules,
- modify canonical musical timing,
- publish or activate a new model without evaluation and approval.

The deterministic cost profile remains the required fallback when no approved model is available.

## Project boundaries

This repository begins with MusicXML and ends with structured Guitar TAB outputs.

It does not directly:

- read PDF scores,
- perform optical music recognition,
- run Audiveris,
- read or modify `.omr` files,
- provide a production HTTP server,
- provide a user interface or mobile application,
- access or modify SesliTab source files.

PDF-to-MusicXML conversion and application integration must remain external adapters with explicit versioned contracts.

## Documentation

Read in this order:

1. [AI context — start here](AI_CONTEXT.md)
2. [Current implementation status](docs/current-status.md)
3. [Package and verification status](docs/package-status.md)
4. [Architecture](docs/ARCHITECTURE.md)
5. [Canonical result contract audit](docs/canonical-contract-audit.md)
6. [MVP specification](docs/MVP-SPEC.md)
7. [MusicXML compatibility evidence](docs/musicxml-compatibility.md)
8. [Deprecated data-contract draft](docs/DATA-CONTRACT.md)

## Development

Requirements:

- Node.js 18 or newer
- npm

Install and run the test suite:

```bash
npm ci --ignore-scripts
npm test
```
