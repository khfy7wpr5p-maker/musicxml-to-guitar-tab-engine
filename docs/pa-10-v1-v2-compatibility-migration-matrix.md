# PA-10.3 Canonical v1 ↔ v2 Compatibility and Migration Matrix

## Status

- Gate: `PA-10`
- Slice: `PA-10.3` — explicit v1 ↔ v2 compatibility and migration matrix
- Status: `IN_PROGRESS_DOCUMENTATION_ONLY`
- Stage Start Approval: granted on 2026-08-13
- Authoritative base: `main` at `942bff46d6798b4077f5b60609355cd8f5750c6f`
- Runtime change: none
- Test change: none
- Workflow change: none
- Public API change: none
- Writer change: none
- `CanonicalTabResult 1.0.0` change: none
- `CanonicalTabResult 2.0.0` schema implementation: not authorized
- Version-dispatch implementation: not authorized
- Canonical migration implementation: not authorized
- Final voicing/fingering selection: not authorized
- PA-10.4+: not authorized by this slice

This slice defines how the frozen public `CanonicalTabResult 1.0.0` contract and a future separately approved `CanonicalTabResult 2.0.0` contract are allowed to coexist.

The central decision is:

> v1/v2 compatibility is based on explicit version coexistence and fail-closed dispatch, not on silently converting canonical artifacts between versions.

A canonical artifact must remain truthful to the schema and authority that produced it. Compatibility must not be obtained by dropping required information, inventing missing provenance, or relabeling one semantic model as another.

## 1. Authority carried forward from PA-10.0 through PA-10.2

PA-10.3 inherits these already-established constraints:

1. `CanonicalTabResult 1.0.0` remains frozen and authoritative for the current public monophonic conversion path.
2. v1 uses exact schema identity and exact-key validation.
3. v1 accepts only note/rest events, staff `1`, zero/one logical voice, one linear measure cursor, and one selected guitar position per note.
4. v1 continues to fail closed for unsupported polyphonic input on the current public path.
5. a chord/polyphony-aware canonical result requires a separate major contract, working target `CanonicalTabResult 2.0.0`.
6. v2 must preserve source identity, arrangement provenance, selected guitar realization, selected fingering/barre facts where applicable, and physical-validation provenance.
7. PA-7/PA-8/PA-9 candidate enumeration is not final-selection authority.
8. writers serialize an already-selected canonical result and must not rerun arrangement/fingering selection.
9. public API expansion remains separately gated.
10. unsupported versions must fail closed rather than be interpreted by field similarity.

PA-10.3 does not alter any of those constraints.

## 2. Definitions used by this matrix

### 2.1 Native consumption

A consumer validates and consumes an artifact using the validator and semantics for the artifact's exact `schemaVersion`.

### 2.2 Version dispatch

A version-aware consumer reads the exact schema identity and routes the artifact to the matching exact validator/adapter.

Dispatch is not migration.

### 2.3 Canonical migration

A canonical migration transforms a canonical artifact of one schema version into a canonical artifact of another schema version while preserving all canonical meaning required by the destination contract without inventing unsupported facts.

### 2.4 Source-assisted reprocessing

Source-assisted reprocessing starts again from authoritative validated source material and runs an independently authorized pipeline for the requested canonical version.

Reprocessing is not artifact migration.

### 2.5 Lossy export / compatibility view

A lossy export or compatibility view may intentionally omit information for a downstream presentation or interchange target.

Such an export is not a canonical migration and must never be relabeled as a `CanonicalTabResult` version whose contract it does not fully satisfy.

## 3. Consumer compatibility matrix

| Artifact presented | Consumer capability | Result | Required behavior |
|---|---|---|---|
| valid v1 | v1-only consumer | `SUPPORTED_NATIVE` | validate as exact `1.0.0`; consume without transformation |
| valid v1 | future dual v1+v2 consumer | `SUPPORTED_BY_DISPATCH` | dispatch to exact v1 validator; do not up-convert first |
| valid v1 | future v2-only consumer | `NOT_DIRECTLY_COMPATIBLE` | reject as unsupported unless a separately defined source-assisted path is available; do not fabricate a v2 artifact from v1 alone |
| valid v2 | future v2-only consumer | `SUPPORTED_NATIVE_FUTURE` | only after an approved v2 schema/validator exists |
| valid v2 | future dual v1+v2 consumer | `SUPPORTED_BY_DISPATCH_FUTURE` | dispatch to exact v2 validator; do not down-convert first |
| valid v2 | v1-only consumer | `UNSUPPORTED_FAIL_CLOSED` | reject `2.0.0`; no canonical downgrade fallback |
| unknown/future version | any consumer without exact support | `UNSUPPORTED_FAIL_CLOSED` | reject exact unsupported version |
| missing/ambiguous version | any versioned consumer | `INVALID_FAIL_CLOSED` | do not infer version from field shape |

The matrix deliberately makes coexistence the normal compatibility mechanism.

## 4. Canonical artifact migration matrix

| From | To | PA-10.3 decision | Reason |
|---|---|---|---|
| v1 artifact | v1 artifact | `NO_MIGRATION_REQUIRED` | same exact contract; validate and preserve existing deterministic v1 artifact |
| v1 artifact | v2 artifact | `NO_GENERIC_CANONICAL_UPGRADE_FROM_ARTIFACT_ALONE` | v1 does not contain all provenance required by PA-10.2; a transform would have to invent or reconstruct missing v2-only facts |
| v2 artifact | v1 artifact | `CANONICAL_DOWNGRADE_PROHIBITED` | v1 cannot represent required v2 polyphonic/provenance/fingering/validation meaning without information loss |
| v2 artifact | v2 artifact | `NO_MIGRATION_REQUIRED_FOR_EXACT_VERSION` | same exact contract once v2 exists; later v2.x/v3 migration policy is outside this slice |
| unsupported version | supported version | `NO_GUESSING_MIGRATION` | an unknown contract cannot be safely transformed by field similarity |

This matrix is normative for later PA-10 schema/dispatch work unless a separately approved major architecture review changes it.

## 5. Why a v1 artifact alone cannot be treated as a lossless v2 source

PA-10.2 requires future v2 canonical truth to preserve information that v1 does not explicitly model, including:

- explicit source-to-arrangement decision provenance;
- one final disposition for every source note;
- source MIDI distinct from target MIDI where transformation occurs;
- explicit simultaneity provenance where applicable;
- final-selection provenance for selected guitar realization;
- selected fingering/barre facts for selected shapes where applicable;
- physical-validation policy provenance where applicable;
- future final-selection policy identity where material.

A v1 artifact was never designed to be a compact serialization of PA-1→PA-9 provenance. Its absence of those fields is valid v1 behavior, not an error.

Therefore an automatic v1→v2 transform from the v1 artifact alone would have only unsafe choices:

1. invent missing arrangement/provenance facts;
2. infer them from field similarity;
3. mark required v2 facts as if they had been validated when they had not;
4. weaken the future v2 schema so that required PA-10.2 truth becomes optional merely for migration convenience.

PA-10.3 rejects all four approaches.

### 5.1 Source-assisted v2 production is a different operation

If the original authoritative MusicXML/source model is still available, a future approved v2 pipeline may process that source directly and produce a new v2 canonical result.

That result would be produced from source truth plus the approved v2 arrangement/final-selection authorities. It is **not** an upgrade of the old v1 artifact.

The old v1 artifact may remain stored beside the independently produced v2 result if a product/storage layer later chooses to retain both.

## 6. Why canonical v2 → v1 downgrade is prohibited

PA-10.2 records v2 information that v1 cannot represent, including:

- multiple source voices/staves;
- simultaneous retained notes at one onset;
- explicit source-to-arrangement disposition provenance;
- multiple selected guitar positions at one onset;
- selected chord fingering and barre/partial-barre facts;
- physical-validation provenance;
- future final-selection provenance.

A canonical v2→v1 conversion would necessarily discard at least some of those facts for genuine v2 results.

Changing `schemaVersion` to `1.0.0` after dropping those fields would create an object that may validate syntactically as v1 while misrepresenting the canonical meaning of the v2 result.

PA-10.3 therefore establishes:

> No generic or silent `CanonicalTabResult 2.0.0` → `CanonicalTabResult 1.0.0` canonical downgrade is allowed.

This prohibition applies even when a particular v2 result appears visually monophonic. A v2 result may still carry required provenance that v1 cannot represent.

### 6.1 Legacy presentation is not canonical downgrade

A future separately approved writer/export adapter may potentially generate a legacy presentation/interchange view when the target format cannot express all v2 information.

Such output:

- must not be labeled `CanonicalTabResult 1.0.0` unless it was independently produced and validated under the v1 contract;
- must not mutate the canonical v2 artifact;
- must declare any intentional information loss under its own adapter/export contract;
- must not be used to bypass current public polyphonic rejection rules.

No such adapter is implemented or authorized by PA-10.3.

## 7. Safe source-to-version scenario matrix

| Authoritative source | Requested canonical result | Safe architectural path |
|---|---|---|
| source inside current public monophonic scope | v1 | run current public v1 pipeline |
| source inside current public monophonic scope | future v2 | run a future separately approved v2 pipeline from source; do not upgrade a v1 artifact |
| polyphonic/chord-aware source | v1 | current v1 public pipeline remains unsupported/fail-closed; do not use v2 as a downgrade bridge |
| polyphonic/chord-aware source | future v2 | only a future separately approved v2 arrangement/final-selection pipeline may produce v2 |

This preserves source truth and prevents canonical versions from becoming escape hatches around one another's support boundaries.

## 8. Exact version-dispatch rules carried to PA-10.5

PA-10.3 defines the compatibility behavior that PA-10.5 must later express as an exact dispatch contract.

A future dual-version dispatcher must satisfy at least these rules:

1. dispatch uses exact canonical schema identity;
2. `1.0.0` routes only to the v1 validator/consumer path;
3. `2.0.0` routes only to the v2 validator/consumer path once v2 exists;
4. an unsupported `1.x`, `2.x`, `3.x`, malformed, missing, or ambiguous version fails closed;
5. consumers must not assume semver-range compatibility merely because the major version matches;
6. consumers must not probe compatibility by deleting unknown fields;
7. consumers must not rewrite `schemaVersion` to force another validator;
8. successful dispatch does not authorize migration;
9. input validation must occur under the exact selected version contract;
10. writer selection must follow the validated canonical version and must not perform downgrade/upgrade implicitly.

The hostile-safe mechanics for reading version identity, exact error vocabulary, and runtime implementation remain PA-10.5 or later.

## 9. v1 contract preservation rules

PA-10.3 does not create a compatibility exception inside v1.

The current v1 validator continues to require, among its frozen invariants:

- `documentType === 'CanonicalTabResult'`;
- `schemaVersion === '1.0.0'`;
- exact root/event keys;
- note/rest event vocabulary only;
- staff exactly `1`;
- zero/one logical voice;
- one linear measure cursor;
- one `selectedPosition` per note;
- `requiresTeacherReview === true`;
- deterministic counts/cost/warning consistency.

A v2 field added to a v1-labeled artifact remains an unknown-field error rather than an additive compatibility extension.

## 10. Teacher-review / approval semantics

The current v1 canonical validator requires `requiresTeacherReview: true`.

PA-10.2 refers to future approved final arrangement truth in the sense of an arrangement chosen by an authorized later selection authority. That wording must not be interpreted as proof that a human teacher approved the result.

PA-10.3 therefore records these migration/compatibility rules:

1. version migration or source reprocessing must never infer human teacher approval;
2. v1 review-required status must not be silently converted into an approved status;
3. a future v2 schema must represent review/approval state explicitly enough to avoid conflating algorithmic final selection with human teacher approval;
4. absence of teacher approval cannot be repaired by a version transform;
5. exact future v2 review-state fields belong to PA-10.4, not this slice.

## 11. Writer compatibility matrix

| Canonical input | Current v1 writer | Future v2 writer | Future dual writer |
|---|---|---|---|
| valid v1 | supported | not required to support | dispatch to v1 writer path |
| valid v2 | reject/unsupported | future support only after separate approval | dispatch to v2 writer path |
| unknown version | reject | reject | reject |

Writer rules:

- current v1 writers remain unchanged;
- a writer must validate/consume the exact canonical version it claims to support;
- a v2 writer must serialize already-selected v2 truth and must not rerun arrangement, candidate generation, fingering, playability validation, or final selection;
- a dual writer must dispatch by exact version rather than converting v2 to v1 first;
- format-specific information loss, if ever allowed, is an adapter/export policy and not canonical migration.

## 12. Public API compatibility matrix

Current package-root behavior remains unchanged by PA-10.3.

| API surface | PA-10.3 status |
|---|---|
| current `convertMusicXmlToCanonicalTab` public monophonic path | remains v1-only and unchanged |
| current v1 serializers | remain v1-only and unchanged |
| package-root v2 conversion API | not authorized |
| package-root version selector | not authorized |
| public polyphonic arrangement API | not authorized; remains planned for later separately approved gate |
| Integration Contract v1 | unchanged |

No caller should begin depending on a v2 public API merely because the migration matrix names `CanonicalTabResult 2.0.0` as the working future target.

## 13. Stored artifacts, caches and identity

PA-10.3 does not implement persistence, but later storage/integration work must preserve version identity.

Any future storage/cache design that stores canonical results should treat at least these as distinct artifact identities:

- canonical schema version;
- canonical content/digest under that version;
- source identity/provenance as required by the contract.

A v2 result must not overwrite a v1 result merely because both originated from the same source document. They are different canonical artifacts with different semantics.

A cache hit for one version must not be returned to a request for another version through relabeling or field deletion.

## 14. Failure matrix

| Condition | Required behavior |
|---|---|
| v1 validator receives `schemaVersion: '2.0.0'` | fail closed as unsupported canonical schema |
| v1-labeled object contains v2-only fields | fail closed under v1 exact-key rules |
| future v2 validator receives `schemaVersion: '1.0.0'` | fail closed as unsupported for that validator; dual dispatcher may route to v1 instead |
| version missing | fail closed |
| version malformed | fail closed |
| version unknown | fail closed |
| invalid v1 artifact requested for v2 production | reject; do not migrate invalid input |
| valid v1 artifact requested as v2 without source | no generic canonical upgrade |
| valid v2 artifact requested as v1 | canonical downgrade prohibited |
| original polyphonic source requested through v1 public path | preserve current unsupported/fail-closed behavior |
| writer receives unsupported canonical version | reject; no fallback conversion |

## 15. Information-loss classification

PA-10.3 distinguishes three classes:

### Class A — lossless native consumption

The artifact is validated and consumed under its own exact schema version.

Allowed.

### Class B — source-assisted independent reproduction

The original authoritative source is processed again through a separately approved pipeline for another canonical version.

Potentially allowed in later stages, but this is not migration and this slice does not implement it.

### Class C — artifact transform that invents or drops canonical truth

Examples:

- synthesizing v2 arrangement decision provenance from v1 fields without source authority;
- dropping v2 simultaneous membership to fit v1;
- discarding v2 fingering/barre/physical-validation provenance and relabeling as v1;
- converting a v2 polyphonic arrangement into a v1-looking linear event stream;
- changing only `schemaVersion` while retaining incompatible semantics.

Prohibited as canonical migration.

## 16. PA-10.4 requirements derived from this matrix

The minimal `CanonicalTabResult 2.0.0` schema proposal in PA-10.4 must be compatible with these decisions:

1. v2 is a separate exact major contract, not an extension hidden inside v1;
2. v2 need not be shaped so that a v1 artifact can be automatically upgraded;
3. v2 must not omit PA-10.2-required provenance merely to make downgrade easier;
4. v2 must carry enough explicit identity for exact version dispatch;
5. v2 must distinguish algorithmic final selection from human teacher approval/review state;
6. v2 must support source-assisted production from authoritative source truth rather than relying on v1 as an intermediate canonical artifact;
7. no v2 design may require current v1 writers/consumers to understand v2 fields;
8. the schema must preserve enough truth that writers do not need to reconstruct arrangement/fingering decisions.

## 17. PA-10.5 requirements derived from this matrix

The later version-dispatch/fail-closed proposal must define:

- exact version detection;
- exact supported-version table;
- hostile-safe inspection rules;
- exact validator routing;
- exact unsupported-version errors;
- no fallback validator probing that mutates/deletes fields;
- no implicit upgrade/downgrade;
- version-aware writer routing;
- validation-before-use discipline.

PA-10.5 must not reinterpret this matrix as authorization for runtime migration code.

## 18. Acceptance criteria for PA-10.3

PA-10.3 is complete when review confirms that the matrix:

- preserves frozen v1 behavior and current public monophonic authority;
- defines explicit coexistence through exact version dispatch;
- rejects silent upgrade and silent downgrade;
- records that v1 artifacts alone do not contain all required v2 provenance;
- records that canonical v2→v1 downgrade would lose required v2 meaning and is prohibited;
- distinguishes artifact migration from source-assisted reprocessing;
- distinguishes canonical migration from lossy presentation/export adapters;
- preserves current public polyphonic fail-closed behavior;
- preserves writer non-reoptimization authority boundaries;
- prevents version conversion from implying teacher approval;
- defines requirements carried to PA-10.4 and PA-10.5 without implementing either;
- does not modify runtime, tests, workflows, package metadata, writers, public API, or `CanonicalTabResult 1.0.0`;
- passes exact-head repository CI;
- receives independent scope/architecture review;
- remains separately merge-gated.

## 19. Non-authority statement

This document does not authorize:

- implementation of `CanonicalTabResult 2.0.0`;
- any v2 schema/validator module;
- changes to the existing v1 validator;
- runtime version dispatch;
- v1→v2 canonical migration code;
- v2→v1 canonical downgrade code;
- lossy legacy export adapters;
- source-assisted v2 reprocessing implementation;
- writer behavior changes;
- changes to `src/index.js`;
- public polyphonic conversion;
- weakening any current `UNSUPPORTED_*` fail-closed rule;
- final candidate ranking;
- final voicing/fingering selection;
- transition/path optimization;
- executable semantics for deferred arrangement decision kinds;
- PA-10.4 schema implementation;
- PA-10.5 dispatch implementation;
- PA-11 benchmark work;
- PA-12 E2E work;
- PA-13 public API work;
- branch cleanup;
- merge without separate Merge Approval.
