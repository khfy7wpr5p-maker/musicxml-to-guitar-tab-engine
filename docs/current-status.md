# Current Implementation Status

This document records what is actually implemented on the authoritative `main` branch. It intentionally separates merged behavior from plans, draft pull requests, and future architecture.

## Snapshot

- Status date: 2026-08-05
- Verified `main` commit: `3f864d7e822e2025d723ab50dca2838e522b1363`
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Runtime change in the latest verified `main` commit: none; the commit is a documentation-only contract audit

If `main` has moved, verify the new tree and refresh this document before using it as an implementation authority.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented, tested, and present on `main` |
| `PARTIAL` | Some required foundations exist, but the capability or milestone is incomplete |
| `DRAFT` | Implemented only in an open or draft pull request; not available on `main` |
| `NOT_STARTED` | No approved implementation is present on `main` |
| `BLOCKED` | Work cannot safely proceed until a named dependency is completed |
| `OUT_OF_SCOPE` | Deliberately outside the current engine boundary |

## What is merged on `main`

| Area | Status | Current behavior |
|---|---|---|
| XML input safety | `MERGED` | UTF-8 and input checks, null-byte rejection, encoding rules, entity/DOCTYPE policy, and input-size protection |
| MusicXML structural validation | `MERGED` | Validates supported `score-partwise` structure and rejects unsupported or malformed input |
| MusicXML preflight | `MERGED` | Returns `PASS`, `WARNING`, or `BLOCKED` reports before conversion |
| Monophonic MusicXML parser | `MERGED` | Parses one selected part, one staff, one voice, notes, rests, supported rhythm values, ties, beams, measures, and time signatures |
| Canonical music domain | `MERGED` | Builds deeply frozen `CanonicalMusicDocument` data with duration and measure invariants |
| Guitar configuration | `MERGED` | Standard six-string tuning and configurable fret limits, with current default range 0–20 |
| Fretboard candidate generation | `MERGED` | Produces every physically valid string/fret position and rejects unplayable pitches |
| Fingering cost model | `MERGED` | Explainable position and transition costs with configurable weights and optional movement limits |
| Fingering optimizer | `MERGED` | Deterministic dynamic programming with stable tie-breaking and no invented positions |
| Canonical TAB result | `MERGED` | Produces deeply frozen `CanonicalTabResult 1.0.0`, selected positions, alternatives, costs, warnings, engine/configuration metadata, and `requiresTeacherReview: true` |
| JSON writer | `MERGED` | Deterministically serializes the canonical result without mutation or re-optimization; currently an internal module rather than a package-root export |
| TAB MusicXML writer | `MERGED` | Produces notation plus six-line TAB from authoritative selected positions; currently an internal module rather than a package-root export |
| Conversion pipeline | `MERGED` | Coordinates preflight and canonical TAB conversion |
| Package-root API | `MERGED` | Exposes conversion, preflight, and fretboard helpers listed in `package-status.md` |
| Compatibility evidence | `MERGED` | MuseScore and alphaTab evidence exists for the merged TAB MusicXML writer baseline |
| Canonical contract audit | `MERGED` | Records the implemented result shape and marks the older data-contract draft as non-authoritative |

## Important implementation distinctions

### Writers exist but are not fully exposed

The deterministic JSON and TAB MusicXML writer modules are present and tested on `main`. They are not currently exported through `src/index.js`, so they are not part of the package-root public API.

### ASCII TAB is not on `main`

An ASCII TAB writer exists in draft pull request #16. Its tests and compatibility checks may pass on that branch, but the feature remains `DRAFT` until merged.

### The canonical contract is audited but not yet machine-enforced centrally

The implemented `CanonicalTabResult 1.0.0` shape is documented by `docs/canonical-contract-audit.md`. A shared schema and one common runtime validator have not yet been merged. Writer-side checks remain duplicated.

## Priority architecture work

| Priority | Work item | Status | Remaining work |
|---|---|---|---|
| P0.1 | Canonical contract and documentation convergence | `PARTIAL` | Add a versioned machine-verifiable schema or equivalent shared definition; add a shared runtime validator; converge writers; complete migration from deprecated draft documentation |
| P0.2 | Single-pass MusicXML pipeline | `NOT_STARTED` | Remove repeated full parse passes; share one safe parsed representation between preflight, validation, and conversion; add performance evidence |
| P0.3 | Complete resource and processing limits | `PARTIAL` | Existing byte/XML safety remains; add central depth, element, text-node, measure, event, note, deadline, and cancellation limits with stable errors |
| P0.4 | Unified public engine error contract | `NOT_STARTED` | Normalize stage, category, code, details, cause, and recoverability at the public boundary |
| P1.1 | Complete public output API | `PARTIAL` | Export JSON and TAB MusicXML writers; reconcile and later rebase the draft ASCII writer onto the shared contract |
| P1.2 | Central guitar/tuning validation | `PARTIAL` | Consolidate pitch-label/MIDI consistency and reuse one validated configuration across candidate generation and writers |
| P1.3 | Wider real-world fixture corpus | `PARTIAL` | Expand supported, warning, invalid, malicious, boundary, compatibility, and regression fixtures |
| P2.1 | Pedagogical feature-vector architecture | `NOT_STARTED` | Separate feature extraction from weighted cost calculation without changing default fingering results |
| P2.2 | Teacher-feedback contract | `NOT_STARTED` | Define immutable, versioned, physically validated teacher-decision events outside the canonical musical result |

## Foundation milestone status

The approved learning-system roadmap requires five foundation milestones before implementing a machine-learning model.

| Milestone | Status | Evidence and gap |
|---|---|---|
| 1. Canonical Contract and Documentation Freeze | `PARTIAL` | Contract audit is merged; shared schema, shared validator, writer convergence, and complete documentation migration remain |
| 2. Single-Pass Secure MusicXML Pipeline | `NOT_STARTED` | Existing security checks are present, but repeated parsing and missing central resource/deadline limits remain |
| 3. Complete Monophonic Public API | `PARTIAL` | Core conversion API exists; writer exports, centralized tuning validation, and wider corpus remain |
| 4. Pedagogical Feature Architecture | `NOT_STARTED` | Current cost model is explainable but no versioned feature-vector boundary exists |
| 5. Teacher Feedback Contract Design | `NOT_STARTED` | No merged immutable teacher-feedback schema or validation contract exists |

Machine learning, automatic training, and student-specific personalization remain blocked until these foundations are completed and independently verified.

## Explicitly not implemented

The following are not current `main` capabilities:

- learned fingering ranking
- automatic training, model registry, shadow deployment, or model activation
- student-specific fingering profiles
- teacher-feedback persistence
- HTTP service
- UI, PWA, or mobile application
- PDF processing or OMR gateway
- Audiveris provider
- SesliTab adapter
- chords and polyphony
- multipart or multistaff selection
- grace notes and tuplets
- user-facing alternative-tuning support
- compressed MusicXML `.mxl`
- package-root ASCII writer

## Open work that must not be treated as merged

- Pull request #16: draft ASCII TAB writer. Branch-only capability; not available on `main`.
- The documentation pull request containing this file: documentation remains proposed until merged.

Before starting new work, inspect all current open pull requests because their numbers, heads, and overlap may have changed after this snapshot.

## Next safe implementation order

1. Add the shared canonical schema and runtime validator.
2. Converge JSON and TAB MusicXML writers on the shared validator; rebase and reassess the ASCII writer.
3. Build the single-pass secure MusicXML pipeline with central resource limits, cancellation, deadline handling, and a unified error boundary.
4. Complete the monophonic public output API, tuning validation, and fixture corpus.
5. Add the versioned pedagogical feature-vector architecture.
6. Define and test the immutable teacher-feedback contract.
7. Only then begin an offline learned candidate-ranking experiment and shadow-mode evaluation.

## Update rule

Update this file whenever a merged change modifies:

- feature availability,
- milestone completion,
- canonical schema state,
- public API state,
- open architectural blockers, or
- the approved next safe step.

A successful draft or pull-request CI run is evidence for that branch, not permission to mark the feature `MERGED`.