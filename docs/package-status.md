# Package and Verification Status

This document records the current package surface and strongest verified evidence for the authoritative implementation state, plus PA-0 planning boundaries that do not change runtime behavior.

## Snapshot

- Status date: 2026-08-10
- Authoritative `main` head reviewed for PA-0: `3044fc960461334047ae03da4d8bc472479d01e9`
- Latest merged feature: PR #66 — LR-S0 Shadow Ranking Foundation v1
- Exact PR #66 head: `7355004692b14994e69c13ceae75262ceadc6090`
- Exact-head verification: Tests #421 PASS; MusicXML Compatibility #260 PASS; Node.js 22 385/385 tests; npm audit 0 vulnerabilities
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private package metadata (`private: true`)
- License metadata: `UNLICENSED`
- Node.js engine: `>=18`
- Runtime dependency: `saxes@6.0.0`
- B1 benchmark: `TeacherFingeringBenchmark 1.0.0`, internal/fixed/teacher-approved
- B2 harness: `TeacherFingeringBenchmarkEvaluation 1.0.0`, internal/evaluation-only
- LR-S0: internal shadow-ranking foundation, `authority: none`
- PA-0: documentation-only polyphonic guitar-arrangement architecture

No separate post-merge `main` workflow run for `3044fc...` is claimed; the strongest LR-S0 CI evidence is the exact PR head above.

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
| `ENGINE_ERROR_CONTRACT_VERSION` | Public EngineError contract version identifier |
| `FretboardError` | Existing public fretboard error class |
| `PREFLIGHT_STATUS` | Public preflight status constants |
| `convertMusicXmlToCanonicalTab` | Public supported MusicXML-to-canonical-TAB conversion |
| `getPositionCandidates` | Physical guitar candidate helper |
| `isEngineError` | Public nominal detector for caught package errors |
| `positionToMidi` | Guitar position-to-MIDI helper |
| `preflightMusicXml` | Public MusicXML preflight API |
| `serializeCanonicalTabResult` | Deterministic canonical JSON serializer |
| `serializeCanonicalTabResultToAscii` | Deterministic six-string ASCII TAB serializer |
| `serializeCanonicalTabResultToMusicXml` | Deterministic TAB MusicXML serializer |
| `validateMidi` | MIDI validation helper |

The following remain intentionally internal: EngineError/domain subclasses, GuitarConfiguration metadata, Integration Contract metadata, OptimizerObservation/Digest, PedagogicalFeatureVector, TeacherFeedback, ObservationAdmission/AtomicAdapter, B1/B2 benchmark/evaluation components, LR-S0 shadow-ranking components, and all future polyphonic-arrangement components.

## Package capability status

| Capability | Status |
|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` |
| XML/measure/event/deadline/cancellation limits | `VERIFIED_ON_MAIN` |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` |
| Current MusicXML validation/parser | `VERIFIED_ON_MAIN` |
| Shared public monophonic conversion parse | `VERIFIED_ON_MAIN` |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` |
| Guitar configuration foundation | `VERIFIED_ON_MAIN` |
| Fretboard/playability | `VERIFIED_ON_MAIN` |
| Deterministic fingering cost model | `VERIFIED_ON_MAIN` |
| Deterministic fingering optimizer | `VERIFIED_ON_MAIN` |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` |
| Canonical validator | `VERIFIED_ON_MAIN` |
| Public JSON / ASCII / TAB MusicXML writers | `VERIFIED_ON_MAIN` |
| EngineError / PEB-1 | `VERIFIED_ON_MAIN` |
| S1/S2 observation integrity | `VERIFIED_ON_MAIN_INTERNAL` |
| TeacherFeedback integrity foundation | `VERIFIED_ON_MAIN_INTERNAL` |
| S3/S3.1 admission foundations | `VERIFIED_ON_MAIN_INTERNAL` |
| B1 fixed teacher benchmark | `VERIFIED_ON_MAIN_INTERNAL` |
| B2 deterministic evaluation harness | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S0 shadow ranking foundation | `VERIFIED_ON_MAIN_INTERNAL_SHADOW_ONLY` |
| Concrete production durable/atomic admission store | `NOT_IMPLEMENTED` |
| Versioned research privacy/consent/lawful-use boundary | `NOT_IMPLEMENTED` |
| Live TeacherFeedback research/training dataset pipeline | `NOT_IMPLEMENTED` |
| Real learned ranking training/model registry | `NOT_IMPLEMENTED` |
| Production learned selection | `NOT_IMPLEMENTED` |
| Polyphonic source model/projection | `NOT_IMPLEMENTED` |
| Guitar arrangement runtime | `NOT_IMPLEMENTED` |
| Chord/barre/finger assignment | `NOT_IMPLEMENTED` |
| Public arrangement API | `NOT_IMPLEMENTED` |
| HTTP/UI/PDF/OMR/SesliTab/ScoreMosaic integrations | `NOT_IMPLEMENTED` in this repository |

## Current public musical compatibility boundary

The public conversion package currently supports the documented single-part, single-staff, single-voice monophonic `score-partwise` scope.

Chords, multiple voices, multiple staves, and multipart scores remain fail-closed on the current public path. PA-0 does not change this behavior.

## B1/B2 package status

B1 remains fixed independent evaluation infrastructure and is not exported from `src/index.js`.

Current B2 baseline:

| Metric | Count |
|---|---:|
| Benchmark cases | 8 |
| Benchmark events | 32 |
| Acceptable matches | 32 |
| Preferred-eligible events | 28 |
| Preferred matches | 26 |
| Case passes | 8 |
| Candidate-coverage failures | 0 |
| Blocked conversions | 0 |

B1 must remain separate from future training data if it is to continue serving as independent evaluation evidence.

## LR-S0 package status

LR-S0 is present on `main` but intentionally not package-root public API.

It provides:

- internal `ShadowRankingReport 1.0.0`,
- internal `ShadowRankingModel 1.0.0`,
- deterministic shadow suggestions over existing validated observation candidate sets,
- internally recomputed pedagogical features,
- a hand-authored synthetic reference model with content digest,
- mandatory `mode: "shadow"` and `authority: "none"`,
- hostile-input defenses and bounded finite scoring.

It does not change the deterministic optimizer, current `CanonicalTabResult`, package exports, normal conversion, writers, B1/B2 artifacts, or physical validation. It does not train a model and does not authorize production learned selection.

Residual path-policy limitation remains documented in `docs/shadow-ranking-contract.md`; production influence requires explicit binding/validation of relevant path-level policy provenance first.

## PA-0 package boundary

PA-0 is documentation and architecture planning only. It does not add a package export, runtime dependency, schema, model, parser behavior, conversion option, or output format.

The planned extension branches after the existing immutable/safe `ParsedMusicXmlDocument 1.0.0` boundary into a separate future polyphonic projection and arrangement path.

`CanonicalTabResult 1.0.0` remains unchanged. A later PA-10 review will decide whether the future chord-aware result can bridge compatibly or requires a new versioned canonical contract.

See `docs/polyphonic-guitar-arrangement-foundation.md`.

## Output status

| Output | Package-root availability |
|---|---|
| Canonical JavaScript result | Public through current monophonic conversion API |
| JSON text | Public |
| ASCII TAB | Public |
| TAB MusicXML | Public |
| Polyphonic arrangement result | Not implemented |
| Chord-aware canonical result | Not implemented |
| PDF | Not implemented |

All current writers consume validated `CanonicalTabResult 1.0.0` and do not regenerate candidates or rerun optimization.

## Verification evidence

### LR-S0 exact-head evidence

PR #66 exact head `7355004692b14994e69c13ceae75262ceadc6090` passed:

- GitHub-hosted Tests #421,
- Node.js 18 / 20 / 22,
- Node.js 22: 385/385 tests, 0 failures,
- npm audit: 0 vulnerabilities,
- MusicXML Compatibility #260.

The merge commit on `main` is `3044fc960461334047ae03da4d8bc472479d01e9`. This document does not claim a separate post-merge workflow run for that merge commit.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- Current tests do not prove polyphonic arrangement support because PA-0 adds no runtime implementation.
- B1 event-local labels do not establish complete path-level pedagogical truth.
- B1/B2 completion does not authorize training or live data collection.
- LR-S0 shadow output is not production authority and is not evidence that learned ranking is superior.
- S2/S3/S3.1 do not provide cryptographic producer authentication or lawful-use authorization.
- No package release is claimed; package metadata remains `private: true` and `UNLICENSED`.

## Controlled next sequence

### Learning track

1. LR-S0 foundation — merged shadow-only.
2. Shadow evaluation / path-policy provenance binding — separately gated.
3. Durable admission provider + lawful-use/privacy — required before live training data.
4. Real learned training — not started.
5. Independent learned evaluation — required before any opt-in proposal.
6. Controlled learned opt-in — blocked pending evidence and approval.

### Polyphonic arrangement track

1. PA-0 documentation/architecture planning.
2. PA-1 `PolyphonicSourceModel 1.0` contract.
3. PA-2 parallel polyphonic projection.
4. PA-3 simultaneous-event/chord contract.
5. PA-4 arrangement-decision/provenance contract.
6. PA-5 deterministic melody/bass/voice analysis.
7. PA-6 deterministic reduction/octave rules.
8. PA-7 guitar chord/voicing candidates.
9. PA-8 left-hand/finger/barre representation.
10. PA-9 Physical Playability Validator v2.
11. PA-10 canonical compatibility review.
12. PA-11 teacher-approved arrangement benchmark.
13. PA-12 internal polyphonic E2E + monophonic compatibility evidence.
14. PA-13 separate public arrangement API approval.
15. PA-14 external ScoreMosaic/SesliTab adapter integration.

## CI supply-chain and governance

- Third-party workflow actions remain SHA-pinned.
- `main` remains protected with required contexts.
- Required-check enforcement remains recorded at `non_admins`; administrator-bypass hardening remains open.
- PA-0 documentation does not alter repository settings.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.
