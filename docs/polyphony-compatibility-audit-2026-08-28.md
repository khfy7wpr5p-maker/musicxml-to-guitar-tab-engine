# Polyphony Compatibility Audit — 2026-08-28

Status: DOCUMENTATION-ONLY / NO RUNTIME OR ARCHITECTURE CHANGE

Audit base: protected `main` at `0210976ffc74123df8a3c8c0fab2d3cf69067c32`.

## Scope

This audit checks why real-world polyphonic guitar MusicXML can fail to be admitted, selected, or regenerated as TAB. It does not change production code, public exports, authority boundaries, or the pinned architecture contract.

## Compatibility result

| Area | Result | Evidence / interpretation |
|---|---|---|
| Public package-root polyphonic end-to-end conversion | FAIL / NOT EXPOSED | The public conversion pipeline remains monophonic and projects through the monophonic source model before `CanonicalTabResult 1.0.0`. |
| Workbench/app POLY_V2 route detection | PASS | The upload runtime can classify multi-voice/chord material and route it to the internal POLY_V2 path. |
| Real-world polyphonic input admission | PARTIAL | The strict `PolyphonicSourceModel` projector intentionally fails closed outside the bounded structural subset. Compatibility normalizers have been landing incrementally, but admission is not yet equivalent to broad real-world MusicXML support. |
| Sustained/overlapping polyphony in the active Canonical V2 producer | FAIL | `createCanonicalTabResultV2()` still delegates attack selection to `selectDeterministicPolyphonicAttacks()`, whose retained-note guard rejects sustained overlap with `UNSUPPORTED_SUSTAINED_POLYPHONIC_OVERLAP`. |
| Sustained polyphony solver core | IMPLEMENTED INTERNAL | The PS temporal/sustain/active-state/path-search line exists on main through PS-6 evidence work, including `sustainedPolyphonicPathSolver.js`. This solver is not yet wired into the active Canonical V2 producer/runtime authority path. |
| Canonical V2 MusicXML writer | PASS FOR SUPPORTED CANONICAL INPUT | The V2 writer is structurally multi-track/multi-voice capable. It is not the primary root cause when material fails before a supported `CanonicalTabResultV2` is produced. |
| Grace-note / Bach-source compatibility | OPEN | PR #208 continues compatibility work and currently has failing test and MusicXML compatibility workflow evidence on its exact head. No passing production claim should be made from that PR yet. |
| Architecture/status documentation | STALE BEFORE THIS AUDIT | The PS architecture document still described PS-2 through PS-6 as future stages even though those implementation stages have landed internally. |

## Root-cause separation

The phrase “polyphonic reader/writer does not work” combines distinct problems and should not be used as the engineering diagnosis.

### 1. Input admission / normalization gap

The parser can read more XML structure than the strict polyphonic projection boundary is willing to admit. Real-world exports may contain structural or notation metadata that is musically harmless for guitar fingering but still outside the currently admitted deterministic subset. The correct diagnosis is **strict polyphonic projection / compatibility-normalization gap**, not a generic XML-reader failure.

### 2. Sustained-selection integration gap

The repository now contains sustained-polyphony temporal/state/path machinery, but `CanonicalTabResultV2` still invokes the older attack-local deterministic selector. That selector intentionally rejects overlap from notes retained across attacks. The correct diagnosis is **sustained path solver integration gap**.

### 3. Writer is downstream, not the primary blocker

`canonicalTabMusicXmlWriterV2.js` can serialize supported multi-voice canonical output. When a real-world polyphonic score never reaches a valid Canonical V2 result, describing the failure as a writer defect is misleading.

## Terminology corrections

1. Use **strict polyphonic projection / normalization incompatibility** for rejected real-world input metadata.
2. Use **attack-local deterministic selector** for `deterministicPolyphonicFinalSelector.js`; do not call it the sustained-polyphony engine.
3. Treat `UNSUPPORTED_SUSTAINED_POLYPHONIC_OVERLAP` as a **current active-producer limitation**, not a repository-wide architectural impossibility, because an internal sustained path solver now exists.
4. Do not state that `CanonicalTabResultV2` already provides sustained-polyphony authority. It is the internal canonical representation/producer boundary, but its current producer still delegates to the older selector.
5. Treat grace-note handling as a **compatibility-normalization / non-timed notation case** until PR #208 has passing exact-head evidence; do not classify grace notes as ordinary duration-bearing attacks by default.

## Open integration gates

1. Reconcile the active Canonical V2 producer with the already implemented sustained path solver under a separately reviewed integration stage.
2. Preserve the existing static selector as a compatibility path until sustained integration has deterministic regression evidence.
3. Complete exact-head CI for real-world normalization, including grace-note compatibility, before broad Bach/real-world support claims.
4. Reconcile or retire stale PR #171 after comparing it with the PS-6B normalizers already merged into main; do not merge the stale branch as-is.
5. Keep public package-root polyphonic exposure closed until a separately approved public API/dispatcher gate.

## Non-change statement

This audit does not authorize code changes, does not change the main architecture, does not change public API authority, and does not promote the sustained solver into production. It only reconciles documentation with the implementation state observed at the audit base.