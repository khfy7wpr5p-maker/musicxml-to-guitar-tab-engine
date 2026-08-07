# Current Implementation Status

This document records the verified runtime state of the authoritative `main` branch and separates merged behavior from the active Milestone 3 branch proposal.

## Snapshot

- Status date: 2026-08-07
- Verified pre-Milestone-3 runtime baseline: `73b04a9f18f6fbb3c3a2e2e584d09d25fc66f099`
- Baseline change: documentation convergence after Milestones 2C and 2D (PR #35)
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Active controlled product milestone: Milestone 3 public writer API
- Active branch: `feature/public-writer-api-m3`
- Milestone 3 target: expose three existing serializer functions from `src/index.js` without exporting writer error classes or `EngineError`

Until the Milestone 3 pull request is merged, its package-root additions are branch-only and must not be described as current `main` capability.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented, tested, and present on the verified runtime baseline |
| `PARTIAL` | Required foundations exist, but the named capability remains incomplete |
| `BRANCH_ONLY` | Implemented on an active branch but not an authoritative `main` capability until merge |
| `NOT_STARTED` | No approved merged implementation exists |
| `BLOCKED` | Work must not begin until named dependencies or evidence are complete |
| `OUT_OF_SCOPE` | Deliberately outside the current engine boundary |
| `GOVERNANCE_OPEN` | Repository setting or process issue remains unresolved but is not package runtime behavior |

## Completed security and architecture milestones

| Milestone | Status | Verified result |
|---|---|---|
| 2A | `MERGED` | Immutable `ParsedMusicXmlDocument` and one SAX parse foundation |
| 2B | `MERGED` | Public preflight and conversion share one semantic parse |
| 2C-1 | `MERGED` | Central immutable `ProcessingBudget 1.0.0` contract |
| 2C-2 | `MERGED` | XML depth, element, attribute, and UTF-8 text-byte limits enforced during the SAX pass |
| 2C-3 | `MERGED` | MusicXML measure and event limits enforced before semantic adaptation |
| 2C-4 | `MERGED` | Cooperative deadline, monotonic clock validation, and `AbortSignal` cancellation |
| 2C-5 | `MERGED` | Hostile-input and boundary security regression corpus |
| 2C-4.1 | `MERGED` | Runtime checkpoints propagated through candidate generation and optimizer loops |
| SEC-CI-1 | `MERGED` | Third-party GitHub Actions references pinned to immutable full commit SHAs |
| 2D-1 | `MERGED` | Shared internal `EngineError 1.0.0` foundation for safety/parser-facing errors |
| 2D-2 | `MERGED` | Guitar, playability, fingering, optimizer, and canonical TAB errors converged on `EngineError` |
| 2D-3 | `MERGED` | Pitch, canonical music, contract, and writer errors converged on `EngineError` |
| 2D-4 | `MERGED` | Remaining MusicXML document-adapter error converged while preserving `phase`; current internal domain error convergence complete |
| Documentation convergence | `MERGED` | `AI_CONTEXT.md`, README, current status, and package status aligned with the post-2D runtime through PR #35 |

## Merged runtime capabilities on the verified base

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | UTF-8 policy, null-byte rejection, trusted MusicXML DOCTYPE handling, entity rejection, byte-size protection, and central XML structural ceilings |
| Parsed XML representation | `MERGED` | Immutable internal `ParsedMusicXmlDocument 1.0.0` with ordered attributes, namespace URIs, text, children, and iterative freezing |
| MusicXML structural validation | `MERGED` | Supported `score-partwise` single-part structure validation remains separate from unsupported note semantics |
| MusicXML semantic parser | `MERGED` | One part, one staff, one voice, monophonic notes/rests, supported rhythm, ties, beams, pickups, measures, and time signatures |
| Shared public conversion parse | `MERGED` | PASS, WARNING, and BLOCKED public conversion paths share one immutable semantic parse; invalid options parse zero times |
| Central processing limits | `MERGED` | Byte, XML structure, measure, event, deadline, cancellation, and runtime checkpoint enforcement are present |
| MusicXML preflight | `MERGED` | Returns deeply frozen `PASS`, `WARNING`, or `BLOCKED` reports |
| Canonical music domain | `MERGED` | Builds immutable `CanonicalMusicDocument` data with ordering and duration invariants |
| Guitar configuration foundation | `MERGED` | Standard six-string tuning, custom tuning validation, minimum/maximum fret validation, and immutable configuration creation exist internally |
| Fretboard candidates | `MERGED` | Produces every physically valid string/fret position and rejects unplayable pitches |
| Fingering cost model | `MERGED` | Explainable deterministic position and transition costs with configurable deterministic weights |
| Fingering optimizer | `MERGED` | Deterministic dynamic programming with stable tie-breaking and runtime checkpoints |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0`, selected positions, alternatives, costs, warnings, configuration metadata, and teacher-review requirement |
| Canonical JSON Schema | `MERGED` | `schemas/canonical-tab-result.v1.schema.json` defines the machine-verifiable v1 structure |
| Shared canonical runtime validator | `MERGED` | Validates identity, exact fields, JSON safety, timing, pitch, physical positions, costs, and warning indices |
| JSON writer | `MERGED` | Deterministic serialization without mutation or re-optimization; internal on the verified base |
| TAB MusicXML writer | `MERGED` | Notation plus six-line TAB output using authoritative selected positions; internal on the verified base |
| ASCII TAB writer | `MERGED` | Deterministic six-string ASCII output using authoritative selected positions; internal on the verified base |
| Internal error convergence | `MERGED` | Current domain error classes inherit from internal `EngineError 1.0.0` while preserving domain names, codes, details, and special metadata |
| Package-root API | `MERGED` | Conversion, preflight, and fretboard helpers are the public surface on the verified base |
| Compatibility evidence | `MERGED` | Node.js 18/20/22 plus alphaTab and MuseScore compatibility evidence exists for the supported monophonic baseline |
| CI supply-chain hardening | `MERGED` | Repository workflow action references use immutable commit SHAs |

## Milestone 3 branch scope

Milestone 3 changes the package surface only. It does not change writer implementation behavior, canonical schemas, candidate generation, cost calculation, optimization, tuning, MusicXML parsing, dependencies, or workflows.

The branch proposes exactly three new package-root functions:

- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

The package-root functions are direct references to the already-tested internal writer serializer functions. The public API regression test also locks the complete approved export set.

The following remain intentionally internal in Milestone 3:

- `CanonicalTabJsonWriterError`
- `CanonicalTabAsciiWriterError`
- `CanonicalTabMusicXmlWriterError`
- `EngineError`

Public error semantics are deferred to the separate public error-boundary compatibility audit.

## Writer safety boundary

All three writers consume `CanonicalTabResult` and validate the shared canonical contract before output. They do not regenerate candidates or rerun fingering optimization.

- JSON preserves canonical content and rejects unsafe JSON values rather than silently losing data.
- ASCII TAB renders only authoritative `selectedPosition` data; valid alternative-position changes do not alter visible output.
- TAB MusicXML renders regular notation plus six-line TAB, validates tuning metadata and XML-safe output, and uses authoritative selected positions.

## `EngineError` convergence is internal, not public

`EngineError 1.0.0` is the shared internal base for the repository's current domain errors. It is not exported from `src/index.js`. Existing package-root `FretboardError` compatibility remains unchanged.

Any package-root `EngineError` export, writer error-class export, external error envelope, recoverability field, cause policy, or error reclassification requires the next public compatibility audit. Internal convergence and serializer exposure do not authorize those changes automatically.

## Guitar configuration has a foundation but no versioned public contract

`src/guitar/tuning.js` already validates six-string tuning, unique string numbers, MIDI range, and fret limits and creates an immutable configuration. The next configuration milestone is not a rewrite: it must define a stable versioned identity and centralize stronger consistency rules such as open-string pitch/MIDI agreement before alternative-tuning expansion.

## Learning-system infrastructure is not implemented

The cost model already exposes deterministic components such as fret movement, string movement, large-shift distance, high-fret distance, open-string preference, and same-position continuity. These are implementation facts, not a versioned pedagogical feature contract.

No optimizer-observation contract, teacher-feedback contract, benchmark dataset, learned ranking, model registry, or student personalization exists on `main`.

## Repository governance status

| Governance item | Status | Current evidence |
|---|---|---|
| `main` branch protection | configured | `main` is reported as protected |
| Seven required CI checks | configured | Node.js 18/20/22 plus four MusicXML compatibility/browser checks are required |
| Administrator enforcement | `GOVERNANCE_OPEN` | Required-check enforcement currently reports `non_admins`; administrator bypass hardening remains unresolved |
| Repository rulesets | `GOVERNANCE_OPEN` | Latest read-only inspection returned no repository rulesets |
| Historical Draft PR #24 | complete | Closed without merge after read-only verification that its 2C-2 behavior was superseded on `main` |

Repository governance is not package runtime behavior and must not be represented as a code capability.

## Public API surfaces

### Verified pre-Milestone-3 `main`

`src/index.js` exports:

- `convertMusicXmlToCanonicalTab`
- `preflightMusicXml`
- `PREFLIGHT_STATUS`
- `getPositionCandidates`
- `positionToMidi`
- `validateMidi`
- `FretboardError`

### Milestone 3 target surface

The branch adds:

- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

No error class is added by Milestone 3.

## Approved next safe implementation order

| Order | Work item | Status | Scope |
|---:|---|---|---|
| 1 | G0.1 branch-protection admin hardening | `GOVERNANCE_OPEN` | Preserve existing required checks while applying protection to administrators when an authorized setting surface is available |
| 2 | Milestone 3 public writer API | `BRANCH_ONLY` | Expose exactly three deterministic serializers through the package root; require full CI, review, Ready approval, and separate merge approval |
| 3 | Public error-boundary audit | `NOT_STARTED` | Decide whether `EngineError` or selected domain/writer errors should become public without assuming internal convergence equals public compatibility |
| 4 | `GuitarConfiguration 1.0` | `PARTIAL` | Add versioned immutable configuration identity and stronger tuning consistency while preserving current deterministic behavior |
| 5 | `OptimizerObservation 1.0.0` | `NOT_STARTED` | Immutable observation contract with stable candidate identity, decision trace, cost breakdown, optimizer version, and configuration reference |
| 6 | `PedagogicalFeatureVector 1.0` | `NOT_STARTED` | Version deterministic features already derivable from current engine behavior; do not infer phrase boundaries not represented by the canonical model |
| 7 | `TeacherFeedback 1.0` | `NOT_STARTED` | Record teacher choices outside canonical results; teacher-selected candidate must belong to the deterministic physical candidate set |
| 8 | Deterministic fingering benchmark v1 | `NOT_STARTED` | Fixed teacher-verified benchmark with separated training/validation/locked-test roles before learning experiments |
| 9 | Learned candidate ranking v1 — shadow | `BLOCKED` | Model scores valid candidates but cannot affect optimizer output |
| 10 | Learned candidate ranking v1 — controlled | `BLOCKED` | Only after offline/shadow evidence and separate approval; physical validator veto and deterministic fallback remain mandatory |

## Long-term chord and barre sequence

The approved long-term order is:

1. Chord / simultaneous-event model
2. Left-hand shape contract
3. Finger assignment plus barre / partial-barre representation
4. Chord candidate generator
5. Physical playability validator v2
6. Deterministic left-hand optimizer
7. Pedagogical feature vector v2
8. Chord benchmark v2
9. Learned pedagogical ranking v2

Barre is part of the physical left-hand representation, not merely a writer/display annotation.

## Explicitly not implemented in the Milestone 3 target state

- package-root `EngineError` export or unified external error envelope
- package-root writer error-class exports
- versioned `GuitarConfiguration 1.0`
- optimizer observation contract
- pedagogical feature-vector contract
- teacher-feedback persistence or event contract
- deterministic teacher benchmark
- learned fingering ranking
- automatic training, model registry, shadow deployment infrastructure, or model activation
- student-specific fingering profiles
- HTTP service
- UI, PWA, or mobile application
- PDF processing or OMR gateway
- Audiveris provider
- SesliTab adapter
- chords and polyphony
- left-hand finger assignment, barre, or partial-barre representation
- multipart or multistaff selection
- grace notes and tuplets
- compressed MusicXML `.mxl`

## Verification evidence

The documentation-convergence branch head `b8f2cb2bba8c5eb543766ca825d23c0391bebaf9` completed Tests #226 and MusicXML Compatibility #96 successfully before squash merge as `73b04a9f18f6fbb3c3a2e2e584d09d25fc66f099`.

The final 2D-4 branch head `f4c41c129a9a6730263d85f1e797561802439a2e` completed Tests #224 and MusicXML Compatibility #95 successfully before its squash merge.

Milestone 3 must collect fresh pull-request CI on its exact final head before Ready-for-review. Successful prior writer CI proves the writer implementations, but it does not substitute for package-root regression evidence on the Milestone 3 branch.

## Update rule

Update this file whenever a merged change modifies feature availability, milestone completion, canonical contracts, public API state, architectural blockers, repository-governance notes, or the approved next safe step. Do not describe planned or branch-only behavior as merged capability.
