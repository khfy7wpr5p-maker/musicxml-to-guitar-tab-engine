# Current Implementation Status

This document records the verified runtime state of the authoritative `main` branch and separates merged behavior from planned work.

## Snapshot

- Status date: 2026-08-07
- Verified runtime baseline: `c0f954a876f171c2a9ac33a510522632dec80d67`
- Baseline change: Milestone 2D-4 final internal `EngineError 1.0.0` convergence
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Next controlled product milestone: Milestone 3 public writer API

If `main` moves beyond this baseline, inspect the new tree and refresh this file before using it as current authority.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented, tested, and present on the verified runtime baseline |
| `PARTIAL` | Required foundations exist, but the named capability remains incomplete |
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

## Merged runtime capabilities

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
| JSON writer | `MERGED` | Internal deterministic serialization without mutation or re-optimization |
| TAB MusicXML writer | `MERGED` | Internal notation plus six-line TAB output using authoritative selected positions |
| ASCII TAB writer | `MERGED` | Internal deterministic six-string ASCII output using authoritative selected positions |
| Internal error convergence | `MERGED` | Current domain error classes inherit from internal `EngineError 1.0.0` while preserving domain names, codes, details, and special metadata |
| Package-root API | `MERGED` | Conversion, preflight, and fretboard helpers remain the only public package-root surface |
| Compatibility evidence | `MERGED` | Node.js 18/20/22 plus alphaTab and MuseScore compatibility evidence exists for the supported monophonic baseline |
| CI supply-chain hardening | `MERGED` | Repository workflow action references use immutable commit SHAs |

## Important distinctions

### Writers are merged but internal

All three deterministic writers exist on `main`:

- `src/writers/canonicalTabJsonWriter.js`
- `src/writers/canonicalTabMusicXmlWriter.js`
- `src/writers/canonicalTabAsciiWriter.js`

None is currently exported from `src/index.js`. They are implemented and tested internal modules, not package-root public APIs. Milestone 3 is therefore still incomplete.

### `EngineError` convergence is internal, not public

`EngineError 1.0.0` is the shared internal base for the repository's current domain errors. It is not exported from `src/index.js`. Existing package-root `FretboardError` compatibility remains unchanged.

Any package-root `EngineError` export, external error envelope, recoverability field, cause policy, or error reclassification requires a separate public compatibility audit. Internal convergence does not authorize those changes automatically.

### Guitar configuration has a foundation but no versioned public contract

`src/guitar/tuning.js` already validates six-string tuning, unique string numbers, MIDI range, and fret limits and creates an immutable configuration. The next configuration milestone is not a rewrite: it must define a stable versioned identity and centralize stronger consistency rules such as open-string pitch/MIDI agreement before alternative-tuning expansion.

### Learning-system infrastructure is not implemented

The cost model already exposes deterministic components such as fret movement, string movement, large-shift distance, high-fret distance, open-string preference, and same-position continuity. These are implementation facts, not a versioned pedagogical feature contract.

No optimizer-observation contract, teacher-feedback contract, benchmark dataset, learned ranking, model registry, or student personalization exists on `main`.

## Repository governance status

| Governance item | Status | Current evidence |
|---|---|---|
| `main` branch protection | `MERGED`/configured | `main` is reported as protected |
| Seven required CI checks | configured | Node.js 18/20/22 plus four MusicXML compatibility/browser checks are required |
| Administrator enforcement | `GOVERNANCE_OPEN` | Required-check enforcement currently reports `non_admins`; administrator bypass hardening remains unresolved |
| Repository rulesets | `GOVERNANCE_OPEN` | Latest read-only inspection returned no repository rulesets |
| Historical Draft PR cleanup | `GOVERNANCE_OPEN` | Draft PR #24 remains open even though its 2C-2 behavior is already superseded on `main`; close only after separate approval |

Repository governance is not package runtime behavior and must not be represented as a code capability.

## Current public API

`src/index.js` currently exports exactly:

- `convertMusicXmlToCanonicalTab`
- `preflightMusicXml`
- `PREFLIGHT_STATUS`
- `getPositionCandidates`
- `positionToMidi`
- `validateMidi`
- `FretboardError`

No writer or `EngineError` export is public yet.

## Approved next safe implementation order

| Order | Work item | Status | Scope |
|---:|---|---|---|
| 1 | G0.1 branch-protection admin hardening | `GOVERNANCE_OPEN` | Preserve existing required checks while applying protection to administrators; repository-setting capability is currently unavailable through the connected write surface |
| 2 | Documentation convergence | `PARTIAL` | Refresh authoritative status chain after 2C/2D; complete only when the documentation PR is merged |
| 3 | Historical Draft PR cleanup | `GOVERNANCE_OPEN` | Audit superseded PRs and close only with separate approval |
| 4 | Milestone 3 public writer API | `PARTIAL` | Expose JSON, ASCII TAB, and TAB MusicXML writers through a controlled package-root API with regression coverage |
| 5 | Public error-boundary audit | `NOT_STARTED` | Decide whether `EngineError` or selected domain errors should become public without assuming internal convergence equals public compatibility |
| 6 | `GuitarConfiguration 1.0` | `PARTIAL` | Add versioned immutable configuration identity and stronger tuning consistency while preserving current deterministic behavior |
| 7 | `OptimizerObservation 1.0.0` | `NOT_STARTED` | Immutable observation contract with stable candidate identity, decision trace, cost breakdown, optimizer version, and configuration reference |
| 8 | `PedagogicalFeatureVector 1.0` | `NOT_STARTED` | Version deterministic features already derivable from current engine behavior; do not infer phrase boundaries not represented by the canonical model |
| 9 | `TeacherFeedback 1.0` | `NOT_STARTED` | Record teacher choices outside canonical results; teacher-selected candidate must belong to the deterministic physical candidate set |
| 10 | Deterministic fingering benchmark v1 | `NOT_STARTED` | Fixed teacher-verified benchmark with separated training/validation/locked-test roles before learning experiments |
| 11 | Learned candidate ranking v1 — shadow | `BLOCKED` | Model scores valid candidates but cannot affect optimizer output |
| 12 | Learned candidate ranking v1 — controlled | `BLOCKED` | Only after offline/shadow evidence and separate approval; physical validator veto and deterministic fallback remain mandatory |

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

## Explicitly not implemented

The following are not current capabilities:

- package-root writer exports
- package-root `EngineError` export or unified external error envelope
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

The final 2D-4 branch head `f4c41c129a9a6730263d85f1e797561802439a2e` completed Tests #224 and MusicXML Compatibility #95 successfully before squash merge as runtime commit `c0f954a876f171c2a9ac33a510522632dec80d67`.

Earlier merged commits on the current ancestry independently record 2C-1 through 2C-5, 2C-4.1, SEC-CI-1, and 2D-1 through 2D-3. Successful pull-request CI is evidence for the tested branch tree; merged `main` is the authority for implemented capability.

## Update rule

Update this file whenever a merged change modifies feature availability, milestone completion, canonical contracts, public API state, architectural blockers, repository-governance notes, or the approved next safe step. Do not describe planned or branch-only behavior as merged capability.
