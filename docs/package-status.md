# Package and Verification Status

This document records the current package surface and strongest available verification evidence for authoritative `main`.

## Snapshot

- Status date: 2026-08-08
- Verified runtime `main`: `312261cb374d1959c993530b10c42d32ab8c3caf`
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
- OptimizerObservation, OptimizerObservationDigest, PedagogicalFeatureVector, and TeacherFeedback APIs

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
| Internal `OptimizerObservationDigest 1.0.0` | `VERIFIED_ON_MAIN` |
| S2 observation content-digest binding | `VERIFIED_ON_MAIN` |
| Internal `PedagogicalFeatureVector 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| Internal `TeacherFeedback 1.1.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| TeacherFeedback exact observation/candidate hardening | `VERIFIED_ON_MAIN` |
| TeacherFeedback shared full-observation admission | `VERIFIED_ON_MAIN` |
| TeacherFeedback required digest verification | `VERIFIED_ON_MAIN` |
| Historical PR #44 TeacherFeedback P2 threads | `RESOLVED` |
| Trusted-producer authenticity / provenance admission | `NOT_IMPLEMENTED` |
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

## Observation, digest, feature, and feedback foundation status

The following modules are merged but remain internal and are not loaded by the normal package-root conversion path:

- `OptimizerObservation 1.0.0`
- `OptimizerObservationDigest 1.0.0`
- `PedagogicalFeatureVector 1.0.0`
- `TeacherFeedback 1.1.0`

They do not change candidate generation, physical validation, deterministic optimization, `CanonicalTabResult`, or writer output.

OptimizerObservation Step 1 and Step 2.1–2.4 hardening are merged. S1 adds the reusable internal `validateOptimizerObservation()` boundary. It validates supported observation, candidate, optimizer, and guitar-configuration versions; canonical six-string tuning semantics/order; dense decisions and candidates; unique event identities; decision/candidate array-index identity; canonical candidate position/ID consistency; selected-position membership; selected playable-cost shape; and aggregate selected cost.

S2 adds `OptimizerObservationDigest 1.0.0`. It validates the complete observation first, then computes a domain-separated SHA-256 fingerprint using deterministic canonical serialization. The canonicalizer rejects cycles, excessive depth, unsupported/non-finite values, sparse/custom arrays, symbols, accessors, non-enumerable data, and non-plain objects so content cannot be silently excluded from the digest.

TeacherFeedback 1.1.0 requires a bounded opaque `observationId`, a complete valid observation, and a matching `observationDigest`. The runtime recomputes the digest and fails closed on mismatch before event-specific feedback checks. The verified digest is copied into the frozen feedback record. Exact candidate grammar/bounds, optimizer-selected candidate equality, and exact same-event override membership remain enforced.

This establishes observation **content integrity relative to the supplied digest**, not trusted-producer authenticity. A party able to construct another valid observation can compute a matching digest for that other observation. The package does not provide a digital signature, producer attestation, persistence receipt, global observation-ID registry, benchmark/dataset admission, or separately versioned consent/privacy or lawful-use record.

## Verification evidence

### Current runtime snapshot

Fresh merge-post GitHub-hosted Tests #321 on `main` `312261cb374d1959c993530b10c42d32ab8c3caf` completed successfully on Node.js 18, 20, and 22.

The exact head of PR #58 (`085613708e7369ee57b5868ff6499bb39775d5b5`) passed GitHub-hosted Tests #320 and MusicXML Compatibility #167. Compatibility verified complete repository tests plus alphaTab import/SVG on Node.js 18/20/22, the browser renderer/cursor job, and MuseScore availability.

The alphaTab synthesizer diagnostic within Compatibility #167 is intentionally non-blocking and continued to report `Maximum call stack size exceeded` followed by readiness timeout. It remains a separate P3 compatibility diagnostic rather than an S2 regression. The workflow overall completed successfully.

No separate post-merge `main` MusicXML Compatibility run is claimed.

## CI supply-chain and governance

- Third-party workflow actions are pinned to immutable full commit SHAs.
- `main` remains protected with the recorded required status contexts.
- The latest settings inspection still reports required-check enforcement at `non_admins`, leaving administrator-bypass hardening open.
- This documentation update does not alter repository settings.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- MuseScore/alphaTab evidence applies only to supported fixtures and scope.
- The non-blocking synth diagnostic failure is not represented as a passing synthesizer compatibility result.
- S2 digest equality does not prove producer identity, historical-run authenticity, persistence, global observation-ID uniqueness, dataset admission, consent/lawful-use authorization, or a research dataset pipeline.
- The three historical OptimizerObservation P2 review threads on PR #42 are resolved; their runtime findings are addressed by merged Step 1 and Step 2.1–2.4 work.
- The two historical TeacherFeedback P2 review threads on PR #44 are resolved; their runtime findings are addressed by merged PR #54 hardening. Thread resolution was repository bookkeeping only and did not change runtime behavior.
- No package release is claimed; package metadata remains `private: true` and `UNLICENSED`.

## Approved next package-level sequence

The next package-level sequence is:

1. separately approve S3 observation provenance / dataset-admission contract work, keeping trusted-producer, persistence, and consent/lawful-use authority outside TeacherFeedback
2. create the deterministic teacher-verified fingering benchmark v1 only after sufficient S3 provenance/admission constraints are verified
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
