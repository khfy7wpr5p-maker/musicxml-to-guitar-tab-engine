# GuitarSet v2 Runtime Shadow Connection Review v1

Stage: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`

Architecture snapshot: 2026-08-24

Base reviewed main: `50859edb322e65a3c8d3db74564fef871f10623f` (PR #145 merged).

## Decision

A narrowly scoped internal runtime connection is permitted for `GUITARSET-OBSERVED-VOICING-MODEL.v2` as a **default-off, non-authoritative diagnostic shadow observer**.

This decision does not authorize learned final selection, public runtime exposure, live/user-input execution or production.

## Sealed identities

- retained model artifact SHA-256: `7a56436c27ee6d996a49e7f989d37d7ffff187232277095b176c3c395c432314`
- feature schema SHA-256: `617981e90cce46c941596d1bd50ffffff64e6816c59d8f0dbed1acd6d8938285`
- protocol SHA-256: `db67d88c4889a2b8c63411cd1e9bbd7481248dfbdd76da67f5df60b3871b4c02`
- shadow integration review SHA-256: `f42809c1ca9d5f6ff1c62dd072c91a9195bb46e1714e88bd84e8a5a57eef9140`

The training repository remains read-only. The retained artifact is not rewritten and its own runtime/shadow authorization provenance remains false.

## Runtime seam

```text
PA-7 candidate generation exactly once
        ↓
authentic immutable DeterministicPa7CandidateSnapshotHandoff
        ├─→ PA-8 → PA-9 → deterministic baseline selection
        └─→ detached deeply frozen PA-7 read-copy
              ↓
            sealed GuitarSet v2 feature/model contract
              ↓
            runtime-budgeted diagnostic score/evidence only
```

The reviewed engine bridge is:

`src/learning/guitarsetVoicingModelV2RuntimeShadow.js`

The sealed v2 model/feature implementation remains:

`src/learning/guitarsetVoicingModelV2Shadow.js`

No other ordinary runtime source is allowed to import/activate the adapter or bridge. Neither is package-root exported.

## Required invariants

1. PA-7 generation count is exactly one on the multi-note runtime-shadow path.
2. Deterministic PA-8/PA-9 selection and shadow observation share the same PA-7 lineage.
3. Learned code receives only a detached deeply frozen copy, never the authentic authoritative snapshot object.
4. Candidate group identity, candidate IDs, count/order and sourceEventId/targetMidi/string/fret facts are preserved before scoring.
5. Shadow scoring cannot generate, mutate, filter, delete or feed ranking into deterministic selection.
6. Model/artifact/scoring failures are isolated as diagnostic evidence; deterministic output survives unchanged.
7. A successfully created read-copy remains reported as created even if later model validation/scoring fails.
8. ProcessingRuntime checkpoints cover shadow copy, copy verification, model validation, per-candidate scoring, ranking, report verification and freezing.
9. `PROCESSING_ABORTED`, `PROCESSING_DEADLINE_EXCEEDED` and invalid runtime-configuration errors propagate as runtime-safety failures; they are not downgraded to diagnostic shadow failures.
10. Default behavior performs no shadow scoring and does not require model-artifact validation.
11. Singleton/no-PA-7 paths remain outside runtime-shadow scoring.
12. `CanonicalTabResult 1.0.0`, writers and package-root API remain unchanged.
13. Runtime-budgeted score/rank output must remain exactly compatible with the sealed offline v2 report for the same PA-7 snapshot/model artifact.

## Authority matrix

| Authority | State |
|---|---|
| internal runtime shadow connection | allowed, default-off |
| explicit internal diagnostic scoring | allowed through reviewed bridge |
| live/user input | false |
| candidate generation | false |
| candidate mutation | false |
| candidate filtering/deletion | false |
| deterministic/final selection effect | false |
| canonical result effect | false |
| TAB output effect | false |
| checkpoint mutation | false |
| refit/retraining | false |
| `fret20QualityAuthority` | false |
| public package-root exposure | false |
| production authority | false |

Runtime shadow connection: internal default-off.
Live/user input: false.
Authoritative optimizer/canonical/TAB effect: false.
Production: false.

## Runtime safety boundary

Shadow work is part of the caller-supplied `ProcessingRuntime` budget when enabled. The bridge performs checkpoints throughout candidate-copy and candidate-scoring work instead of checking only before/after the shadow stage. Deadline, cancellation and runtime-configuration failures propagate normally, preserving the engine's safety contract. Learned/model-specific failures remain isolated because they carry no deterministic authority.

## Scientific boundary

Candidate domain is 0..20, but positive observed GuitarSet gold remains 0..19. Scoring fret-20 candidates is permitted as preregistered candidate-domain diagnostics; it does not create positive-gold quality evidence. `fret20QualityAuthority=false` remains mandatory.

Controlled offline evidence remains historical and sealed as `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

## Verification gate

Before merge, the exact PR head must pass:

- Node.js 18/20/22 complete tests;
- MusicXML compatibility tests;
- alphaTab MusicXML import/SVG on Node.js 18/20/22;
- alphaTab browser renderer/cursor and synth diagnostic;
- MuseScore availability probe;
- package-root/public API regression;
- runtime-shadow isolation/default-off/failure-isolation tests;
- runtime deadline propagation test;
- runtime-vs-offline score/rank exact parity test;
- architecture documentation consistency.

Any deterministic output drift, candidate identity drift, public API exposure, learned decision effect, live/user-input enablement, model identity drift, swallowed runtime-safety error or failed mandatory CI is a fail-closed stop condition.
