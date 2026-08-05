# CanonicalTabResult Contract Audit

## Status

- Audit date: 2026-08-05
- Audited base: `main` at `460658ac6d8a0dce82882e5d1668bea8a4f9e050`
- Scope: documentation-only contract audit
- Runtime behavior changed: no
- Schema added: no
- Public API changed: no

This audit records the contract implemented by the current deterministic MusicXML-to-guitar-TAB engine. It does not introduce a new result format and does not authorize writers or integrations to rely on fields that are not produced by the current code.

## 1. Authoritative implementation sources

Until a shared schema and validator are merged, the implemented `CanonicalTabResult` contract is defined by the following sources, in this order:

1. `src/tab/canonicalTabResult.js`
   - defines `CANONICAL_TAB_RESULT_VERSION`
   - creates and deep-freezes the result
   - defines the fields copied from the canonical music document, guitar configuration, candidate generator and optimizer
2. `tests/fixtures/canonical-tab-rest-only.golden.json`
   - records an exact serialized example of the implemented result
3. `tests/canonicalTabResult.test.js`
   - verifies result construction, deterministic event order and invariants
4. `tests/canonicalTabJsonWriter.test.js`
   - verifies JSON round-trip behavior, immutability and byte stability
5. `src/writers/canonicalTabJsonWriter.js` and `src/writers/canonicalTabMusicXmlWriter.js`
   - contain defensive writer-side validation, but are not independent authorities for inventing fields

`docs/DATA-CONTRACT.md` predates the implemented result and is not authoritative while the differences in this audit remain unresolved.

## 2. Implemented top-level contract

The current engine produces a deeply frozen object with these top-level fields:

| Field | Implemented type | Current meaning |
|---|---|---|
| `documentType` | string | Always `CanonicalTabResult` |
| `schemaVersion` | string | Current value `1.0.0` |
| `engine` | object | Engine `name` and package `version` |
| `source` | object | Safe canonical source identity and MusicXML metadata |
| `requiresTeacherReview` | boolean | Always `true` in the current MVP |
| `guitar` | object | Validated tuning and fret limits used for candidate generation |
| `fingeringProfile` | object | Deterministic optimizer profile used for the result |
| `totalFingeringCost` | number | Total cost of the selected complete fingering path |
| `measureCount` | integer | Number of canonical measures |
| `voiceCount` | integer | Current supported result is zero or one voice |
| `noteCount` | integer | Number of note events |
| `restCount` | integer | Number of rest events |
| `measures` | array | Ordered canonical TAB measures |
| `warnings` | array | Flattened warning index referencing measure and event identities |

The implemented result does not contain a top-level success or failure envelope. Conversion failures are represented by preflight blocking or exceptions, not by a failed `CanonicalTabResult`.

## 3. Implemented source object

The current `source` object contains:

| Field | Meaning |
|---|---|
| `documentType` | Source canonical document type |
| `contractVersion` | Source canonical music document contract version |
| `format` | Parsed MusicXML format |
| `version` | MusicXML version when provided |
| `partId` | Selected and validated single part ID |

It does not currently store file names, byte size, hashes, file paths, conversion IDs or the original XML.

## 4. Implemented guitar and fingering data

The `guitar` object contains:

- `tuning`: six entries with `number`, `pitch` and `midi`
- `minimumFret`
- `maximumFret`

The `fingeringProfile` object contains the effective deterministic cost profile, including movement weights, thresholds, preferences and optional hard movement limits.

The current result does not contain a tuning name, capo, student profile, model version or learned scorer metadata.

## 5. Implemented measure contract

Each measure currently contains:

| Field | Meaning |
|---|---|
| `measureKey` | Stable canonical measure identity |
| `measureIndex` | Zero-based array index |
| `visibleMeasureNumber` | Original displayed MusicXML measure number as a string |
| `implicit` | Whether the measure is marked implicit/pickup |
| `timeSignature` | `beats` and `beatType` |
| `divisions` | Active MusicXML divisions value |
| `expectedDurationDivisions` | Duration implied by the time signature |
| `actualDurationDivisions` | Sum of event durations |
| `events` | Ordered note and rest events |
| `warnings` | Measure-level warnings |

The implemented names `measureIndex` and `visibleMeasureNumber` differ from the older draft names `index` and `number`.

## 6. Implemented event contract

Every event contains:

- `eventId`
- `eventIndex`
- `measureKey`
- `type`
- `voice`
- `staff`
- `start`
- `rhythm`
- `warnings`
- `sourceLocation`

Current event types are only:

- `note`
- `rest`

Chord events are not part of `CanonicalTabResult 1.0.0`; unsupported chord or polyphonic input is rejected before result construction.

### Note events

A note event additionally contains:

- `pitch`
- `selectedPosition`
- `alternativePositions`
- `fingeringCost`

`selectedPosition` and every alternative currently contain only:

- `string`
- `fret`

The selected event cost is stored separately as `fingeringCost`. Alternative positions do not currently carry individual cost values or rankings.

### Rest events

A rest event uses:

- `selectedPosition: null`
- `alternativePositions: []`
- `fingeringCost: null`

A rest does not contain `pitch`.

## 7. Implemented pitch and rhythm data

### Pitch

A note pitch contains:

- `step`
- `alter`
- `octave`
- `written`
- `midi`

### Rhythm

Rhythm contains:

- `durationDivisions`
- `type`
- `dots`
- `timeModification`
- `tieStart`
- `tieStop`
- `beam`

The current monophonic parser rejects unsupported tuplets, grace notes, multiple voices and multiple staves.

## 8. Documented-versus-implemented mismatch table

| Older `DATA-CONTRACT.md` concept | Current implementation | Decision for Milestone 1 |
|---|---|---|
| `contractVersion` at result root | `schemaVersion` | Keep current runtime field; document old field as draft only |
| `engineVersion` | `engine.version` | Keep current nested structure |
| `conversionId` | Not produced | Do not invent; consider a future application envelope |
| `status` | Not part of result | Keep failures outside `CanonicalTabResult` |
| `configuration` | `guitar` plus `fingeringProfile` | Keep implemented split |
| `score` | Counts and measures at root | Keep implemented structure for v1 |
| top-level `errors` | Not produced | Future engine error contract, separate milestone |
| event `confidence` | Not in final result | Future optional extension; not required in v1 |
| event `requiresTeacherReview` | Only top-level field exists | Keep top-level v1 behavior |
| `positionCost` inside positions | Selected cost is separate `fingeringCost`; alternatives have no cost | Do not add during documentation freeze |
| chord event | Rejected as unsupported | Do not include in v1 schema |
| `number` and `index` | `visibleMeasureNumber` and `measureIndex` | Use implemented names |
| partial or failed result | Preflight block or exception | Do not describe as canonical output |

## 9. Contract freeze decision

Milestone 1 freezes the currently implemented result shape as the basis for `CanonicalTabResult` schema version `1.0.0`.

The freeze means:

- existing successful conversions must keep the same field names and deterministic values
- existing JSON golden output must remain byte-identical unless a separately approved migration requires otherwise
- writers must consume `selectedPosition` and must not rerun optimization
- writers must not mutate the canonical object
- unsupported features must not be flattened or represented as valid v1 events
- documentation must not state that planned fields are already present

This audit does not itself create the JSON Schema or shared runtime validator. Those belong to the next independently tested branch.

## 10. Future extension boundaries

The following future information may be needed for teacher feedback and learned ranking, but is not required by v1:

- model version
- decision source
- teacher approval status
- teacher correction
- candidate ranking
- confidence
- review metadata
- source document fingerprint
- cost-profile version
- anonymized context features

These fields must not be added ad hoc to v1 event objects. A later proposal must choose one of these versioned approaches:

1. optional namespaced extension objects in a backward-compatible minor schema version
2. a separate immutable teacher-feedback event contract
3. a separate application/result envelope referencing an unchanged canonical result

The preferred direction is to keep teacher feedback and operational conversion state outside the immutable musical result unless a field is necessary to reproduce the deterministic fingering decision.

## 11. Migration policy for the older draft

`docs/DATA-CONTRACT.md` is retained for historical context and marked deprecated. During Milestone 1:

1. no consumer should implement against its example top-level result
2. the shared schema branch will codify the actual v1 object
3. documentation will then be rewritten or split into current contract and future proposals
4. old field names will not become runtime aliases without an explicit compatibility review
5. removal of the deprecated document requires a separate decision after migration notes exist

## 12. Planned contract work

### PR 1B — Canonical schema and shared validator

- add a versioned schema or equivalent machine-verifiable definition
- add one shared runtime contract validator
- add valid and invalid contract fixtures
- preserve current canonical output
- avoid a new runtime dependency unless separately reviewed

### PR 1C — Writer convergence

- replace duplicated writer contract checks with the shared validator
- retain writer-specific output validation
- prove JSON and MusicXML outputs remain deterministic and unchanged
- update the draft ASCII writer work onto the shared contract before review

## 13. Acceptance criteria for this audit

This audit is complete when:

- the implemented result fields are recorded without adding runtime behavior
- the old draft is clearly marked non-authoritative
- architecture documentation points to the actual implementation sources
- future learning fields are identified as optional extension work, not current behavior
- no source, test, dependency, lockfile, package entry point or public API is changed

## 14. Milestone 1B implementation boundary

The independently reviewed Milestone 1B branch adds the machine-verifiable and runtime enforcement layer for the frozen v1 contract:

- `schemas/canonical-tab-result.v1.schema.json` defines the structural contract using JSON Schema Draft 2020-12.
- `src/contracts/canonicalTabResultContract.js` provides the internal `validateCanonicalTabResult()` boundary and stable `CanonicalTabContractError` codes.
- valid and unsupported-schema fixtures record reviewable contract examples.
- contract tests cover JSON-safe data, exact v1 fields, deterministic identities, monophonic timing, pitch and tuning consistency, physical string/fret validity, fingering costs and the flattened warning index.
- no runtime dependency, package-root export, writer refactor or result-shape change is introduced.

The JSON Schema records structural constraints. Cross-field musical invariants remain the responsibility of the shared runtime validator. Existing writers keep their defensive validators until PR 1C migrates them to this shared boundary with byte-identical output tests.

`CanonicalTabResult 1.0.0` remains unchanged. Future model, confidence and teacher-feedback fields remain outside v1 unless a separately reviewed versioned extension is approved.

## 15. Milestone 1C writer convergence boundary

The writer convergence branch makes `src/contracts/canonicalTabResultContract.js` the single canonical input-validation boundary for the JSON and MusicXML writers.

- `canonicalTabJsonWriter.js` delegates exact-field, schema, JSON-safety, cyclic-reference and musical-invariant checks to `validateCanonicalTabResult()`.
- `canonicalTabMusicXmlWriter.js` delegates the same canonical checks to the shared validator and retains only MusicXML output requirements: XML 1.0 character safety, escaping, parseable tuning pitch metadata and MusicXML beam-number limits.
- writer-specific error classes and public error codes remain stable; shared contract `path` and `rule` details are preserved in adapted writer errors.
- compact, pretty and trailing-newline behavior remains unchanged.
- reviewed JSON and MusicXML golden outputs remain byte-identical.
- no package-root export, public API, dependency, parser, optimizer, pipeline, schema or canonical result-shape change is introduced.

After this convergence, writer modules are serializers rather than competing authorities for the `CanonicalTabResult 1.0.0` contract. The draft ASCII writer remains outside this branch and must be updated separately after PR 1C is reviewed and merged.

## 16. Internal ASCII writer convergence boundary

The draft ASCII writer is updated after Milestone 1C to use the same internal canonical validation boundary as the JSON and MusicXML writers.

- `canonicalTabAsciiWriter.js` delegates all `CanonicalTabResult 1.0.0` structure, JSON-safety, musical-invariant, selected-position and cost checks to `validateCanonicalTabResult()`.
- only ASCII-specific option validation and six-string text rendering remain inside the writer.
- `CanonicalTabAsciiWriterError` and the existing ASCII error codes remain stable; shared contract `contractCode`, `path` and `rule` details are preserved in adapted errors.
- the renderer uses only `selectedPosition`, preserves measure boundaries, represents rests and empty measures, aligns double-digit frets and optionally appends one trailing newline.
- tests use contract-valid fixtures and verify that changing valid `alternativePositions` does not affect visible output.
- loading the ASCII writer must not load candidate generation or fingering optimization modules.
- the writer remains internal and is not exported from `src/index.js`; package-root exposure is deferred to the separately reviewed Milestone 3 public writer API.
- no parser, optimizer, pipeline, schema, canonical result shape, package dependency or lockfile change is introduced.

This update keeps PR #16 in draft until its new branch head has passed the complete Tests and MusicXML Compatibility workflows and has received separate approval for Ready-for-review.
