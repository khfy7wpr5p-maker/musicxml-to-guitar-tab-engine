# MusicXML to Guitar TAB Engine

A standalone deterministic engine for converting supported MusicXML into playable six-string guitar tablature.

AI agents and automated development tools must begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Purpose

The engine safely parses supported MusicXML, preserves musical meaning in immutable canonical data, generates all physically valid guitar positions, selects a reproducible fingering path with a deterministic optimizer, and produces one authoritative `CanonicalTabResult 1.0.0`.

Downstream writers consume that canonical result and never recalculate fingering. Educational output requires teacher review.

This repository is not a PDF/OMR system, HTTP service, UI/mobile application, Audiveris integration, or SesliTab repository.

## Current deterministic pipeline

```text
MusicXML .musicxml / .xml
        ↓
XML safety + ProcessingBudget
        ↓
one SaxesParser pass
        ↓
ParsedMusicXmlDocument 1.0.0
        ├─ structural validation
        └─ monophonic semantic projection
                  ↓
       CanonicalMusicDocument
                  ↓
      physical guitar candidates
                  ↓
 deterministic cost + DP optimizer
                  ↓
       CanonicalTabResult 1.0.0
                  ↓
     shared canonical validator
          ┌───────┼────────┐
          ↓       ↓        ↓
        JSON   ASCII TAB  TAB MusicXML
```

`CanonicalTabResult` is the single downstream source of truth. Writers use `selectedPosition` only.

## Current package API in this tree

```text
convertMusicXmlToCanonicalTab
preflightMusicXml
PREFLIGHT_STATUS
getPositionCandidates
positionToMidi
validateMidi
FretboardError
serializeCanonicalTabResult
serializeCanonicalTabResultToAscii
serializeCanonicalTabResultToMusicXml
ENGINE_ERROR_CONTRACT_VERSION
isEngineError
```

Milestone 3 (PR #36) merged the three public serializer functions into `main` at baseline commit `24b92e26b5f9c84451caa2a8ef2432ffbd79e711`.

The PEB-1 change represented by this tree adds only `ENGINE_ERROR_CONTRACT_VERSION` and `isEngineError`. If this tree is viewed before PEB-1 is merged, those two exports are branch-only until merge.

## Public error detection

`EngineError 1.0.0` remains an internal base class. PEB-1 deliberately does **not** export that class or the writer/domain subclasses.

`isEngineError(error)` lets package consumers detect errors produced by the engine without coupling to the internal class hierarchy:

```js
try {
  // call public engine API
} catch (error) {
  if (isEngineError(error)) {
    console.log(error.code);
  }
}
```

The detector is nominal: native errors and plain objects that merely imitate `name`, `code`, `details`, and `message` are rejected.

For machine logic, prefer `error.code`; do not depend on human-readable message text as the primary contract.

`FretboardError` remains public for backward compatibility. `EngineError`, writer errors, `GuitarConfigurationError`, `CanonicalTabResultError`, and other internal domain subclasses remain non-public.

See [EngineError contract](docs/engine-error-contract.md).

## Supported musical scope

- `.musicxml` and `.xml`
- `score-partwise`
- one part, one staff, one voice
- monophonic notes and rests
- standard six-string tuning E2 A2 D3 G3 B3 E4
- validated custom six-string open MIDI tuning internally
- frets 0–20 by default
- whole, half, quarter, eighth, and 16th values
- supported dotted values, ties, and beam metadata
- inherited divisions and time signatures
- implicit pickup measures
- explicit rejection/classification of unsupported structures and unplayable notes

## Architecture invariants

1. `CanonicalTabResult` is authoritative.
2. Writers never re-optimize.
3. Parser code never chooses string/fret positions.
4. Physical candidate validation precedes any future learned component.
5. Deterministic cost and optimization remain the required baseline and fallback.
6. Unsupported or unreadable musical content is not guessed.
7. Teacher review remains the final educational approval boundary.
8. Learned systems may only score deterministic physically valid candidates and may not directly mutate canonical music or physical rules.

## Security and reliability milestones

Implemented milestones include:

- immutable parsed MusicXML and shared one-pass semantics (2A/2B)
- centralized `ProcessingBudget 1.0.0`
- XML and semantic resource ceilings
- cooperative deadline/cancellation and optimizer checkpoints
- hostile-input regression corpus
- GitHub Actions SHA pinning
- internal `EngineError 1.0.0` convergence (2D-1 through 2D-4)
- Milestone 3 public writer API

`main` is protected with seven required checks. Required-check enforcement still reports `non_admins`; administrator-bypass hardening remains an open repository-governance task.

## Next controlled roadmap

After PEB-1 verification and merge:

1. `GuitarConfiguration 1.0`
2. `OptimizerObservation 1.0.0`
3. `PedagogicalFeatureVector 1.0`
4. `TeacherFeedback 1.0`
5. deterministic teacher-verified fingering benchmark
6. learned candidate ranking v1 in shadow mode
7. controlled learned ranking only after separate evidence and approval

Long-term chord/barre work must first add simultaneous-event and left-hand-shape contracts, then finger/barre representation, physical chord candidates and validation, deterministic left-hand optimization, feature v2, benchmark v2, and only then learned ranking v2.

## Not implemented

The repository does not currently implement HTTP/UI/mobile, PDF/OMR/Audiveris, SesliTab integration, chords/polyphony, finger assignment/barre, multipart/multistaff selection, grace notes, tuplets, compressed `.mxl`, teacher feedback persistence, benchmark datasets, learned ranking, model training, registry, or personalization.

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```

The protected PR path also runs Node.js 18/20/22 and MusicXML compatibility workflows.

## Documentation

1. [AI context](AI_CONTEXT.md)
2. [Current implementation status](docs/current-status.md)
3. [Package and verification status](docs/package-status.md)
4. [EngineError contract](docs/engine-error-contract.md)
5. [Architecture](docs/ARCHITECTURE.md)
6. [Canonical result contract audit](docs/canonical-contract-audit.md)
