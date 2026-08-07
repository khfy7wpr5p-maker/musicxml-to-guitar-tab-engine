# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents, coding assistants, and automated development tools must begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Project purpose

The engine reads musical information from MusicXML, preserves supported musical meaning, calculates every physically valid guitar string/fret position, and selects a reproducible fingering path.

Its authoritative output is `CanonicalTabResult 1.0.0`. Teachers can review the selected fingering and alternatives before downstream formats are generated. Writers use canonical selected positions and must not recalculate fingering.

This repository is an independent MusicXML-processing engine. It is not a PDF/OMR system, HTTP service, user interface, mobile application, or SesliTab integration repository.

## Current implementation status

The verified pre-Milestone-3 `main` baseline is `73b04a9f18f6fbb3c3a2e2e584d09d25fc66f099`. That commit merged the documentation convergence after Milestones 2C and 2D.

Merged capabilities on that baseline include:

- secure `.musicxml` and `.xml` input handling,
- one-pass XML parsing and immutable internal parsed representation,
- one shared semantic parse across public preflight and conversion,
- centralized processing budgets and XML/semantic resource ceilings,
- deadline, monotonic-clock, and `AbortSignal` cancellation support,
- runtime checkpoints through candidate generation and optimizer loops,
- hostile-input and boundary regression coverage,
- canonical music and TAB result contracts,
- physically valid guitar candidate generation,
- explainable deterministic fingering optimization,
- machine-verifiable canonical schema and runtime validation,
- deterministic JSON, TAB MusicXML, and ASCII TAB writer implementations,
- internal `EngineError 1.0.0` convergence across current domain errors,
- GitHub Actions third-party action references pinned to immutable SHAs.

Milestone 3 is the active controlled package-surface change. Its branch `feature/public-writer-api-m3` proposes package-root access to the existing deterministic writer implementations through exactly three serializer functions:

- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

Until the Milestone 3 pull request is merged, those three functions are branch-only and are not current `main` capabilities. Milestone 3 does not export `EngineError` or the three writer-specific error classes.

Machine learning, automatic training, personalization, HTTP, UI, PDF, OMR, Audiveris, SesliTab, chords, polyphony, left-hand finger assignment, barre representation, multipart, multistaff, grace notes, and tuplets are not implemented.

See [Current implementation status](docs/current-status.md) and [Package and verification status](docs/package-status.md) for exact evidence.

## Processing pipeline

```text
MusicXML .musicxml / .xml
      ↓
XML normalization and safety checks
      ↓
ProcessingBudget + runtime checkpoints
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

For public conversion, PASS, WARNING, and BLOCKED paths share one semantic parse. Invalid conversion options are rejected before parsing.

## Architecture overview

### 1. XML safety and processing limits

The input layer normalizes supported text or buffer input, enforces encoding and XML-safety policy, and applies centralized resource ceilings during the existing SAX pass.

Current limits include input bytes, XML depth, elements, attributes, UTF-8 text bytes, MusicXML measures, and semantic events. Cooperative deadline and cancellation checks continue through expensive candidate/optimizer loops.

Relevant modules:

- `src/core/processingBudget.js`
- `src/core/processingRuntime.js`
- `src/validation/xmlSafety.js`
- `src/parser/parsedMusicXmlDocument.js`
- `src/validation/musicxmlSemanticResourceLimits.js`

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

A current immutable configuration foundation already validates six-string tuning and fret range. A future `GuitarConfiguration 1.0` milestone will version and strengthen this existing boundary rather than replace it.

Relevant modules:

- `src/guitar/tuning.js`
- `src/guitar/fretboard.js`
- `src/guitar/playability.js`
- `src/fingering/candidateLayerBuilder.js`

### 5. Fingering engine

The fingering layer evaluates positions and transitions with an explainable cost model. A deterministic dynamic-programming optimizer selects a complete playable path with stable tie-breaking.

Current deterministic cost components include fret movement, string movement, large-shift distance, high-fret distance, open-string preference, and same-position continuity. These are not yet a versioned pedagogical feature-vector contract.

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

Writer modules:

- `src/writers/canonicalTabJsonWriter.js`
- `src/writers/canonicalTabMusicXmlWriter.js`
- `src/writers/canonicalTabAsciiWriter.js`

Milestone 3 exposes only their serializer functions at the package root. Writer-specific error classes remain internal pending the separate public error-boundary compatibility audit.

### 8. Error boundary

`src/errors/engineError.js` defines internal `EngineError 1.0.0`. Milestones 2D-1 through 2D-4 converged the current domain error classes on this base while preserving existing names, codes, details, wrapping behavior, and adapter `phase` metadata.

`EngineError` is not exported from `src/index.js`. Any public error surface requires a separate compatibility audit.

### 9. Application and public API boundary

The application layer validates conversion options, performs shared MusicXML inspection, preserves preflight behavior, and creates the canonical result.

Relevant modules:

- `src/core/conversionPipeline.js`
- `src/index.js`

Verified pre-Milestone-3 package-root exports:

- `convertMusicXmlToCanonicalTab`
- `preflightMusicXml`
- `PREFLIGHT_STATUS`
- `getPositionCandidates`
- `positionToMidi`
- `validateMidi`
- `FretboardError`

Milestone 3 target additions:

- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

No writer error class or `EngineError` is included in the Milestone 3 target export set.

## Core architectural rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use `selectedPosition` and never re-optimize fingering.
3. XML structural validation and musical semantic projection remain separate.
4. The parser contains no guitar-position decision logic.
5. Physical guitar validity is enforced before any future learned ranking.
6. The optimizer remains deterministic for the same supported input, configuration, profile, and engine version.
7. Unsupported notation produces explicit warnings or errors.
8. Educational output requires teacher review.
9. Observations and teacher feedback remain outside immutable canonical musical results unless a separately versioned contract says otherwise.
10. External systems connect only through explicit versioned adapters.
11. Learned systems may score only deterministic, physically valid candidates.
12. Learned systems may not create or alter MusicXML, pitch, strings, frets, timing, physical validation rules, or canonical objects directly.
13. The deterministic cost profile remains the required fallback.

## Current supported musical scope

- MusicXML `.musicxml` and `.xml` input
- `score-partwise`
- one part, one staff, one voice
- monophonic notes and rests
- standard six-string tuning: E2 A2 D3 G3 B3 E4
- validated custom six-string open MIDI tuning internally
- frets 0–20 by default
- whole, half, quarter, eighth, and 16th values
- supported dotted values
- supported ties and beam metadata
- inherited divisions and time signatures
- implicit pickup measures
- explicit detection of unsupported notation and unplayable pitches

## Approved controlled roadmap

Documentation convergence is merged and historical Draft PR #24 has been closed without merge. G0.1 administrator-bypass hardening remains open because the connected GitHub write surface does not currently expose the required protection mutation.

The controlled product sequence is:

1. Milestone 3: controlled public JSON, ASCII TAB, and TAB MusicXML serializer API — active,
2. public error-boundary compatibility audit,
3. versioned `GuitarConfiguration 1.0`,
4. immutable `OptimizerObservation 1.0.0`,
5. deterministic `PedagogicalFeatureVector 1.0`,
6. immutable `TeacherFeedback 1.0`,
7. fixed teacher-verified fingering benchmark,
8. learned candidate ranking v1 in shadow mode,
9. controlled learned ranking only after separate offline/shadow evidence and approval.

### Future learned-ranking boundary

```text
CanonicalMusicDocument
        ↓
Deterministic physical candidate generator
        ↓
Physical validator
        ↓
Deterministic pedagogical features
        ↓
Optional learned candidate scores
        ↓
Deterministic constrained optimizer
        ↓
CanonicalTabResult
        ↓
Teacher review
```

In shadow mode, learned scores cannot affect optimizer output. Controlled ranking may be considered only after benchmark evidence, versioning, explicit approval, deterministic fallback, and rollback design.

## Long-term chord and barre expansion

The approved long-term order is:

```text
Chord / Simultaneous Event Model
        ↓
Left-Hand Shape Contract
        ↓
Finger Assignment + Barre / Partial-Barre Representation
        ↓
Chord Candidate Generator
        ↓
Physical Playability Validator v2
        ↓
Deterministic Left-Hand Optimizer
        ↓
Pedagogical Feature Vector v2
        ↓
Chord Benchmark v2
        ↓
Learned Pedagogical Ranking v2
```

Barre is part of the physical left-hand representation, not merely output formatting.

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

## Repository governance note

`main` is currently reported as protected with seven required CI checks. The latest read-only inspection reports required-check enforcement as `non_admins`, so administrator-bypass hardening remains open. No repository ruleset was returned by the current inspection.

Historical Draft PR #24 is closed and was not merged. This governance history is separate from package behavior.

## Documentation

Read in this order:

1. [AI context — start here](AI_CONTEXT.md)
2. [Current implementation status](docs/current-status.md)
3. [Package and verification status](docs/package-status.md)
4. [EngineError contract](docs/engine-error-contract.md)
5. [Architecture](docs/ARCHITECTURE.md)
6. [Single-pass MusicXML safety boundary](docs/musicxml-single-pass-safety.md)
7. [Canonical result contract audit](docs/canonical-contract-audit.md)
8. [MVP specification](docs/MVP-SPEC.md)
9. [MusicXML compatibility evidence](docs/musicxml-compatibility.md)
10. [Deprecated data-contract draft](docs/DATA-CONTRACT.md)

## Development

Requirements:

- Node.js 18 or newer
- npm

Install and run the test suite:

```bash
npm ci --ignore-scripts
npm test
```
