# PA-8 Left-Hand Shape / Finger / Barre Contract

## Status

- Gate: `PA-8`
- Scope: internal structural left-hand shape candidates over ordered guitar-position/voicing states
- Public package-root API change: none
- Contract: `LeftHandShapeModel 1.0.0`
- Policy: `ORDERED_FRET_FINGER_BARRE_1.0`
- Final voicing/fingering selection: not included

PA-8 deterministically enumerates structural finger/barre assignments. It does not authorize note removal, pitch mutation, semantic repair, or solver ranking changes.

Implementation authority:

- fixed limits and shared enumerator: `src/music/leftHandShapeModel.js`;
- sustained PS-4C reuse/scope: `src/music/sustainedLeftHandPhysicalStateModel.js`.

## Upstream authority

The ordinary PA path consumes an authentic, deeply immutable PA-7 snapshot. The sustained path adapts exact PS-4A/position-state facts into the same shared static enumerator and verifies provenance on conversion back to sustained physical state.

The original MusicXML/source model remains immutable source truth.

## Fixed numerical ceilings

The code constants are:

```text
MAX_LEFT_HAND_SHAPE_CANDIDATES = 20_000
MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS = 100_000
```

These numbers are fixed safety ceilings. A compatibility/corpus blocker is **not** solved by increasing them.

### Enforcement scope

The ceilings apply to one independently processed physical/source group:

- ordinary PA-8: one PA-7 source group across that group's ordered voicing candidates;
- sustained PS-4C seam: exactly one PS-4A sonority point across that point's ordered position states.

The sustained implementation resets `groupShapeCandidates` and `groupAssignmentAttempts` before each sonority point. Aggregate counters may continue for reporting, but earlier measures/groups/points cannot consume a later point's fixed enforcement window.

Therefore this statement is incorrect and must not reappear in live documentation:

> PA-8 uses one aggregate 100,000-assignment budget for the whole score.

It does not.

## Structural finger semantics

For every ordered guitar-position candidate:

1. Preserve exact candidate identity, position order, source-event provenance, target MIDI, string, and fret.
2. `fret = 0` receives `finger = 0` only.
3. `fret > 0` receives exactly one finger in `1..4`.
4. One finger may not be used at two different frets in one shape.
5. Across different frets, lower frets must use lower-numbered fingers than higher frets. Positions at the same fret may use the same or different fingers.
6. One finger assigned to two or more strings at the same fret creates a barre spanning the minimum through maximum assigned string number.
7. A barre is valid only when it does not alter another active pitch inside its span: an active lower fret is invalid; an active note on the same fret must use the barre finger; an active higher fret is allowed.
8. A barre spanning strings `1..6` is `FULL_BARRE`; every other barre is `PARTIAL_BARRE`.
9. A finger used on one string only is not a barre.
10. Open-only states produce one structural shape with finger `0` assignments and no barre.
11. A position/voicing state may produce zero PA-8 shapes when no assignment satisfies the structural policy. Zero candidates do not authorize semantic mutation.

Complete finger vectors are visited deterministically in source position order with fretting fingers `1,2,3,4`. Candidate order is enumeration, not preference ranking.

## Non-authority boundary

PA-8 does **not** decide or infer:

- pitch, octave, onset, duration, voice, staff, tie, or chord relationship;
- source pitch transformation or automatic octave shift;
- implicit voice splitting;
- anatomical truth outside its bounded static policy;
- transition/path ranking;
- pedagogical preference;
- final canonical selection.

PA-9 remains the conservative static physical-playability validator. Sustained path transition/selection stages remain separately responsible for path feasibility and final deterministic choice.

## Resource and failure behavior

PA-8 shares the existing `ProcessingRuntime` deadline/cancellation boundary and introduces no independent budget reset API.

It fails closed when:

- an upstream snapshot/fact is invalid or inauthentic;
- position identity/MIDI/string/fret facts are invalid;
- a single independently processed group would exceed 20,000 generated shapes;
- a single independently processed group would exceed 100,000 complete assignment attempts;
- deadline or cancellation is reached.

The relevant errors remain `LEFT_HAND_SHAPE_CANDIDATE_LIMIT_EXCEEDED` and `LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED`. PS-4C additionally keeps its own fixed `SUSTAINED_PHYSICAL_STATE_LIMIT_EXCEEDED` boundary for playable physical states at one point.

## Determinism / solver invariance

The PA-8 scope correction changes only which independently processed group owns the fixed counter window. It does not change:

- numerical ceilings;
- candidate/position traversal order;
- finger/barre policy;
- PA-9 physical rules;
- solver ranking or cost;
- solver tie-break;
- source semantics.

## Required evidence

PA-8 changes require focused coverage for deterministic enumeration, open strings, ordered-fret policy, partial/full barre, interference rejection, zero-shape behavior, provenance preservation, deep immutability, per-group ceilings, sustained per-sonority scope, deadline/cancellation, hostile-input fail-closed behavior, and the required repository/compatibility checks.
