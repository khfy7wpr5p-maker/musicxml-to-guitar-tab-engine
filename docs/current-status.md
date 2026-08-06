# Current Implementation Status

This document records the verified runtime state of the authoritative `main` branch and separates merged behavior from documentation proposals and future work.

## Snapshot

- Status date: 2026-08-06
- Verified runtime baseline: `7ec42c86ce7a0957a5f79ab3a4e3d2c71475183c`
- Baseline change: Milestone 2B shared one MusicXML parse across public preflight and conversion
- Tested Milestone 2B head: `291d185ffcc9b96675b6d3f956fe2073bb9fed55`
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Next runtime milestone: Milestone 2C resource, deadline, and cancellation limits

If `main` has moved beyond the verified runtime baseline, inspect the new tree and refresh this file before using it as current authority.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented, tested, and present on the verified runtime baseline |
| `PARTIAL` | Required foundations exist, but the capability or milestone is incomplete |
| `DOCS_PR` | Runtime work is merged; documentation completion depends on the pull request containing this file |
| `NOT_STARTED` | No approved merged implementation exists |
| `BLOCKED` | Work must not begin until named dependencies are complete |
| `OUT_OF_SCOPE` | Deliberately outside the current engine boundary |

## Merged runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | UTF-8 checks, null-byte rejection, encoding policy, trusted MusicXML DOCTYPE handling, entity rejection, and byte-size protection |
| Parsed XML representation | `MERGED` | Immutable internal `ParsedMusicXmlDocument 1.0.0` with ordered attributes, namespace URIs, text, children, and iterative freezing |
| MusicXML structural validation | `MERGED` | Validates supported `score-partwise` single-part structure independently from unsupported note semantics |
| MusicXML semantic parser | `MERGED` | Parses one part, one staff, one voice, monophonic notes/rests, supported rhythm, ties, beams, pickups, measures, and time signatures |
| Single-pass direct entry points | `MERGED` | `validateMusicXml()` and `parseMusicXmlNotes()` each construct one SAX parser |
| Shared public conversion parse | `MERGED` | PASS, WARNING, and BLOCKED public conversion paths share one immutable semantic parse; invalid options parse zero times |
| MusicXML preflight | `MERGED` | Returns deeply frozen `PASS`, `WARNING`, or `BLOCKED` reports |
| Canonical music domain | `MERGED` | Builds immutable `CanonicalMusicDocument` data with ordering and duration invariants |
| Guitar configuration | `MERGED` | Standard six-string tuning and configurable fret limits; default range 0–20 |
| Fretboard candidates | `MERGED` | Produces every physically valid string/fret position and rejects unplayable pitches |
| Fingering cost model | `MERGED` | Explainable position and transition costs with configurable deterministic weights |
| Fingering optimizer | `MERGED` | Deterministic dynamic programming with stable tie-breaking and no invented positions |
| Canonical TAB result | `MERGED` | Produces immutable `CanonicalTabResult 1.0.0`, selected positions, alternatives, costs, warnings, configuration metadata, and teacher-review requirement |
| Canonical JSON Schema | `MERGED` | `schemas/canonical-tab-result.v1.schema.json` defines the machine-verifiable v1 structure |
| Shared canonical runtime validator | `MERGED` | Contract modules validate identity, exact fields, JSON safety, timing, pitch, physical positions, cost invariants, and warnings |
| JSON writer | `MERGED` | Internal deterministic serialization without mutation or re-optimization |
| TAB MusicXML writer | `MERGED` | Internal notation plus six-line TAB output using authoritative selected positions |
| ASCII TAB writer | `MERGED` | Internal deterministic six-string ASCII output using authoritative selected positions |
| Writer contract convergence | `MERGED` | JSON, TAB MusicXML, and ASCII writers use the shared canonical validator |
| Conversion pipeline | `MERGED` | Coordinates option validation, one shared MusicXML inspection, preflight, canonical document creation, and TAB result creation |
| Package-root API | `MERGED` | Exposes conversion, preflight, and fretboard helpers listed in `package-status.md` |
| Compatibility evidence | `MERGED` | Node.js matrix plus alphaTab and MuseScore evidence exists for the supported monophonic writer baseline |

## Important distinctions

### Writers are merged but internal

All three deterministic writers exist on `main`:

- `src/writers/canonicalTabJsonWriter.js`
- `src/writers/canonicalTabMusicXmlWriter.js`
- `src/writers/canonicalTabAsciiWriter.js`

None is currently exported from `src/index.js`. They are implemented and tested internal modules, not package-root public APIs.

### Single-pass parsing is complete only through Milestone 2B

Milestone 2A and 2B are merged:

- one parsed XML representation for direct validation/parser entry points,
- one shared semantic parse across public preflight and canonical conversion.

Milestone 2C remains mandatory because the engine does not yet centrally enforce the full set of depth, element, attribute, text, measure, event, deadline, and cancellation ceilings.

### Milestone 2C-1 defines the budget but does not enforce it

The internal `ProcessingBudget 1.0.0` contract centralizes immutable defaults for XML bytes, depth, elements, attributes, text bytes, measures, events, and processing duration. It validates partial overrides and rejects unknown or invalid values with `INVALID_PROCESSING_BUDGET`.

This contract is not a package-root export and is not yet connected to XML parsing, semantic projection, candidate generation, optimization, preflight classification, deadlines, or cancellation. Milestone 2C remains incomplete until those enforcement steps are implemented and verified.

### Public errors remain distributed

Existing layer-specific errors and stable codes remain in use. A common public `EngineError` envelope has not been implemented.

## Priority architecture work

| Priority | Work item | Status | Remaining work |
|---|---|---|---|
| P0.1 | Canonical contract and documentation freeze | `DOCS_PR` | Runtime schema, validator, writer convergence, and audit are merged; this documentation pull request provides the AI entry path and verified status chain |
| P0.2 | Single-pass MusicXML pipeline | `MERGED` | Milestone 2A and 2B are complete |
| P0.3 | Central resource and processing limits | `PARTIAL` | `ProcessingBudget 1.0.0` centralizes validated immutable defaults; wire depth, element, attribute, text, measure, event, deadline, and cancellation enforcement with stable errors |
| P0.4 | Unified public engine error contract | `NOT_STARTED` | Define stage, category, code, details, cause, and recoverability at the public boundary without breaking existing internal errors |
| P1.1 | Complete public output API | `PARTIAL` | Export the three writers and selected error types through a controlled package-root surface |
| P1.2 | Central guitar/tuning validation | `PARTIAL` | Consolidate tuning label/MIDI consistency and reuse one validated configuration across candidate generation, result validation, and writers |
| P1.3 | Wider real-world fixture corpus | `PARTIAL` | Expand supported, warning, invalid, malicious, boundary, compatibility, and regression fixtures |
| P2.1 | Pedagogical feature-vector architecture | `NOT_STARTED` | Separate versioned feature extraction from weighted cost calculation without changing default results |
| P2.2 | Teacher-feedback contract | `NOT_STARTED` | Define immutable, versioned, physically validated teacher-decision events outside the canonical musical result |

## Foundation milestone status

The approved learning-system roadmap requires five foundation milestones before implementing a learned fingering model.

| Milestone | Status | Evidence and gap |
|---|---|---|
| 1. Canonical Contract and Documentation Freeze | `DOCS_PR` | Runtime schema, validator, writer convergence, and audit are merged; the documentation chain becomes complete when the pull request containing this file is merged |
| 2. Single-Pass Secure MusicXML Pipeline | `PARTIAL` | Milestone 2A and 2B are merged; Milestone 2C-1 defines the central budget contract, while resource, deadline, and cancellation enforcement remains |
| 3. Complete Monophonic Public API | `PARTIAL` | Core conversion API exists; writer exports, common errors, central tuning validation, and wider corpus remain |
| 4. Pedagogical Feature Architecture | `NOT_STARTED` | Explainable costs exist, but no versioned pedagogical feature-vector boundary exists |
| 5. Teacher Feedback Contract Design | `NOT_STARTED` | No merged immutable teacher-feedback schema or validation contract exists |

Machine learning, automatic training, and student-specific personalization remain blocked until all five milestones are complete and independently verified.

## Explicitly not implemented

The following are not current capabilities:

- complete Milestone 2C resource, deadline, and cancellation enforcement
- common public `EngineError` contract
- package-root writer exports
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

## Next safe implementation order

1. Complete and merge the documentation pull request containing this file.
2. Implement Milestone 2C central resource, deadline, and cancellation limits in one isolated draft PR.
3. Implement Milestone 2D common public engine-error contract in a separate PR.
4. Complete the monophonic public writer API.
5. Centralize guitar/tuning validation.
6. Expand the real-world and hostile-input fixture corpus.
7. Add versioned pedagogical feature extraction.
8. Define and test the immutable teacher-feedback contract.
9. Only then begin an offline learned candidate-ranking experiment and shadow-mode evaluation.

## Update rule

Update this file whenever a merged change modifies feature availability, milestone completion, canonical contract state, public API state, architectural blockers, or the approved next safe step. Successful pull-request CI is branch evidence, not merged capability.
