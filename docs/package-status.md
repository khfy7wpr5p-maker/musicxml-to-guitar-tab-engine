# Package and Verification Status

This document records the package surface and strongest available verification evidence for the authoritative runtime baseline. It does not promote unmerged behavior to a current capability.

## Snapshot

- Status date: 2026-08-07
- Verified `main` runtime baseline: `c0f954a876f171c2a9ac33a510522632dec80d67`
- Baseline change: Milestone 2D-4 final internal `EngineError 1.0.0` convergence
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private
- License metadata: `UNLICENSED`
- Node.js support: 18, 20, and 22 in CI; package engine `>=18`
- Runtime dependency: `saxes@6.0.0`

## Verification labels

| Label | Meaning |
|---|---|
| `VERIFIED_ON_MAIN` | Present on the verified runtime baseline and backed by merged code plus relevant successful test evidence |
| `IMPLEMENTED_NOT_PUBLIC` | Merged and tested internally, but not exported through the package root |
| `PARTIAL` | Some foundation exists, but the named package-level capability remains incomplete |
| `NOT_IMPLEMENTED` | No merged implementation exists |
| `EVIDENCE_LIMITED` | Implementation exists, but a named verification layer is unavailable or incomplete |

## Package metadata

| Field | Current value |
|---|---|
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` |
| `description` | Convert MusicXML scores into playable six-string guitar tablature |
| `main` | `src/index.js` |
| `test` | `node --test` |
| Node.js engine | `>=18` |
| Runtime dependency | `saxes@6.0.0` |
| License | `UNLICENSED` |

This document is not a fresh dependency-vulnerability audit. Dependency security must be checked again when dependencies or lockfiles change and before any release decision.

## Strongest current verification evidence

Milestone 2D-4 branch head `f4c41c129a9a6730263d85f1e797561802439a2e` completed the following pull-request workflows successfully before squash merge as `c0f954a876f171c2a9ac33a510522632dec80d67`:

### Tests #224

| Runtime | Result |
|---|---|
| Node.js 18 | Passed |
| Node.js 20 | Passed |
| Node.js 22 | Passed |

The workflow installs project dependencies and runs the repository test suite for each supported Node.js runtime.

### MusicXML Compatibility #95

Successful jobs included:

- complete repository tests plus alphaTab import and SVG render on Node.js 18,
- the same compatibility path on Node.js 20,
- the same compatibility path on Node.js 22,
- alphaTab browser renderer, cursor, and synthesizer diagnostic on Node.js 22,
- MuseScore CLI availability diagnostic.

Earlier writer milestones also recorded MuseScore and alphaTab evidence for the supported monophonic TAB MusicXML baseline.

## Package-root public API

The current `src/index.js` exports exactly these symbols:

| Export | Status | Purpose |
|---|---|---|
| `convertMusicXmlToCanonicalTab` | `VERIFIED_ON_MAIN` | Validates options, performs shared MusicXML inspection, returns preflight plus canonical TAB result or `null` when blocked |
| `preflightMusicXml` | `VERIFIED_ON_MAIN` | Classifies supported input as `PASS`, `WARNING`, or `BLOCKED` |
| `PREFLIGHT_STATUS` | `VERIFIED_ON_MAIN` | Public preflight status constants |
| `getPositionCandidates` | `VERIFIED_ON_MAIN` | Returns physically valid string/fret positions for a MIDI pitch and configuration |
| `positionToMidi` | `VERIFIED_ON_MAIN` | Converts a validated string/fret position to MIDI |
| `validateMidi` | `VERIFIED_ON_MAIN` | Validates MIDI input for fretboard operations |
| `FretboardError` | `VERIFIED_ON_MAIN` | Existing public fretboard error class preserved for compatibility; internally inherits from `EngineError` |

No writer, shared canonical validator, parsed-document adapter, internal inspection helper, `GuitarConfiguration`, or `EngineError` is exported through the package root.

## Internal module and capability status

| Capability or package area | Status | Evidence boundary |
|---|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` | Byte, encoding, null-byte, entity, DOCTYPE, malformed XML, and unsafe-input tests |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` | Central immutable limits for XML structure, measures, events, and processing duration |
| XML structural ceilings | `VERIFIED_ON_MAIN` | Depth, element, attribute, and UTF-8 text-byte limits enforced during the single SAX pass |
| Semantic resource ceilings | `VERIFIED_ON_MAIN` | Measure and event limits enforced before semantic adaptation |
| Runtime deadline/cancellation | `VERIFIED_ON_MAIN` | Monotonic clock validation, deadline checks, `AbortSignal`, and checkpoints through candidate/optimizer loops |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` | Boundary and fail-closed regression coverage |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` | One-pass parsing, immutability, namespaced attribute isolation, and deep-tree regression tests |
| MusicXML structural validation | `VERIFIED_ON_MAIN` | Supported root/part checks and malformed/unsupported structure tests |
| Monophonic MusicXML parser | `VERIFIED_ON_MAIN` | Notes, rests, rhythm, ties, beams, pickups, unsupported-feature, and source-location tests |
| Shared public conversion parse | `VERIFIED_ON_MAIN` | PASS, WARNING, and BLOCKED share one semantic parse; invalid options parse zero times |
| MusicXML preflight | `VERIFIED_ON_MAIN` | Frozen `PASS`, `WARNING`, and `BLOCKED` reports and issue classification |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` | Invariants, immutability, ordering, source preservation, and duration tests |
| Guitar tuning/configuration foundation | `VERIFIED_ON_MAIN` | Six-string tuning validation, MIDI range, unique string numbers, fret limits, and immutable configuration creation |
| Fretboard/playability | `VERIFIED_ON_MAIN` | Candidate, MIDI, fret-limit, and unplayable-note tests |
| Candidate-layer builder | `VERIFIED_ON_MAIN` | Candidate membership, ordering, canonical traversal, and runtime checkpoints |
| Fingering cost model | `VERIFIED_ON_MAIN` | Deterministic movement/preference cost breakdown and profile validation |
| Fingering optimizer | `VERIFIED_ON_MAIN` | Determinism, stable tie-breaking, path reconstruction, long-path regression, and cooperative runtime checkpoints |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` | Result invariants, immutability, warnings, costs, and selected/alternative positions |
| Canonical JSON Schema | `VERIFIED_ON_MAIN` | `schemas/canonical-tab-result.v1.schema.json` and schema-reference tests |
| Shared canonical validator | `VERIFIED_ON_MAIN` | Exact-field, JSON-safety, musical, physical, cost, and warning-index validation |
| JSON writer | `IMPLEMENTED_NOT_PUBLIC` | Deterministic golden output, round-trip, safety, immutability, and shared-contract tests |
| TAB MusicXML writer | `IMPLEMENTED_NOT_PUBLIC` | Deterministic writer tests plus MuseScore and alphaTab evidence |
| ASCII TAB writer | `IMPLEMENTED_NOT_PUBLIC` | Six-string rendering, rests, measures, fret alignment, determinism, immutability, and shared-contract tests |
| Internal `EngineError 1.0.0` | `IMPLEMENTED_NOT_PUBLIC` | Current domain errors converge on the shared internal base while preserving existing domain metadata |
| Public writer API | `PARTIAL` | Writers exist and are tested internally but are not exported from `src/index.js` |
| Public engine-error boundary | `NOT_IMPLEMENTED` | No package-root `EngineError` export or separately versioned external error envelope exists |
| Versioned `GuitarConfiguration 1.0` | `PARTIAL` | Internal configuration foundation exists; stable public/versioned identity and stronger pitch/MIDI consistency remain future work |
| Optimizer observation contract | `NOT_IMPLEMENTED` | Future immutable diagnostic/learning boundary only |
| Pedagogical feature vector | `NOT_IMPLEMENTED` | Deterministic cost components exist but no versioned feature contract exists |
| Teacher-feedback event package | `NOT_IMPLEMENTED` | Future contract only |
| Fixed teacher benchmark | `NOT_IMPLEMENTED` | No versioned teacher-verified evaluation dataset exists in this repository |
| Learned candidate scorer | `NOT_IMPLEMENTED` | Future shadow-mode research only after prerequisite contracts and benchmark |
| Training pipeline/model registry | `NOT_IMPLEMENTED` | Future extension only |
| HTTP service | `NOT_IMPLEMENTED` | Outside the current package boundary |
| UI/mobile package | `NOT_IMPLEMENTED` | Outside the current package boundary |
| PDF/OMR/Audiveris package | `NOT_IMPLEMENTED` | Outside the current package boundary |
| SesliTab adapter | `NOT_IMPLEMENTED` | Outside the current package boundary |

## Output status

| Output | Implementation | Package-root availability | Strongest evidence |
|---|---|---|---|
| Canonical JavaScript object | Merged | Public through conversion API | Full repository suite and current conversion tests |
| JSON text | Merged internal writer | Not public | Golden, round-trip, shared-contract, and full-suite tests |
| TAB MusicXML | Merged internal writer | Not public | Writer tests, MuseScore evidence, alphaTab import/SVG/browser checks |
| ASCII TAB | Merged internal writer | Not public | Deterministic six-string writer and full-suite tests |
| PDF | Not implemented | Not available | None |

## Error-contract status

`src/errors/engineError.js` defines internal `EngineError 1.0.0`. Milestones 2D-1 through 2D-4 converged the repository's current domain error classes on that base without changing package-root exports.

This is not a public API promise. A future public error-boundary decision must separately evaluate exported classes, compatibility, external field guarantees, wrapping, causes, recoverability, and versioning.

## Guitar-configuration status

The current internal configuration supports six strings, standard tuning by default, validated custom open-string MIDI values, and configurable fret range. It is already consumed by candidate generation and copied into canonical TAB results.

A future `GuitarConfiguration 1.0` milestone should strengthen and version this existing boundary rather than create a competing configuration model. Alternative tunings must remain physically validated before optimizer or learned-ranking use.

## CI supply-chain status

Repository workflow action references were pinned to immutable full commit SHAs in SEC-CI-1. Workflow permissions and runtime matrices were preserved during that change. Any future action update must be reviewed as a dependency/supply-chain change rather than silently returning to mutable tags.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- Compatibility evidence is tied to named versions, fixtures, and workflow environments.
- MuseScore and alphaTab evidence does not cover unsupported chords, polyphony, tuplets, grace notes, multipart, or multistaff scores.
- No package release has been published because the package is private and `UNLICENSED`.
- Pull-request CI validates the tested branch tree; merged `main` remains the authority for implemented behavior.
- Branch protection and repository rulesets are governance settings, not package behavior, and are tracked separately in `docs/current-status.md`.

## Status governance

1. Only merged behavior may be marked `VERIFIED_ON_MAIN` or `IMPLEMENTED_NOT_PUBLIC`.
2. Record exact commits and workflow runs for material runtime claims.
3. Re-run Node.js 18, 20, and 22 when runtime behavior, dependencies, entry points, or tests change.
4. Re-run MusicXML compatibility checks when parser, canonical contracts, tuning, rhythm, selected-position, or writer behavior changes.
5. Update this file when `package.json`, `package-lock.json`, `src/index.js`, schemas, dependencies, outputs, error surface, or CI evidence changes.
6. Do not describe unavailable evidence as passed.
7. Do not expose internal writers or `EngineError` merely because their implementations are stable; package-root changes require an explicit compatibility gate.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External MuseScore and browser compatibility checks require the dedicated workflow or documented compatibility environment.
