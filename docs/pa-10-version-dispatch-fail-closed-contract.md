# PA-10.5 Exact Version Dispatch / Fail-Closed Contract

## Status

- Gate: `PA-10`
- Slice: `PA-10.5` — exact version dispatch / fail-closed migration contract
- Status: `IN_PROGRESS_DOCUMENTATION_ONLY`
- Stage Start Approval: granted on 2026-08-13
- Authoritative base: `main` at `cb46307f47f31d299f060da1516c82a456e459c0`
- Runtime change: none
- Test change: none
- Workflow change: none
- Public API change: none
- Writer change: none
- `CanonicalTabResult 1.0.0` change: none
- `CanonicalTabResult 2.0.0` runtime validator: not authorized
- Runtime dispatcher implementation: not authorized
- Canonical migration implementation: not authorized
- Final arrangement/fingering selection implementation: not authorized
- PA-11+: not authorized by this slice

This document defines the exact dispatch behavior required before v1 and a future v2 canonical contract may safely coexist at runtime.

It is a contract proposal only. It does not add a dispatcher, v2 validator, writer, public version selector, migration utility, or polyphonic public API.

The central rule is:

> Dispatch chooses at most one validator from the artifact's exact canonical schema identity. Dispatch never guesses, migrates, retries another version, deletes fields, rewrites versions, or interprets one schema through another.

## 1. Authority carried forward

PA-10.5 inherits these binding decisions from PA-10.0 through PA-10.4:

1. `CanonicalTabResult 1.0.0` remains frozen and authoritative for the current public monophonic path.
2. A chord/polyphony-aware canonical result requires a separate major contract, working target `CanonicalTabResult 2.0.0`.
3. v1 and v2 coexist by exact version dispatch, not by artifact migration.
4. There is no generic canonical v1 -> v2 artifact upgrade.
5. There is no canonical v2 -> v1 downgrade.
6. Source-assisted reprocessing, if later authorized, is not migration.
7. Writers consume already-selected canonical truth and do not reselect arrangements.
8. v2 runtime production cannot exist until separately approved final-selection authority exists.
9. Unsupported, malformed, missing, or ambiguous versions fail closed.
10. Public API expansion remains separately gated.

PA-10.5 does not weaken or reinterpret any of those rules.

## 2. Dispatch scope

The proposed dispatcher is a canonical-artifact routing boundary.

Its only semantic responsibilities are:

1. establish that the supplied value is safe enough to inspect as canonical JSON-like data;
2. read exact canonical identity fields without invoking user-controlled accessors;
3. require `documentType === "CanonicalTabResult"`;
4. require an exact supported `schemaVersion` string;
5. select at most one validator registered for that exact version;
6. return or forward the exact validator result on success;
7. fail closed without fallback on every other case.

The dispatcher is not responsible for:

- MusicXML parsing;
- source-model construction;
- arrangement decisions;
- voicing/fingering candidate generation;
- physical playability selection;
- canonical artifact migration;
- source-assisted reprocessing;
- writer selection beyond exposing the validated exact version to a later version-aware consumer;
- teacher review state changes;
- persistence/cache migration;
- public API negotiation.

## 3. Canonical dispatch identity

The dispatcher recognizes exactly two common identity fields:

```text
canonical artifact identity
├─ documentType
└─ schemaVersion
```

These fields are routing identity only. They are not a substitute for full version-specific validation.

### 3.1 `documentType`

Required exact value:

```text
CanonicalTabResult
```

Rules:

- it must be an own enumerable data property;
- it must be a non-empty string;
- any other value fails closed;
- the dispatcher must not infer canonical type from root shape or filename.

### 3.2 `schemaVersion`

The dispatcher uses exact string equality only.

Initial version table:

| Exact value | Dispatch meaning |
|---|---|
| `1.0.0` | route only to the existing v1 validator |
| `2.0.0` | route only to a separately approved v2 validator when that validator actually exists and is registered |
| anything else | unsupported; fail closed |

No semantic-version range matching is allowed.

The following examples are therefore not aliases for `1.0.0` or `2.0.0`:

- `v1.0.0`
- `01.0.0`
- `1.0`
- `1`
- `1.0.0 `
- ` 1.0.0`
- `1.0.1`
- `1.1.0`
- `2.0`
- `2.0.1`
- `latest`
- numeric `1`
- `null`
- missing value

All fail closed unless a future separately approved exact contract explicitly registers a new exact version.

## 4. Hostile-safe pre-dispatch inspection

Version routing must not introduce a weaker input boundary than the existing canonical validator family.

Before dispatch reads identity values semantically, a future implementation must use a common version-agnostic hostile-data safety inspection that is at least as strict as the repository's existing canonical JSON graph discipline.

It must reject, as applicable:

- Proxy values before unsafe reflective traversal where detectable by the approved runtime mechanism;
- accessors/getters/setters for semantic fields;
- non-plain objects where plain data is required;
- cycles;
- sparse arrays;
- custom/symbol array properties;
- symbol semantic object keys;
- non-enumerable semantic fields;
- unsupported value types;
- `NaN` and infinities;
- numeric `-0` where canonical JSON safety forbids it;
- graph depth/node/output-size limit violations.

The pre-dispatch safety pass must be version-agnostic. It must not require v1 root keys, because v2 has a different exact root shape.

PA-10.5 does not authorize refactoring or extracting `validateJsonGraph`; it only establishes that any future dispatcher implementation must reuse or provide equivalent-or-stronger shared safety semantics before semantic routing.

## 5. Identity property access rule

After hostile-safe graph inspection succeeds, `documentType` and `schemaVersion` must be obtained as validated own data-property values.

A future dispatcher must not:

- trigger a getter to discover a version;
- follow a prototype property for version identity;
- accept a non-enumerable hidden version property;
- accept conflicting symbol metadata;
- call `toString()`, `valueOf()`, coercion hooks, or custom conversion logic to obtain a version;
- normalize whitespace or prefixes.

The raw exact string is authoritative for routing.

## 6. Exact dispatch table

| Input identity | Runtime registration state | Required result | Validator calls |
|---|---|---|---:|
| `CanonicalTabResult` + `1.0.0` | v1 registered | route to v1 | exactly 1 |
| `CanonicalTabResult` + `2.0.0` | v2 registered | route to v2 | exactly 1 |
| `CanonicalTabResult` + `2.0.0` | v2 not implemented/registered | known future schema but unsupported at runtime; fail closed | 0 |
| `CanonicalTabResult` + unknown version | any | fail closed unsupported | 0 |
| wrong `documentType` + any version | any | fail closed | 0 |
| missing `documentType` | any | fail closed | 0 |
| missing `schemaVersion` | any | fail closed | 0 |
| non-string `schemaVersion` | any | fail closed | 0 |
| unsafe hostile graph | any | fail closed before routing | 0 |

The zero-call cases are important: unsupported identity must not be explored by trying validators until one accepts the object.

## 7. Exactly-one-validator invariant

For any one dispatch attempt:

- zero validators are called when identity is unsupported or invalid;
- exactly one validator is called when identity maps to a registered exact validator;
- two or more validators are never called.

The following algorithm is prohibited:

```text
try v1
if v1 fails, try v2
if v2 fails, try something else
```

Validation failure is not evidence that the artifact belongs to another version.

Once exact version dispatch selects a validator, that validator owns the full semantic result.

## 8. v1 route

For exact `schemaVersion === "1.0.0"`:

1. dispatch routes only to the existing v1 canonical validator;
2. the current v1 exact-key contract remains unchanged;
3. v2-only fields in a v1-labeled artifact remain invalid unknown fields;
4. chord/polyphony support is not gained through the dispatcher;
5. current `requiresTeacherReview === true` remains enforced by v1 validation;
6. no v1 field is added, removed, renamed, made optional, or reinterpreted by PA-10.5.

The existing direct v1 validator may continue to reject any non-`1.0.0` version with its current unsupported-schema error behavior.

## 9. v2 route

For exact `schemaVersion === "2.0.0"`:

- the dispatcher may route only to an actually implemented, separately approved, exact v2 validator;
- PA-10.4 documentation alone is not an executable v2 validator;
- until that validator exists and is registered, a `2.0.0` artifact must fail closed as unsupported by the current runtime;
- it must never be routed through v1 as a compatibility fallback;
- it must never be stripped to a v1-looking object;
- it must never be accepted merely because it looks monophonic.

This prevents design documentation from being mistaken for runtime support.

## 10. Validator registration model

A future implementation should use an explicit immutable exact-version registry conceptually equivalent to:

```text
1.0.0 -> v1 validator
2.0.0 -> v2 validator   only after separate approval/implementation
```

Normative rules:

1. each exact version maps to at most one validator;
2. duplicate registrations are invalid configuration;
3. registration is not inferred from filenames or exported function names;
4. wildcard entries are prohibited;
5. major/minor range entries are prohibited;
6. fallback/default validators are prohibited;
7. an unregistered version is unsupported even if documentation for it exists;
8. registry configuration must be deterministic for the process/package version.

The exact code structure and module ownership remain implementation work.

## 11. Full validation remains version-specific

The dispatcher validates routing identity and hostile-safe inspectability only.

After routing:

- v1 exact keys, counts, timing, positions, costs, warnings, and monophonic invariants are validated only by v1;
- future v2 source facts, simultaneity, arrangement decisions, dispositions, selected positions, complete selected shapes, fingering/barres, policy provenance, and review state are validated only by v2.

The dispatcher must not attempt to create a lowest-common-denominator schema between versions.

## 12. No migration during dispatch

Dispatch must never perform any canonical migration operation.

Prohibited during dispatch:

- v1 -> v2 conversion;
- v2 -> v1 conversion;
- source lookup and reprocessing;
- adding v2 provenance to v1;
- deleting v2 provenance to fit v1;
- copying fields into another object shape;
- changing `schemaVersion`;
- replacing unknown fields with defaults;
- recalculating selected positions;
- choosing another fingering;
- changing teacher-review state.

The artifact presented to the selected validator remains the artifact being validated.

## 13. No mutation invariant

Dispatch and validation must not mutate the caller-supplied canonical artifact.

On success or failure, a future dispatcher must not:

- rewrite identity fields;
- delete unknown fields;
- insert defaults;
- sort user arrays in place;
- freeze the caller object as a side effect merely to dispatch;
- rewrite positions, decisions, shapes, or review state.

If a later API returns a normalized/frozen copy, that behavior requires its own explicit contract and is not authorized by PA-10.5.

## 14. Failure classification

PA-10.5 defines behavioral classes, not executable error-code strings.

A later implementation must distinguish at least:

- `UNSAFE_CANONICAL_INPUT` — graph cannot be safely inspected;
- `INVALID_CANONICAL_IDENTITY` — missing/wrong/malformed common identity;
- `UNSUPPORTED_CANONICAL_VERSION` — exact version has no registered runtime validator;
- `INVALID_VERSIONED_CANONICAL_RESULT` — exact validator was selected and rejected the artifact.

The existing v1 validator's current error vocabulary remains unchanged.

Exact new dispatcher error class/code/path strings require a separately reviewed implementation slice; PA-10.5 does not retrofit current errors.

## 15. Failure precedence

A future dispatcher must use deterministic failure precedence:

1. hostile-data safety failure;
2. invalid/missing `documentType`;
3. invalid/missing/non-string `schemaVersion`;
4. unsupported/unregistered exact version;
5. selected version-specific validator failure;
6. success.

It must not leak deeper schema diagnostics for a version that was never validly selected.

## 16. Unsupported-version examples

These must fail before any version-specific validator is called:

```text
schemaVersion = "0.9.0"
schemaVersion = "1.0.1"
schemaVersion = "1.1.0"
schemaVersion = "2.0.1"
schemaVersion = "3.0.0"
schemaVersion = "latest"
schemaVersion = ""
schemaVersion = null
schemaVersion = 2
schemaVersion missing
```

The dispatcher must not say "closest supported version" and must not silently choose a major version.

## 17. Known-but-not-runtime-supported v2 state

During the period after PA-10.4 documentation and before an approved v2 validator exists, `2.0.0` has a special architectural status:

- it is a known design target;
- it is not a supported runtime canonical input;
- dispatch must fail closed with zero validator calls;
- the current public package remains v1-only;
- no test or documentation may treat a hand-built v2 object as production-supported canonical output merely because the design is documented.

This distinction must remain visible until runtime v2 support is separately implemented and verified.

## 18. Writer dispatch boundary

PA-10.5 does not implement writer routing, but it defines the required coupling:

1. canonical input is first dispatched and fully validated under its exact version;
2. writer selection then follows that exact validated version;
3. v1 routes only to v1-capable writer behavior;
4. future v2 routes only to separately approved v2-capable writer behavior;
5. unsupported versions have no writer fallback;
6. no writer may convert v2 to v1 simply to reuse a v1 serializer;
7. no writer may rerun final arrangement/fingering selection.

A future dual writer is version dispatch plus exact version writers, not migration.

## 19. Public API boundary

PA-10.5 does not change the package root.

Current behavior remains:

- current monophonic conversion API produces v1;
- current serializers remain v1-oriented unless separately changed later;
- there is no public `schemaVersion` selector;
- there is no public v2 conversion API;
- there is no public polyphonic arrangement API;
- Integration Contract v1 remains unchanged.

An internal dispatch design does not itself authorize a new package-root export.

## 20. Source-assisted reprocessing boundary

A future system may eventually support a request conceptually equivalent to "produce v2 from the original authoritative source".

That operation is outside dispatch.

Rules carried forward:

- it starts from authoritative source, not the v1 canonical artifact as sufficient source of v2 provenance;
- it runs an independently approved v2 pipeline;
- it produces a distinct v2 artifact;
- it does not mutate or relabel the existing v1 artifact;
- it must not be triggered automatically by a dispatch failure.

## 21. Storage/cache boundary

A future storage/cache layer must include exact canonical schema version in artifact identity.

Dispatch must not allow:

- a v1 cache hit to satisfy a v2 request through relabeling;
- a v2 cache hit to satisfy a v1 request through field deletion;
- one version to overwrite another solely because source identity matches.

Persistence implementation remains outside PA-10.5.

## 22. Security properties

The dispatch contract must preserve these properties:

- deterministic exact routing;
- no parser/validator probing side channel across versions;
- no downgrade fallback;
- no upgrade fallback;
- no version coercion;
- no property-access side effects used to discover identity;
- bounded hostile-safe graph inspection;
- no mutation on failure;
- at most one version validator invocation;
- exact selected validator owns semantic validation.

## 23. Required future characterization tests

PA-10.5 is documentation-only, but a later implementation must include machine-checkable tests covering at least:

1. valid v1 dispatches exactly once to v1;
2. invalid v1-labeled artifact is not retried as v2;
3. v2 exact identity with no registered validator fails with zero version-validator calls;
4. future registered v2 dispatches exactly once to v2;
5. v2 failure is not retried as v1;
6. unknown version invokes zero validators;
7. missing version invokes zero validators;
8. malformed/non-string version invokes zero validators;
9. wrong document type invokes zero validators;
10. semver-near versions such as `1.0.1` fail closed;
11. whitespace/prefix variants fail closed;
12. v2-only fields under a v1 label remain rejected by v1;
13. v1-only artifact under a v2 label is not accepted by shape similarity;
14. accessors/proxies/unsafe graph forms fail before semantic routing;
15. dispatch does not mutate input;
16. unsupported version does not invoke writers;
17. dispatch never changes teacher-review state;
18. dispatch never invokes source reprocessing or final selection.

No such test file is authorized by this slice.

## 24. Acceptance criteria for PA-10.5

PA-10.5 is complete when independent review confirms that this contract:

- routes by exact `documentType` + exact `schemaVersion` only;
- defines exact `1.0.0` -> v1 behavior;
- defines exact future `2.0.0` -> v2 behavior only when an approved validator is actually registered;
- keeps current runtime fail-closed for `2.0.0` until then;
- rejects unsupported/malformed/missing versions without validator probing;
- guarantees at most one version-specific validator call;
- prohibits semver-range or shape-based dispatch;
- prohibits field deletion/version rewriting fallback;
- preserves PA-10.3 no-upgrade/no-downgrade decisions;
- preserves PA-10.4 v2 schema authority without pretending runtime v2 exists;
- requires hostile-safe pre-dispatch inspection;
- preserves no-mutation behavior;
- keeps writers/version consumers downstream of exact validation;
- keeps public v1 API unchanged;
- makes no runtime, tests, workflows, package metadata, writer, public API, or v1 contract changes;
- passes exact-head repository CI;
- receives independent scope/architecture review;
- remains separately merge-gated.

## 25. Non-authority statement

This document does not authorize:

- adding a runtime dispatch function;
- adding a dispatcher export to `src/index.js`;
- creating a v2 validator or constructor;
- changing `canonicalTabResultContract.js`;
- changing canonical contract core behavior;
- changing current v1 error codes;
- adding new runtime error classes;
- changing current writers;
- adding a dual-version writer;
- implementing v1 -> v2 migration;
- implementing v2 -> v1 downgrade;
- source-assisted v2 production;
- final voicing/fingering selection;
- transition/path optimization;
- sustained-sonority selection;
- teacher-review workflow changes;
- public polyphonic conversion;
- package-root version selection;
- storage/cache migrations;
- PA-11 benchmark work;
- PA-12 E2E work;
- PA-13 public arrangement API work;
- branch cleanup;
- merge without separate Merge Approval.
