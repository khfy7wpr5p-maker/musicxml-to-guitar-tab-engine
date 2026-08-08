# Package and Verification Status

This document records the current package surface and strongest available verification evidence for authoritative `main`.

## Snapshot

- Status date: 2026-08-08
- Verified runtime `main`: `24c22141cede5d3fa0ea945ffd4bbdf6897a62f3`
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private package metadata (`private: true`); repository visibility is separate
- License metadata: `UNLICENSED`
- Node.js engine: `>=18`
- CI runtime targets: Node.js 18, 20, 22
- Runtime dependency: `saxes@6.0.0`

## Package metadata

| Field | Value |
|---|---|
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` |
| `main` | `src/index.js` |
| `test` | `node --test` |
| Node.js engine | `>=18` |
| Runtime dependency | `saxes@6.0.0` |
| License | `UNLICENSED` |

## Current package-root public API

`src/index.js` currently exports exactly:

| Export | Purpose |
|---|---|
| `ENGINE_ERROR_CONTRACT_VERSION` | Public EngineError contract version identifier (`1.0.0`) |
| `FretboardError` | Existing public fretboard error class preserved for compatibility |
| `PREFLIGHT_STATUS` | Public preflight status constants |
| `convertMusicXmlToCanonicalTab` | Public MusicXML-to-canonical-TAB conversion |
| `getPositionCandidates` | Physical guitar position candidate helper |
| `isEngineError` | Public nominal detector for errors inheriting from internal `EngineError` |
| `positionToMidi` | Guitar position-to-MIDI helper |
| `preflightMusicXml` | Public MusicXML preflight API |
| `serializeCanonicalTabResult` | Deterministic canonical JSON serializer |
| `serializeCanonicalTabResultToAscii` | Deterministic six-string ASCII TAB serializer |
| `serializeCanonicalTabResultToMusicXml` | Deterministic TAB MusicXML serializer |
| `validateMidi` | MIDI input validation helper |

The following remain intentionally internal:

- `EngineError`
- `GuitarConfigurationError`
- `CanonicalTabResultError`
- `CanonicalTabJsonWriterError`
- `CanonicalTabAsciiWriterError`
- `CanonicalTabMusicXmlWriterError`
- parser/validation/optimizer/canonical-model domain error subclasses
- OptimizerObservation, PedagogicalFeatureVector, and TeacherFeedback APIs

## Package capability status

| Capability | Status |
|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` |
| XML structural ceilings | `VERIFIED_ON_MAIN` |
| Measure/event limits | `VERIFIED_ON_MAIN` |
| Deadline/cancellation/runtime checkpoints | `VERIFIED_ON_MAIN` |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` |
| MusicXML validation/parser | `VERIFIED_ON_MAIN` |
| Shared public conversion parse | `VERIFIED_ON_MAIN` |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` |
| Guitar configuration foundation | `VERIFIED_ON_MAIN` |
| Fretboard/playability | `VERIFIED_ON_MAIN` |
| Deterministic fingering cost model | `VERIFIED_ON_MAIN` |
| Deterministic fingering optimizer | `VERIFIED_ON_MAIN` |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` |
| Canonical JSON schema/runtime validator | `VERIFIED_ON_MAIN` |
| Public JSON writer serializer | `VERIFIED_ON_MAIN` |
| Public ASCII TAB serializer | `VERIFIED_ON_MAIN` |
| Public TAB MusicXML serializer | `VERIFIED_ON_MAIN` |
| Internal `EngineError 1.0.0` | `VERIFIED_ON_MAIN` |
| PEB-1 public error detection | `VERIFIED_ON_MAIN` |
| Canonical result graph resource limits | `VERIFIED_ON_MAIN` |
| Internal `GuitarConfiguration 1.0.0` | `VERIFIED_ON_MAIN` |
| Internal `Integration Contract v1` metadata | `VERIFIED_ON_MAIN` |
| Internal `OptimizerObservation 1.0.0` | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 1 hostile-data hardening | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.1 cost shape | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.2 selected playability | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.3 aggregate consistency | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.4 regression completeness | `VERIFIED_ON_MAIN` |
| Internal `PedagogicalFeatureVector 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| Internal `TeacherFeedback 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| TeacherFeedback exact observation/candidate hardening | `VERIFIED_ON_MAIN` |
| Historical PR #44 TeacherFeedback P2 threads | `RESOLVED` |
| Fixed teacher benchmark | `NOT_IMPLEMENTED` |
| Benchmark evaluation harness | `NOT_IMPLEMENTED` |
| Teacher-feedback research dataset pipeline | `NOT_IMPLEMENTED` |
| Learned ranking/training pipeline | `NOT_IMPLEMENTED` |
| HTTP/UI/PDF/OMR/SesliTab integrations | `NOT_IMPLEMENTED` in this repository |

## Output status

| Output | Package-root availability |
|---|---|
| Canonical JavaScript result | Public through conversion API |
| JSON text | Public through `serializeCanonicalTabResult` |
| ASCII TAB | Public through `serializeCanonicalTabResultToAscii` |
| TAB MusicXML | Public through `serializeCanonicalTabResultToMusicXml` |
| PDF | Not implemented |

All writers consume validated `CanonicalTabResult` and use authoritative `selectedPosition`; they do not regenerate candidates or rerun optimization.

## Error-contract status

`src/errors/engineError.js` defines internal `EngineError 1.0.0`.

PEB-1 exposes only:

- `ENGINE_ERROR_CONTRACT_VERSION`
- `isEngineError(value)`

The base class itself remains private. `isEngineError` is nominal (`instanceof` based), intended for errors caught directly from the installed package. It is not a serialized-error detector and does not authorize trusting arbitrary lookalike objects.

## Guitar-configuration status

Internal `GuitarConfiguration 1.0.0` is merged and consumed by candidate generation. It provides immutable normalized tuning/fret data, validates six unique strings and MIDI/fret bounds, and rejects supplied pitch/MIDI disagreement. Its version, constructor, and error class remain internal.

## Integration Contract v1 status

`Integration Contract v1` is merged as internal version metadata plus a documented authority/non-authority boundary. It references the existing public package entry points and current canonical, error, guitar-configuration, and processing-safety contracts.

It does not expose new package-root APIs or add HTTP, transport, serialized error envelopes, UI, OMR, SesliTab, persistence, or application logic.

## Observation, feature, and feedback foundation status

The following modules are merged but remain internal and are not loaded by the normal package-root conversion path:

- `OptimizerObservation 1.0.0`
- `PedagogicalFeatureVector 1.0.0`
- `TeacherFeedback 1.0.0`

They do not change candidate generation, physical validation, deterministic optimization, `CanonicalTabResult`, or writer output.

OptimizerObservation Step 1 and Step 2.1–2.4 hardening are merged. The observation builder rejects sparse/cyclic/over-depth hostile data, incomplete selected-cost shape, negative/non-finite selected costs and required breakdown values, unplayable selected costs, selected costs carrying rejection reasons, and aggregate/per-decision selected-cost inconsistency. Independent negative regression cases protect the key selected-playability and negative-cost invariants.

TeacherFeedback hardening is also merged. The feedback boundary now requires a bounded opaque `observationId`, validates against the actual supplied supported `OptimizerObservation`, requires the feedback optimizer candidate to equal the observation's selected candidate, validates the complete canonical candidate grammar and guitar bounds, requires override candidates to belong to the exact same-event observed candidate set, and rejects unsupported fields so consent/personal metadata cannot be silently folded into the TeacherFeedback record.

This does **not** make the broader benchmark/research pipeline ready by itself. TeacherFeedback does not provide persistence, a global observation-ID uniqueness registry, benchmark/dataset admission, or separately versioned consent/privacy or lawful-use records for secondary data use.

## Verification evidence

### Milestone 3

Milestone 3 exact-head pull-request CI passed before merge and provided package-root regression evidence for the three public writer serializers.

### Current runtime snapshot

Fresh merge-post GitHub-hosted Tests #305 on `main` `24c22141cede5d3fa0ea945ffd4bbdf6897a62f3` completed successfully on Node.js 18, 20, and 22.

The exact head of PR #54 (`51f39ad9e763b55a5bcba29dfa53d713907f57bb`) passed GitHub-hosted MusicXML Compatibility #155 on the same tree later merged as current `main`:

- complete repository tests plus alphaTab import and SVG render on Node.js 18, 20, and 22
- alphaTab browser renderer/cursor and synthesizer diagnostic on Node.js 22
- MuseScore CLI availability diagnostic

No separate post-merge `main` MusicXML Compatibility run is claimed.

The historical PEB-1 hosted jobs did not execute because of the then-current billing/spending-limit restriction. Those old jobs remain non-evidence for that head, but later fresh hosted workflows succeeded.

## CI supply-chain and governance

- Third-party workflow actions are pinned to immutable full commit SHAs.
- `main` remains protected with the recorded required status contexts.
- The latest settings inspection still reports required-check enforcement at `non_admins`, leaving administrator-bypass hardening open.
- This documentation update does not alter repository settings.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- MuseScore/alphaTab evidence applies only to supported fixtures and scope.
- OptimizerObservation and TeacherFeedback hardening do not create persistence, global observation-ID uniqueness, benchmark/dataset admission, consent/lawful-use records, or a research dataset pipeline.
- The three historical OptimizerObservation P2 review threads on PR #42 are resolved; their runtime findings are addressed by merged Step 1 and Step 2.1–2.4 work.
- The two historical TeacherFeedback P2 review threads on PR #44 are resolved; their runtime findings are addressed by merged PR #54 hardening. Thread resolution was repository bookkeeping only and did not change runtime behavior.
- No package release is claimed; package metadata remains `private: true` and `UNLICENSED`.

## Approved next package-level sequence

The authoritative status set and applicable versioned contracts are converged through the verified runtime commit. The next package-level sequence is:

1. create the deterministic teacher-verified fingering benchmark v1 under separately approved provenance/data-admission constraints
2. implement the benchmark evaluation harness
3. evaluate learned ranking in shadow mode only
4. build a separately versioned teacher-feedback research-dataset pipeline with explicit persistence/admission and consent/privacy or lawful-use records
5. require an evaluation gate against the deterministic baseline
6. allow controlled learned ranking only after separate evidence/approval

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.
