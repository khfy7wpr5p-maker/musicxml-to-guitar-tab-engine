# Current Implementation Status

This document records the verified runtime state of the authoritative `main` branch.

## Snapshot

- Status date: 2026-08-07
- Verified `main`: `e60426d841981011518ec04435f93b3e8a7d71b2`
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Milestone 3 public writer API: `MERGED`
- PEB-1 public error detection boundary: `MERGED`
- G0.1 administrator enforcement: `GOVERNANCE_OPEN`

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on `main` |
| `PARTIAL` | Foundation exists but named capability is incomplete |
| `NOT_STARTED` | No approved merged implementation exists |
| `BLOCKED` | Work must not begin until prerequisites/evidence are complete |
| `GOVERNANCE_OPEN` | Repository/process issue remains unresolved |

## Completed security and architecture milestones

| Milestone | Status | Result |
|---|---|---|
| 2A | `MERGED` | Immutable `ParsedMusicXmlDocument` and one SAX parse foundation |
| 2B | `MERGED` | Public preflight and conversion share one semantic parse |
| 2C-1 | `MERGED` | Central immutable `ProcessingBudget 1.0.0` |
| 2C-2 | `MERGED` | XML depth, element, attribute, UTF-8 text limits |
| 2C-3 | `MERGED` | Measure/event limits |
| 2C-4 | `MERGED` | Deadline, monotonic clock, `AbortSignal` cancellation |
| 2C-5 | `MERGED` | Hostile-input and boundary regression corpus |
| 2C-4.1 | `MERGED` | Runtime checkpoints through candidate/optimizer loops |
| SEC-CI-1 | `MERGED` | Third-party GitHub Actions pinned to immutable SHAs |
| 2D-1 | `MERGED` | Common internal `EngineError 1.0.0` foundation |
| 2D-2 | `MERGED` | Guitar/fingering errors converged |
| 2D-3 | `MERGED` | Canonical/writer errors converged |
| 2D-4 | `MERGED` | MusicXML adapter convergence completed |
| Milestone 3 | `MERGED` | JSON, ASCII TAB, TAB MusicXML serializers exposed at package root |
| PEB-1 | `MERGED` | Public `ENGINE_ERROR_CONTRACT_VERSION` and `isEngineError(value)` without exporting `EngineError` |

## Current merged runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | Encoding/null/entity/DOCTYPE policy plus structural/resource ceilings |
| Parsed XML | `MERGED` | Immutable single-pass parsed representation |
| MusicXML validation/parser | `MERGED` | Supported single-part, single-staff, single-voice monophonic scope |
| Processing limits | `MERGED` | Byte/XML/measure/event/deadline/cancellation/runtime checkpoints |
| Preflight | `MERGED` | Frozen PASS/WARNING/BLOCKED reports |
| Canonical music | `MERGED` | Immutable `CanonicalMusicDocument` |
| Guitar configuration foundation | `MERGED` | Six-string tuning/fret validation and immutable internal config |
| Physical candidates | `MERGED` | All physically valid string/fret positions |
| Cost model | `MERGED` | Explainable deterministic costs |
| Optimizer | `MERGED` | Deterministic dynamic programming and stable tie-breaking |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0` |
| Runtime canonical validator | `MERGED` | Structural, musical, physical and JSON-safety validation |
| JSON writer | `MERGED` | Deterministic public serializer |
| ASCII TAB writer | `MERGED` | Deterministic public serializer using authoritative selected positions |
| TAB MusicXML writer | `MERGED` | Deterministic public serializer using authoritative selected positions |
| Internal error convergence | `MERGED` | Domain errors inherit from internal `EngineError 1.0.0` |
| Public error detection | `MERGED` | `ENGINE_ERROR_CONTRACT_VERSION` + `isEngineError(value)` |

## Public package-root API

Current `src/index.js` exposes:

- `ENGINE_ERROR_CONTRACT_VERSION`
- `FretboardError`
- `PREFLIGHT_STATUS`
- `convertMusicXmlToCanonicalTab`
- `getPositionCandidates`
- `isEngineError`
- `positionToMidi`
- `preflightMusicXml`
- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`
- `validateMidi`

`EngineError`, `GuitarConfigurationError`, `CanonicalTabResultError`, and writer-specific error classes remain internal.

## EngineError boundary

`EngineError 1.0.0` is an internal base class, not a public constructor contract. External callers use `isEngineError(error)` and inspect stable fields such as `code`, `name`, `details`, and `message` for caught engine errors. Programmatic branching should prefer `code` rather than message text.

`isEngineError` is nominal (`instanceof` based). This is appropriate for errors caught directly from the installed package, but it is not a serialized-error detector and cross-package-copy scenarios may require a future separately approved integration/error-envelope design.

## Guitar configuration status

The internal configuration foundation exists and is already used by candidate generation. `GuitarConfiguration 1.0` remains `PARTIAL`: the next milestone should add a stable versioned identity and stronger centralized consistency rules without replacing the current physical model.

## Integration Contract v1

`Integration Contract v1` is approved in the roadmap but `NOT_STARTED`.

It must define the stable boundary between this deterministic core and external systems. It should cover supported inputs/outputs, public error detection/versioning, configuration/version references, compatibility expectations, and explicit integration non-authorities. It must not add HTTP, UI, OMR, SesliTab, or application logic to the core engine.

## Learning-system infrastructure

The deterministic cost model already exposes useful components, but the following are not yet versioned contracts:

- `OptimizerObservation 1.0.0`
- `PedagogicalFeatureVector 1.0`
- `TeacherFeedback 1.0`
- deterministic teacher-verified benchmark
- learned candidate ranking

## Repository governance status

| Item | Status | Evidence |
|---|---|---|
| `main` protected | configured | GitHub reports protected branch |
| Seven required checks | configured | Node.js and MusicXML/browser compatibility contexts required |
| Administrator enforcement | `GOVERNANCE_OPEN` | enforcement reports `non_admins` |
| Repository ruleset | `GOVERNANCE_OPEN` | latest inspection found no ruleset |

## Verification evidence and limitation

Milestone 3 exact-head PR CI passed before merge.

PEB-1 local validation on exact head `fea4e35b4df4d6fbba2ebd15f5fda3da69ccbc35` produced:

- `npm test`: 241/241 passed
- focused EngineError/public-API tests: 17/17 passed
- `git diff --check`: passed
- `npm pack --dry-run`: passed

GitHub-hosted PEB-1 workflows did **not** execute because GitHub reported account payment/spending-limit restrictions. They must not be described as passed CI. This is an evidence limitation, not a demonstrated code failure.

## Approved next safe implementation order

| Order | Work item | Status |
|---:|---|---|
| 1 | Documentation convergence after Milestone 3 + PEB-1 | `ACTIVE` |
| 2 | `GuitarConfiguration 1.0` | `PARTIAL` |
| 3 | `Integration Contract v1` | `NOT_STARTED` |
| 4 | `OptimizerObservation 1.0.0` | `NOT_STARTED` |
| 5 | `PedagogicalFeatureVector 1.0` | `NOT_STARTED` |
| 6 | `TeacherFeedback 1.0` | `NOT_STARTED` |
| 7 | Deterministic fingering benchmark v1 | `NOT_STARTED` |
| 8 | Learned ranking v1 — shadow | `BLOCKED` |
| 9 | Learned ranking v1 — controlled | `BLOCKED` |

G0.1 administrator-bypass hardening remains a parallel governance task.

## Long-term chord/barre sequence

1. Chord / simultaneous-event model
2. Left-hand shape contract
3. Finger assignment + barre / partial-barre representation
4. Chord candidate generator
5. Physical playability validator v2
6. Deterministic left-hand optimizer
7. Pedagogical feature vector v2
8. Chord benchmark v2
9. Learned pedagogical ranking v2

## Explicitly not implemented

- public `EngineError` class export
- public writer/domain error class exports
- versioned `GuitarConfiguration 1.0`
- `Integration Contract v1`
- observation/feature/feedback contracts
- teacher benchmark
- learned ranking/training/model registry
- HTTP/UI/mobile/PDF/OMR/Audiveris/SesliTab integration
- chords/polyphony/finger assignment/barre
- multipart/multistaff/grace-note/tuplet/`.mxl` support

## Update rule

Update this file whenever merged behavior changes feature availability, public API state, contracts, blockers, verification evidence, or the approved next safe step.
