# Package and Verification Status

This document records the current package surface and strongest available verification evidence for authoritative `main`.

## Snapshot

- Status date: 2026-08-08
- Verified runtime `main`: `316ce430c7721b2736721d6dff4a1eea3daedb03`
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
| S1 reusable full OptimizerObservation validation | `VERIFIED_ON_MAIN` |
| Internal `PedagogicalFeatureVector 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| Internal `TeacherFeedback 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| TeacherFeedback exact observation/candidate hardening | `VERIFIED_ON_MAIN` |
| TeacherFeedback shared full-observation admission | `VERIFIED_ON_MAIN` |
| Historical PR #44 TeacherFeedback P2 threads | `RESOLVED` |
| Observation content-digest/provenance binding | `NOT_IMPLEMENTED` |
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

OptimizerObservation Step 1 and Step 2.1–2.4 hardening are merged. S1 adds the reusable internal `validateOptimizerObservation()` boundary. It validates supported observation, candidate, optimizer, and guitar-configuration versions; canonical six-string tuning semantics/order; dense decisions and candidates; unique event identities; decision/candidate array-index identity; canonical candidate position/ID consistency; selected-position membership; selected playable-cost shape; and aggregate selected cost. `createOptimizerObservation()` validates its completed observation through this same boundary before returning the deeply frozen record.

TeacherFeedback hardening is also merged. The feedback boundary now requires a bounded opaque `observationId`, runs the supplied supported observation through the shared full validator, requires the feedback optimizer candidate to equal the observation's selected candidate, validates the complete canonical candidate grammar and guitar bounds, requires override candidates to belong to the exact same-event observed candidate set, and rejects unsupported fields so consent/personal metadata cannot be silently folded into the TeacherFeedback record.

This does **not** create cryptographic provenance. A valid observation object is fully checked against the supported contract, but the package does not yet provide a content digest or cryptographic binding that proves the object came from one particular historical optimizer run. Persistence, a global observation-ID uniqueness registry, benchmark/dataset admission, and separately versioned consent/privacy or lawful-use records for secondary data use also remain outside these foundations.

## Verification evidence

### Milestone 3

Milestone 3 exact-head pull-request CI passed before merge and provided package-root regression evidence for the three public writer serializers.

### Current runtime snapshot

Fresh merge-post GitHub-hosted Tests #311 on `main` `316ce430c7721b2736721d6dff4a1eea3daedb03` completed successfully on Node.js 18, 20, and 22.

The exact head of PR #56 (`28d362390c8191546e014713c7b6992c87900615`) passed GitHub-hosted Tests #310 and MusicXML Compatibility #159. Compatibility verified complete repository tests plus alphaTab import/SVG on Node.js 18/20/22, the browser renderer/cursor job, and MuseScore availability.

The alphaTab synthesizer diagnostic within Compatibility #159 is intentionally non-blocking and reported `Maximum call stack size exceeded` followed by readiness timeout. The same diagnostic failure occurred on an earlier S1 head before the final tuning-validation commits, so it is recorded as a separate P3 compatibility diagnostic rather than an S1 regression. The workflow overall completed successfully.

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
- The non-blocking synth diagnostic failure is not represented as a passing synthesizer compatibility result.
- Full S1 observation validation does not create cryptographic/content-digest provenance, persistence, global observation-ID uniqueness, benchmark/dataset admission, consent/lawful-use records, or a research dataset pipeline.
- The three historical OptimizerObservation P2 review threads on PR #42 are resolved; their runtime findings are addressed by merged Step 1 and Step 2.1–2.4 work.
- The two historical TeacherFeedback P2 review threads on PR #44 are resolved; their runtime findings are addressed by merged PR #54 hardening. Thread resolution was repository bookkeeping only and did not change runtime behavior.
- No package release is claimed; package metadata remains `private: true` and `UNLICENSED`.

## Approved next package-level sequence

The authoritative status set and applicable versioned contracts are converged through the verified runtime commit. The next package-level sequence is:

1. separately approve S2 observation content-digest/provenance binding
2. create the deterministic teacher-verified fingering benchmark v1 under separately approved provenance/data-admission constraints
3. implement the benchmark evaluation harness
4. evaluate learned ranking in shadow mode only
5. build a separately versioned teacher-feedback research-dataset pipeline with explicit persistence/admission and consent/privacy or lawful-use records
6. require an evaluation gate against the deterministic baseline
7. allow controlled learned ranking only after separate evidence/approval

G0.1 administrator-bypass hardening remains a parallel governance task.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.
