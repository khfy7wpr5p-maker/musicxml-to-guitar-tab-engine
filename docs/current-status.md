# Current Implementation Status

This document records the verified runtime state of the authoritative `main` branch.

## Snapshot

- Status date: 2026-08-08
- Verified runtime `main`: `5ba727a778aceb3b70342b82ae027d6ac2bacd43`
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Milestone 3 public writer API: `MERGED`
- PEB-1 public error detection boundary: `MERGED`
- `GuitarConfiguration 1.0.0`: `MERGED`
- `Integration Contract v1`: `MERGED`
- `OptimizerObservation 1.0.0`: `HARDENING_REQUIRED`
- `PedagogicalFeatureVector 1.0.0`: `FOUNDATION`
- `TeacherFeedback 1.0.0`: `HARDENING_REQUIRED`
- Documentation convergence through this snapshot: `DOCUMENTED`
- G0.1 administrator enforcement: `GOVERNANCE_OPEN`

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on `main` |
| `FOUNDATION` | Internal versioned foundation exists but is not integrated into normal conversion |
| `HARDENING_REQUIRED` | Foundation is merged but must not feed benchmark/research data until named validation gaps close |
| `DOCUMENTED` | The four authoritative status documents describe the verified runtime snapshot |
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
| Canonical TAB graph hardening | `MERGED` | Iterative depth/node/output-size limits reject hostile result graphs with structured errors |
| GuitarConfiguration 1.0 | `MERGED` | Versioned immutable six-string physical configuration contract |
| Integration Contract v1 | `MERGED` | Internal version metadata and explicit external non-authorities |

## Merged observation/research foundations

| Foundation | Status | Current boundary |
|---|---|---|
| `OptimizerObservation 1.0.0` | `HARDENING_REQUIRED` | Internal and not pipeline-wired; data-integrity and bounded-traversal gaps must close before downstream use |
| `PedagogicalFeatureVector 1.0.0` | `FOUNDATION` | Internal deterministic descriptive features; not optimizer input or pedagogical truth |
| `TeacherFeedback 1.0.0` | `HARDENING_REQUIRED` | Internal and not pipeline-wired; exact observation/candidate binding and dataset admission remain blocked |

## Current merged runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | Encoding/null/entity/DOCTYPE policy plus structural/resource ceilings |
| Parsed XML | `MERGED` | Immutable single-pass parsed representation |
| MusicXML validation/parser | `MERGED` | Supported single-part, single-staff, single-voice monophonic scope |
| Processing limits | `MERGED` | Byte/XML/measure/event/deadline/cancellation/runtime checkpoints |
| Preflight | `MERGED` | Frozen PASS/WARNING/BLOCKED reports |
| Canonical music | `MERGED` | Immutable `CanonicalMusicDocument` |
| Guitar configuration | `MERGED` | Immutable internal `GuitarConfiguration 1.0.0` with pitch/MIDI consistency validation |
| Physical candidates | `MERGED` | All physically valid string/fret positions |
| Cost model | `MERGED` | Explainable deterministic costs |
| Optimizer | `MERGED` | Deterministic dynamic programming and stable tie-breaking |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0` |
| Runtime canonical validator | `MERGED` | Structural, musical, physical and JSON-safety validation |
| Canonical graph resource limits | `MERGED` | Iterative depth, expanded-node and JSON-output-byte ceilings |
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

Internal `GuitarConfiguration 1.0.0` is merged and used by candidate generation. It centralizes immutable six-string tuning/fret rules and rejects pitch/MIDI disagreement fail-closed. Its version constant, constructor, and error class remain intentionally outside the package-root public API.

## Integration Contract v1

`Integration Contract v1` is merged as internal version metadata and a documented authority boundary. It references current canonical, guitar-configuration, error, and processing-safety contracts while keeping the package-root API unchanged.

It is not a transport, HTTP API, serialized error envelope, persistence layer, UI/OMR/SesliTab adapter, or application framework.

## Learning-system infrastructure

Three internal versioned foundations now exist, but no learning system is active:

- `OptimizerObservation 1.0.0` records candidate membership, selected identity, existing cost data, and version references without changing optimization.
- `PedagogicalFeatureVector 1.0.0` deterministically describes movement/continuity properties without selecting fingering.
- `TeacherFeedback 1.0.0` records accept/override/reject plus an optional bounded reason without mutating canonical output.

Before any benchmark or research dataset use:

1. Observation input must reject sparse arrays, reconcile aggregate/per-decision costs, require complete playable cost records, and bound metadata traversal.
2. Feedback must identify the exact source observation, validate complete candidate identities, and enforce membership in that observation's candidate set.
3. Teacher feedback and optional free-text reasons must remain separate from any research/training consent or lawful-use record.

Traceability: [PR #42](https://github.com/khfy7wpr5p-maker/musicxml-to-guitar-tab-engine/pull/42) retains three unresolved P2 observation-integrity threads, and [PR #44](https://github.com/khfy7wpr5p-maker/musicxml-to-guitar-tab-engine/pull/44) retains two unresolved P2 feedback-identity threads.

The deterministic benchmark, evaluation harness, dataset pipeline, learned ranker, model training, and controlled opt-in are not implemented.

## Repository governance status

| Item | Status | Evidence |
|---|---|---|
| `main` protected | configured | GitHub reports protected branch |
| Workflow supply-chain controls | configured | Third-party actions are pinned and workflow permissions are `contents: read` |
| Administrator enforcement | `GOVERNANCE_OPEN` | Latest recorded settings inspection reported `non_admins` |
| Repository ruleset | `GOVERNANCE_OPEN` | Latest recorded settings inspection found no second ruleset layer |

## Verification evidence and limitation

Fresh local validation on verified runtime `main` `5ba727a778aceb3b70342b82ae027d6ac2bacd43` produced:

- `npm test`: 275/275 passed

The exact head of PR #44, whose runtime tree was merged as `5ba727a`, produced successful GitHub-hosted runs for:

- Tests on Node.js 18, 20, and 22
- complete repository tests plus alphaTab import and SVG render on Node.js 18, 20, and 22
- alphaTab browser renderer/cursor and synthesizer diagnostic on Node.js 22
- MuseScore CLI availability diagnostic

The earlier PEB-1 hosted jobs were blocked by billing/spending limits and remain historical non-evidence for that old head. Fresh later CI succeeded, so that old operational limitation is not a current blanket CI blocker.

Passing tests do not close the recorded observation/feedback data-integrity gaps because the current suites do not cover those hostile cases.

## Approved next safe implementation order

This four-file documentation snapshot is `DOCUMENTED`. The next implementation gates are:

| Order | Work item | Status |
|---:|---|---|
| 1 | `OptimizerObservation 1.0.0` hardening + negative tests | `HARDENING_REQUIRED` |
| 2 | `TeacherFeedback 1.0.0` observation/candidate binding and consent separation | `BLOCKED` |
| 3 | Deterministic teacher-verified fingering benchmark v1 | `BLOCKED` |
| 4 | Benchmark evaluation harness | `NOT_STARTED` |
| 5 | Learned ranking v1 — shadow mode | `BLOCKED` |
| 6 | Teacher feedback to versioned research-dataset pipeline | `BLOCKED` |
| 7 | Learned-ranking evaluation gate against deterministic baseline | `BLOCKED` |
| 8 | Learned ranking v1 — controlled opt-in | `BLOCKED` |

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
- public GuitarConfiguration/Integration/observation/feature/feedback exports
- observation/feature/feedback integration into normal conversion
- hardened observation and feedback dataset-admission boundary
- teacher-feedback persistence or privacy/consent contract
- teacher benchmark
- benchmark evaluation harness and research-dataset pipeline
- learned ranking/training/model registry
- HTTP/UI/mobile/PDF/OMR/Audiveris/SesliTab integration
- chords/polyphony/finger assignment/barre
- multipart/multistaff/grace-note/tuplet/`.mxl` support

## Update rule

Update this file whenever merged behavior changes feature availability, public API state, contracts, blockers, verification evidence, or the approved next safe step.
