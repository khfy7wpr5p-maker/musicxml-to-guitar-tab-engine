# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents, coding assistants, and automated development tools must begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Project purpose

The engine reads musical information from MusicXML, preserves supported musical meaning, calculates every physically valid guitar string/fret position, and selects a reproducible fingering path.

Its authoritative output is `CanonicalTabResult 1.0.0`. Teachers can review the selected fingering and alternatives before downstream formats are generated. Writers must use the canonical selected positions and must not recalculate fingering.

This repository is an independent MusicXML-processing engine. It is not a PDF/OMR system, HTTP service, user interface, mobile application, or SesliTab integration repository.

## Current implementation status

The verified runtime baseline is a deterministic monophonic MusicXML-to-Guitar-TAB engine.

Merged capabilities include:

- secure `.musicxml` and `.xml` input handling,
- one-pass XML parsing and immutable internal parsed representation,
- one shared semantic parse across public preflight and conversion,
- canonical music and TAB result contracts,
- physically valid guitar candidate generation,
- explainable deterministic fingering optimization,
- machine-verifiable canonical schema and runtime validation,
- internal JSON, TAB MusicXML, and ASCII TAB writers.

The writers are internal modules and are not yet exported from the package root. Machine learning, automatic training, personalization, HTTP, UI, PDF, OMR, Audiveris, SesliTab, chords, polyphony, multipart, multistaff, grace notes, and tuplets are not implemented.

See [Current implementation status](docs/current-status.md) and [Package and verification status](docs/package-status.md) for exact evidence.

## Design goals

- Preserve supported pitch, rhythm, rests, measures, ties, beams, and source order.
- Reject unsupported structures explicitly instead of silently losing musical data.
- Never invent an unplayable string or fret position.
- Produce deterministic results from the same input, configuration, profile, and engine version.
- Separate XML parsing, musical normalization, guitar logic, optimization, contract validation, and output generation.
- Preserve playable alternatives for teacher review.
- Keep one selected position in one authoritative canonical result.
- Allow a future learned scorer to rank only already-valid candidates.

## Processing pipeline

```text
MusicXML .musicxml / .xml
      ↓
XML normalization and safety checks
      ↓
one SaxesParser pass
      ↓
ParsedMusicXmlDocument 1.0.0
      ├─ structural validation
      └─ monophonic semantic projection
                 ↓
          parsed musical notes
              ├─ preflight report
              └─ CanonicalMusicDocument
                         ↓
              valid guitar candidates
                         ↓
          deterministic cost model + optimizer
                         ↓
               CanonicalTabResult 1.0.0
                         ↓
          shared canonical runtime validator
                         ↓
           JSON / TAB MusicXML / ASCII writers
```

For public conversion, PASS, WARNING, and BLOCKED paths construct one SAX parser. Invalid conversion options are rejected before parsing.

## Architecture overview

### 1. XML safety and input boundary

The input layer normalizes supported text or buffer input, enforces the current byte and XML-safety policy, and rejects malformed or unsafe declarations.

Relevant modules:

- `src/validation/xmlSafety.js`
- `src/parser/parsedMusicXmlDocument.js`

### 2. Parsed MusicXML and adapters

`ParsedMusicXmlDocument 1.0.0` is an immutable internal XML representation. Structural validation and monophonic semantic projection consume the same parsed tree through separate adapter responsibilities.

Relevant modules:

- `src/parser/parsedMusicXmlDocument.js`
- `src/parser/musicxmlDocumentAdapter.js`
- `src/validation/musicxmlValidation.js`
- `src/parser/musicxmlNoteParser.js`
- `src/validation/musicxmlPreflight.js`

The parser layer must not choose guitar strings or frets.

### 3. Canonical music domain

`CanonicalMusicDocument` is the normalized, immutable musical representation used by the guitar engine. It preserves supported musical meaning without retaining MusicXML nodes as a second downstream truth source.

Relevant modules:

- `src/music/canonicalMusicDocument.js`
- `src/music/pitch.js`
- `src/parser/parseCanonicalMusicDocument.js`

### 4. Guitar domain

The guitar layer owns tuning, fretboard calculations, playability checks, and generation of every valid string/fret candidate.

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

### 6. Canonical TAB result and contract

`CanonicalTabResult` is the authoritative conversion result. It records selected positions, alternatives, cost breakdowns, warnings, guitar configuration, engine metadata, and the teacher-review requirement.

The v1 schema and runtime validator enforce structural, musical, physical, cost, JSON-safety, and warning-index invariants.

Relevant modules and schema:

- `src/tab/canonicalTabResult.js`
- `schemas/canonical-tab-result.v1.schema.json`
- `src/contracts/canonicalTabResultContract.js`
- `src/contracts/canonicalTabContractCore.js`
- `src/contracts/canonicalTabContractMetadata.js`
- `src/contracts/canonicalTabContractValueValidators.js`

### 7. Output writers

Writers derive presentation formats from the approved canonical result. They do not regenerate candidates, rerun the optimizer, or replace selected string/fret positions.

Merged internal writers:

- `src/writers/canonicalTabJsonWriter.js`
- `src/writers/canonicalTabMusicXmlWriter.js`
- `src/writers/canonicalTabAsciiWriter.js`

These writers are not yet package-root exports.

### 8. Application and public API boundary

The application layer validates conversion options, performs one shared MusicXML inspection, preserves preflight behavior, and creates the canonical result.

Relevant modules:

- `src/core/conversionPipeline.js`
- `src/index.js`

Current package-root exports:

- `convertMusicXmlToCanonicalTab`
- `preflightMusicXml`
- `PREFLIGHT_STATUS`
- `getPositionCandidates`
- `positionToMidi`
- `validateMidi`
- `FretboardError`

## Core architectural rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use `selectedPosition` and never re-optimize fingering.
3. XML structural validation and musical semantic projection remain separate.
4. The parser contains no guitar-position decision logic.
5. Physical guitar validity is enforced before any future learned ranking.
6. The optimizer does not depend on output, network, UI, PDF, OMR, Audiveris, or SesliTab layers.
7. Unsupported notation produces explicit warnings or errors.
8. Educational output requires teacher review.
9. External systems connect only through explicit versioned adapters.
10. Milestone 2C resource, deadline, and cancellation enforcement must precede untrusted remote ingestion or HTTP integration.

## Current supported musical scope

- MusicXML `.musicxml` and `.xml` input
- `score-partwise`
- one part, one staff, one voice
- monophonic notes and rests
- standard six-string tuning: E2 A2 D3 G3 B3 E4
- frets 0–20 by default
- whole, half, quarter, eighth, and 16th values
- supported dotted values
- supported ties and beam metadata
- inherited divisions and time signatures
- implicit pickup measures
- explicit detection of unsupported notation and unplayable pitches

## Next controlled milestones

1. Milestone 2C: central depth, element, attribute, text, measure, event, deadline, and cancellation limits.
2. Milestone 2D: common public engine-error contract.
3. Complete monophonic public output API for the three writers.
4. Central guitar/tuning validation.
5. Wider real-world and hostile-input fixture corpus.
6. Versioned pedagogical feature extraction.
7. Immutable teacher-feedback contract.
8. Only then, offline learned candidate ranking with deterministic fallback, shadow evaluation, approval, and rollback.

## Project boundaries

This repository begins with MusicXML and ends with structured or textual Guitar TAB outputs.

It does not directly:

- read PDF scores or images,
- perform optical music recognition,
- run Audiveris,
- read or modify `.omr` files,
- expose a production HTTP server,
- provide a UI, PWA, or mobile application,
- access or modify SesliTab source files.

Any future PDF-to-MusicXML, service, or application integration must remain outside the deterministic core behind explicit versioned contracts.

## Future AI-assisted fingering boundary

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

A future model may rank only valid candidates. It may not create notes, invent positions, bypass tuning rules, change canonical timing, self-modify production code, or activate a model without offline evaluation, versioning, approval, shadow evidence, and rollback. The deterministic cost profile remains the required fallback.

## Documentation

Read in this order:

1. [AI context — start here](AI_CONTEXT.md)
2. [Current implementation status](docs/current-status.md)
3. [Package and verification status](docs/package-status.md)
4. [Architecture](docs/ARCHITECTURE.md)
5. [Single-pass MusicXML safety boundary](docs/musicxml-single-pass-safety.md)
6. [Canonical result contract audit](docs/canonical-contract-audit.md)
7. [MVP specification](docs/MVP-SPEC.md)
8. [MusicXML compatibility evidence](docs/musicxml-compatibility.md)
9. [Deprecated data-contract draft](docs/DATA-CONTRACT.md)

## Development

Requirements:

- Node.js 18 or newer
- npm

Install and run the test suite:

```bash
npm ci --ignore-scripts
npm test
```
