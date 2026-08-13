# PA-10 Canonical v1/v2 Compatibility Review

## Status

- Gate: `PA-10`
- Slice: `PA-10.0` — canonical authority inventory and compatibility decision boundary
- Status: `IN_PROGRESS_DOCUMENTATION_ONLY`
- Stage Start Approval: granted on 2026-08-13
- Authoritative base: `main` at `1e0f3eeb5b91a8d532415d630522b744a268d279`
- Runtime change: none
- Public API change: none
- `CanonicalTabResult 1.0.0` change: none
- Public polyphonic conversion authority: none
- PA-11+: not authorized by this slice

This document inventories the current canonical authority after PA-9 and records the compatibility constraints that PA-10 must preserve before any chord-aware canonical implementation is considered.

## 1. Current authority

The current public downstream result is `CanonicalTabResult 1.0.0`.

Its runtime authority is defined by:

1. `src/contracts/canonicalTabContractMetadata.js`
2. `src/tab/canonicalTabResult.js`
3. `src/contracts/canonicalTabResultContract.js`
4. existing canonical contract tests and golden fixtures
5. public writers that consume the validated canonical result

The existing package-root conversion path remains monophonic and unchanged.

PA-1 through PA-9 are internal parallel-path foundations. Their existence does not make their intermediate models public and does not authorize them to mutate or bypass the current canonical v1 contract.

## 2. CanonicalTabResult 1.0.0 invariants that are frozen

PA-10 treats these current v1 properties as compatibility invariants:

- `documentType` is exactly `CanonicalTabResult`.
- `schemaVersion` is exactly `1.0.0`.
- the root object uses an exact-key contract;
- canonical events are exactly `note` or `rest`;
- each event belongs to staff `1`;
- a result contains zero or one logical voice;
- measure timing is a single linear cursor;
- a note has one `selectedPosition` plus zero or more `alternativePositions`;
- the current deterministic fingering cost is a monophonic path cost;
- writer behavior is derived from the already-selected canonical v1 positions and must not rerun optimization;
- successful v1 outputs remain deeply immutable and deterministic;
- unsupported polyphonic structures continue to fail closed on the current public v1 conversion path.

These invariants must not be weakened merely to reuse the existing v1 object shape for polyphonic output.

## 3. Why an in-place v1 extension is not compatible

The merged v1 validator rejects unknown fields through exact-key validation and rejects unsupported event types. It also requires staff `1`, enforces a single voice, and validates measure timing as a single sequential event cursor.

The PA-1 through PA-9 internal path represents facts that do not fit those assumptions, including:

- simultaneous source-note membership;
- multiple source voices and up to the separately supported source-staff boundary;
- explicit arrangement decisions and source provenance;
- retained/omitted/octave-displaced/reduced source-note facts;
- simultaneous guitar voicing candidates with one position per retained source note;
- left-hand finger assignments and barre/partial-barre candidates;
- physical-policy verdicts for those structural shapes.

Adding these fields or event kinds directly to objects labeled `CanonicalTabResult 1.0.0` would break the existing exact-key/schema-version contract and could cause old consumers to accept a semantically different object under an unchanged version identifier.

Therefore PA-10 records the following compatibility decision:

> `CanonicalTabResult 1.0.0` remains frozen for the current monophonic public path. A chord/polyphony-aware canonical result, if later implemented and approved, requires a new major canonical contract version rather than an in-place v1 mutation.

The working target name for later PA-10 design slices is `CanonicalTabResult 2.0.0`. This slice does not implement or expose that contract.

## 4. What v2 must eventually be capable of representing

A future chord/polyphony-aware canonical contract must be able to represent the final approved arrangement without losing source correspondence.

At minimum, later design slices must account for:

### Source/provenance identity

- stable measure identity;
- stable source-event identity;
- source voice/staff facts where needed for provenance;
- exact source pitch/rhythm/timing identity;
- explicit correspondence between source events and final retained/omitted/transformed arrangement facts.

### Simultaneous result structure

- one musical onset containing more than one retained note;
- deterministic ordering within simultaneous groups;
- selected guitar string/fret per retained note;
- no duplicate-string assignment inside an approved simultaneous guitar voicing;
- exact target-MIDI provenance after any separately approved octave/reduction decision.

### Left-hand structure

Where later selection authority approves a final shape, the result design must be able to represent:

- finger assignment for fretted notes;
- open-string finger-zero semantics;
- barre/partial-barre facts when present;
- the policy/version used to validate the selected shape.

### Arrangement provenance

The result must not silently erase musical changes introduced by arrangement policy. Later design must determine how to preserve explicit provenance for decisions such as:

- `OMITTED`;
- `OCTAVE_DISPLACED`;
- `CHORD_REDUCED`;
- any later separately authorized decision kind.

The canonical result must describe the approved final result and its provenance; it must not turn every intermediate PA candidate into canonical truth.

## 5. Authority that v2 must not obtain prematurely

PA-10 is a compatibility/design gate. It does not grant final-selection authority to PA-9 or any earlier stage.

PA-9 currently classifies PA-8 shapes under `CONSERVATIVE_STATIC_LEFT_HAND_2.0`, but it does not:

- rank playable candidates;
- choose a final voicing;
- choose a final fingering;
- optimize transitions between consecutive shapes;
- establish player-specific comfort or tempo suitability;
- publish a canonical polyphonic result.

Therefore a future `CanonicalTabResult 2.0.0` producer cannot be implemented correctly merely by serializing the first PA-9 accepted candidate. Final selection remains a later separately gated authority.

## 6. v1/v2 compatibility policy

PA-10 adopts the following compatibility direction for later slices:

1. **v1 remains valid and supported for its existing scope.** Existing v1 fixtures and deterministic outputs must remain unchanged unless a separately approved v1 defect fix explicitly requires otherwise.
2. **No silent upgrade.** A consumer expecting v1 must never receive a v2 object labeled as v1.
3. **No silent downgrade.** A genuine polyphonic/chord-aware result must not be flattened into v1 by dropping notes, voices, provenance, fingering facts or arrangement decisions.
4. **Explicit schema dispatch.** Future consumers that support both versions must branch on `schemaVersion` and validate through the matching versioned contract.
5. **Fail closed on unsupported versions.** Existing integrations must not guess compatibility from field similarity.
6. **Writers remain version-aware adapters.** A writer may support one or more canonical versions, but it must never reinterpret an unsupported version or rerun arrangement/fingering selection.
7. **Public API expansion is deferred.** PA-10 does not expose a package-root polyphonic conversion function.
8. **Integration Contract v1 remains unchanged in this slice.** Any future integration-contract expansion requires its own reviewed change.

## 7. Candidate migration models considered

### Option A — mutate v1 in place

Rejected.

Reason: violates schema identity, exact-key semantics, single-voice/staff assumptions, event vocabulary and consumer fail-closed expectations.

### Option B — add optional chord fields while keeping `1.x`

Rejected as the default direction.

Reason: the semantic change is not a minor additive extension. Polyphonic onset structure, multiple selected positions, arrangement provenance and later shape selection change the result model fundamentally.

### Option C — separate `CanonicalTabResult 2.0.0`

Selected as the PA-10 working direction.

Properties:

- v1 remains frozen and independently validated;
- v2 receives a separate exact schema/validator;
- version dispatch is explicit;
- no compatibility is inferred from shared field names;
- future adapters may support v1, v2 or both without changing canonical authority.

This is a compatibility/design decision, not implementation authorization.

## 8. PA-10 safe sequence after this slice

The remaining PA-10 work should proceed in small separately reviewable slices:

1. `PA-10.0` — canonical authority inventory and v1/v2 compatibility direction — this document.
2. `PA-10.1` — machine-checkable v1 invariants/compatibility characterization without changing v1 behavior.
3. `PA-10.2` — exact polyphonic canonical data requirements derived from PA-1 through PA-9 and later selection needs.
4. `PA-10.3` — explicit v1 ↔ v2 compatibility and migration matrix.
5. `PA-10.4` — minimal `CanonicalTabResult 2.0.0` schema proposal, documentation/contract first.
6. `PA-10.5` — version dispatch and fail-closed migration contract proposal.
7. Later implementation/test slices only after their own reviewed scope is explicit.

No later slice is authorized merely by merging this document.

## 9. Acceptance criteria for PA-10.0

PA-10.0 is complete when:

- current v1 runtime authorities are identified;
- v1 monophonic compatibility invariants are recorded;
- in-place mutation of `CanonicalTabResult 1.0.0` is explicitly rejected;
- a separate major v2 contract is selected as the working direction;
- PA-9 is explicitly prevented from acquiring final-selection/canonical authority;
- public monophonic behavior and package-root API remain unchanged;
- no source, tests, workflows, package metadata or public API are modified;
- repository CI remains green on the exact documentation-only candidate;
- merge remains separately gated.

## 10. Non-authority statement

This document does not authorize:

- implementation of `CanonicalTabResult 2.0.0`;
- public polyphonic conversion;
- changes to `src/index.js`;
- changes to the public monophonic parser/preflight boundary;
- weakening any current `UNSUPPORTED_*` fail-closed rule;
- writer behavior changes;
- final voicing/fingering selection;
- PA-11 benchmark work;
- PA-12 E2E work;
- PA-13 public API work;
- branch cleanup or merge without separate Merge Approval.
