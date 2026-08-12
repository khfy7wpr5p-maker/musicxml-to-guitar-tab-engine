# PA-3 Closure — Simultaneous Event Source Grouping

## Status

- Gate: `PA-3`
- Status: `MERGED_INTERNAL`
- Pull request: #85
- Merge method: rebase
- Runtime `main` baseline after merge: `912ccf5f552ed0a5b21c2225266b95c421ff0dfd`
- Runtime tree: `2e16564ecf30c563e54ab3031a28d8858cc4d271`
- Exact PR head before merge: `132cef6936580c0758c02e6b68e39f3a654f4aba`
- Exact-head Tests #622: `SUCCESS`
- Exact-head MusicXML Compatibility #442: `SUCCESS`
- Post-merge Tests #623 on `main`: `SUCCESS`
- Independent review: no P1/P2 blocker found
- Public package API changes: none
- `CanonicalTabResult 1.0.0` changes: none
- Public monophonic conversion changes: none
- PA-4: `NOT_STARTED`; requires separate explicit approval

## What PA-3 adds

PA-3 adds the internal deterministic `SimultaneousEventModel 1.0.0` source-grouping layer after `PolyphonicSourceModel 1.0.0`.

It groups two or more note events when they share the same measure and exact `onsetDivisions` value. Membership is bound only through existing deterministic `sourceEventId` values and preserves source-event order inside each group.

The grouping layer can represent simultaneity originating from:

- source MusicXML `<chord/>` markers;
- separate MusicXML voices whose projected notes share an onset;
- staff 1 and staff 2 notes whose projected notes share an onset;
- combinations of those source facts.

Rests are not simultaneous-note group members. Duration equality is not required because simultaneity is an onset fact, not an equal-duration claim.

## Authority boundary

PA-3 does **not**:

- choose a guitar chord or voicing;
- omit notes;
- transpose or octave-displace notes;
- revoice/arpeggiate source music;
- choose string, fret, finger, barre or hand position;
- classify melody/bass/inner voices;
- mutate `PolyphonicSourceModel`;
- mutate `CanonicalMusicDocument` or `CanonicalTabResult 1.0.0`;
- add a package-root public API;
- weaken the existing monophonic fail-closed conversion path.

Those decisions remain later separately gated work.

## Determinism and safety

`createSimultaneousEventModel()` first revalidates its `PolyphonicSourceModel 1.0.0` input. Invalid or hostile source-model graphs therefore fail closed before grouping.

Grouping reuses the existing `ProcessingRuntime 1.0.0` boundary and includes measure/event/onset/member checkpoints. PA-3 tests directly cover deadline and cancellation behavior at the grouping layer.

The output graph and nested member arrays are deeply immutable.

## Red-first evidence

Before the implementation existed, red-first head:

`41b3b13c1e071079030438b4797079dd92b91787`

caused the full repository tests in MusicXML Compatibility #440 to fail as expected because `src/music/simultaneousEventModel.js` did not yet exist.

The minimal internal implementation was then added, followed by direct PA-3 deadline/cancellation negative coverage. Final exact head:

`132cef6936580c0758c02e6b68e39f3a654f4aba`

passed Tests #622 and MusicXML Compatibility #442. After rebase merge, post-merge Tests #623 passed on `main` SHA `912ccf5f552ed0a5b21c2225266b95c421ff0dfd`.

## Next gate

The next planned polyphonic gate is PA-4 — arrangement-decision + provenance contract.

PA-4 is **not started and not authorized by PA-3 closure**. Completion of PA-3 creates only source simultaneity grouping authority.