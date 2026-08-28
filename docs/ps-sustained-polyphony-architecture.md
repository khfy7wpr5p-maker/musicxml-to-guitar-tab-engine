# PS Sustained Polyphony Architecture

Status: INTERNAL / DEFAULT-OFF / NON-PUBLIC

Implementation-status reconciliation: 2026-08-28 audit base `0210976ffc74123df8a3c8c0fab2d3cf69067c32`.

This document defines the safety and authority boundary for extending the existing deterministic polyphonic guitar selector toward sustained, contrapuntal material such as multi-voice guitar fugues.

The architecture contract below is unchanged. Since the original PS-0/PS-1 document was written, PS-2 through PS-6 implementation/evidence stages have landed internally. Their presence does not grant runtime or public authority: at the audit base the active `CanonicalTabResultV2` producer still uses the older attack-local deterministic selector, while the sustained path solver remains unconnected to that producer.

## Goal

Support time-overlapping independent voices without silently changing musical meaning. The target end-state is exact source-identity preservation through a bounded deterministic guitar-state search that can represent attacks, holds, releases, ties and cross-measure continuity.

## Non-goals for PS-0 / PS-1

- no package-root public API changes;
- no automatic runtime routing;
- no replacement or mutation of `deterministicPolyphonicFinalSelector.js`;
- no learned/ML authority;
- no external solver dependency;
- no string/fret decisions in the temporal model;
- no silent note deletion, octave displacement, voice merging or tie removal;
- no broad Bach-level support claim without exact-head corpus/compatibility evidence.

## Safety invariants

1. Existing MONO and bounded POLY behavior remains authoritative and unchanged unless a later separately reviewed gate explicitly promotes another path.
2. PS stages are internal and non-public until separately promoted.
3. Unsupported musical or physical states fail closed.
4. Source event identity remains immutable across every PS stage.
5. Musical correctness outranks ergonomic preference.
6. A solver may report `UNPLAYABLE_EXACT`; it must not silently reduce the score.
7. Resource use remains bounded by the existing processing runtime plus stage-specific limits.
8. Every new stage must revalidate its input contract before deriving output.
9. No browser-only or renderer-only state may become TAB authority.
10. Package-root exports remain unchanged until a separately reviewed public-polyphony gate.

## Stage map

### PS-0 — Architecture Contract

✅ LOCKED. Defines scope, authority, fail-closed behavior and coexistence with the current selector.

### PS-1 — Temporal Event Model

✅ IMPLEMENTED INTERNAL. Derives bounded musical time facts from `PolyphonicSourceModel`:

- ATTACK: pitched event begins at a temporal point;
- HOLD: previously active pitched event remains active after the point;
- RELEASE: pitched event ends at the point;
- ACTIVE: held plus newly attacked events after releases are applied.

PS-1 is fact-only. It has no guitar arrangement, string, fret, finger, barre, reduction or optimization authority.

### PS-2 — Sustain / Tie Graph and Duration Invariants

✅ IMPLEMENTED INTERNAL. Connects bounded sustain/tie/duration identity without changing pitch or voice semantics.

### PS-3 — Active Sonority Model

✅ IMPLEMENTED INTERNAL. Produces bounded active-note/sonority state across musically relevant transitions, preserving voice and sustain provenance.

### PS-4 — Sustained Guitar State / Slicing Foundations

✅ IMPLEMENTED INTERNAL. Provides the bounded temporal/guitar-state material required to reason about physically retained notes across transitions while reusing existing guitar-domain facts.

### PS-5 — Sustained Polyphonic Selector

✅ IMPLEMENTED INTERNAL / NOT ACTIVE AUTHORITY. A bounded deterministic sustained path solver exists. The existing attack-local selector remains intact and is still the selector invoked by the active `CanonicalTabResultV2` producer at the 2026-08-28 audit base.

### PS-6 — Bach Validation / Regression Ladder

🟡 INTERNAL EVIDENCE LINE IMPLEMENTED AND CONTINUING. Regression/determinism stages and subsequent PS-6B bounded MusicXML normalizers have landed, but broad Bach/real-world compatibility is not complete. Grace-note compatibility work continues in PR #208 and does not have passing exact-head test/MusicXML-compatibility evidence at audit time.

The validation ladder remains conceptually:

1. one held note plus one later attack;
2. two independent voices;
3. two voices with ties;
4. three independent voices;
5. three voices with sustained chordal interaction;
6. four independent voices;
7. four voices with cross-measure ties;
8. real Bach/fugal guitar transcription corpus;
9. multiple real-world exported MusicXML sources.

No broad sustained-polyphony claim is permitted merely because internal stages exist; admission, integration, deterministic selection and exact-head compatibility evidence must all pass.

## Integration strategy

The currently active internal bounded polyphonic path remains:

`MusicXML -> PolyphonicSourceModel -> SimultaneousEventModel -> PA-7 -> PA-8 -> PA-9 -> attack-local deterministicPolyphonicFinalSelector -> CanonicalTabResultV2`

The implemented PS line remains a separate internal capability:

`PolyphonicSourceModel -> PS-1 Temporal Event Model -> PS-2 Sustain/Tie -> PS-3 Active Sonority -> PS-4 Sustained Guitar State -> PS-5 Sustained Path Solver -> candidate CanonicalTabResultV2 integration boundary`

At the audit base, the final arrow is an **integration gate**, not an active runtime connection. `createCanonicalTabResultV2()` still delegates to `createDeterministicPolyphonicFinalSelection()`, whose sustained policy is `FAIL_CLOSED_ON_RETAINED_OVERLAP_OR_TIE_1.0`; retained overlap fails with generic code `UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION` and `details.reason = RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED`.

Any future connection of PS-5 into Canonical V2/upload/editor paths requires a separately reviewed deterministic integration stage with regression, resource-bound and compatibility evidence. This status clarification does not authorize that change.

## Coexistence with real-world MusicXML normalization

Real-world input admission and sustained contrapuntal selection are complementary but separate concerns.

The historical UI-08 / PR #171 work addressed structural MusicXML admission and standard guitar written/sounding normalization. Subsequent PS-6B normalizers have landed on main, so PR #171 is now stale/diverged and must be reconciled against main before any reuse; it should not be treated as a ready integration branch.

PS addresses temporal/sustained selection after admissible source structure has been projected. Fixing admission alone does not enable sustained selection, and connecting sustained selection alone does not make arbitrary real-world MusicXML admissible.

See `docs/polyphony-compatibility-audit-2026-08-28.md` for the compatibility diagnosis and terminology separation.