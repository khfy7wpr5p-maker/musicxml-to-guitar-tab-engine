# PS Sustained Polyphony Architecture

Status: INTERNAL / DEFAULT-OFF / NON-PUBLIC

This document defines the safety and authority boundary for extending the existing deterministic polyphonic guitar selector toward sustained, contrapuntal material such as multi-voice guitar fugues.

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
- no claim of Bach-level support until the PS-6 corpus gate passes.

## Safety invariants

1. Existing MONO and bounded POLY behavior remains authoritative and unchanged.
2. New PS stages are internal and opt-in until separately promoted.
3. Unsupported musical or physical states fail closed.
4. Source event identity remains immutable across every PS stage.
5. Musical correctness outranks ergonomic preference.
6. A solver may report `UNPLAYABLE_EXACT`; it must not silently reduce the score.
7. Resource use remains bounded by the existing processing runtime plus stage-specific limits.
8. Every new stage must revalidate its input contract before deriving output.
9. No browser-only or renderer-only state may become TAB authority.
10. Package-root exports remain unchanged through PS-0 / PS-1.

## Stage map

### PS-0 — Architecture Contract

Locks scope, authority, fail-closed behavior and coexistence with the current selector.

### PS-1 — Temporal Event Model

Derives bounded musical time facts from `PolyphonicSourceModel`:

- ATTACK: pitched event begins at a temporal point;
- HOLD: previously active pitched event remains active after the point;
- RELEASE: pitched event ends at the point;
- ACTIVE: held plus newly attacked events after releases are applied.

PS-1 is fact-only. It has no guitar arrangement, string, fret, finger, barre, reduction or optimization authority.

### PS-2 — Sustain / Tie Graph

Internal, facts-only stage. Connects tie chains and cross-measure sustain identity without changing pitch or voice semantics. Its precise input, output and fail-closed compatibility boundary is defined in `ps-sustain-tie-graph-contract.md`.

### PS-3 — Active Sonority Model

Future stage. Produces the exact active-note set at each musically relevant state transition, including voice and sustain provenance.

### PS-4 — Sustained Guitar State

Future stage. Reuses existing fretboard, PA-7, PA-8 and PA-9 facts to represent physically held strings, frets, fingers and barres across transitions.

### PS-5 — Sustained Polyphonic Selector

Future stage. Performs bounded deterministic state-space search across sustained guitar states. The existing static-attack selector remains intact as a separate authority path.

### PS-6 — Bach Validation Ladder

Future evidence gate:

1. one held note plus one later attack;
2. two independent voices;
3. two voices with ties;
4. three independent voices;
5. three voices with sustained chordal interaction;
6. four independent voices;
7. four voices with cross-measure ties;
8. real Bach/fugal guitar transcription corpus;
9. multiple real-world exported MusicXML sources.

No broad sustained-polyphony claim is permitted before these gates are evidenced.

## Integration strategy

The existing architecture remains:

`MusicXML -> PolyphonicSourceModel -> SimultaneousEventModel -> PA-7 -> PA-8 -> PA-9 -> deterministicPolyphonicFinalSelector -> CanonicalTabResultV2`

The PS line begins beside, not inside, the existing selector:

`PolyphonicSourceModel -> PS-1 Temporal Event Model -> PS-2 Sustain/Tie -> PS-3 Active Sonority -> PS-4 Sustained Guitar State -> PS-5 Sustained Selector -> CanonicalTabResultV2`

Until promotion, PS output is not routed into upload/runtime/editor paths.

## Coexistence with UI-08 / PR #171

The PS-0/PS-1 branch is based on main after UI-11 and intentionally avoids the runtime-normalization files being changed by UI-08. UI-08 addresses real-world MusicXML admission and standard guitar written/sounding normalization; PS addresses sustained contrapuntal selection. These are complementary but separate concerns.
