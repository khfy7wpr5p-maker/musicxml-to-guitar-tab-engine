# PA-4 Closure — Arrangement Decision + Provenance

## Status

- Gate: `PA-4`
- Contract: `GuitarArrangementPlan 1.0.0`
- Runtime PR: #87 — `feat(PA-4): add arrangement decision provenance contract`
- Runtime merge result on `main`: `a04f37f84bc825580cadfd972de30ad4c7b206cb`
- PR-head final commit: `c472cd42a32353e51a21dd14748597d93e74341a`
- PR-head Tests #633: `SUCCESS` on Node.js 18/20/22
- PR-head MusicXML Compatibility #451: `SUCCESS`
- Post-merge Tests #634 on exact `main` SHA `a04f37f84bc825580cadfd972de30ad4c7b206cb`: `SUCCESS`
- Independent final review: no remaining P1/P2 blocker found
- Public package API: unchanged
- Current public conversion path: monophonic and unchanged
- PA-5: `NOT STARTED`; requires separate approval

## What PA-4 added

PA-4 adds the internal deterministic `GuitarArrangementPlan 1.0.0` contract. It records an already-chosen arrangement decision and binds that decision back to immutable source truth. It does not choose arrangement policy automatically.

The fixed decision vocabulary is:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- `VOICE_REDISTRIBUTED`
- `CHORD_REDUCED`
- `REVOICED`
- `ARPEGGIATED`

Single-note decisions reference exactly one source note and use `sourceGroupId: null`. Group decisions reference the exact members and deterministic ID of one PA-3 `SimultaneousEventModel 1.0.0` group.

PA-4 preserves source pitch/rhythm/onset/voice/staff facts and carries provenance through deterministic source-event/group IDs. It does not create guitar string/fret/finger/barre/voicing authority and does not modify `CanonicalTabResult 1.0.0`.

## Safety evidence

PA-4 was developed red-first and hardened before merge.

Verified evidence includes:

1. Initial contract/tests failed before `src/music/guitarArrangementPlan.js` existed.
2. Hostile Proxy/accessor input was reproduced red-first and changed to fail closed without invoking hostile getters.
3. Aggregate `decisions` / `sourceEventIds` array bounds were reproduced red-first in Tests #632.
4. Final resource-bound validation reads and checks array length before `ownKeys` or per-element descriptor scanning.
5. Deadline/cancellation checkpoints remain enforced.
6. Every source note must be covered exactly once.
7. Unknown, duplicate, overlapping, missing and non-note source references fail closed.
8. Group decisions must match exact PA-3 simultaneous-group membership and canonical source order.
9. Output is deeply immutable.
10. Public package-root exports and monophonic fail-closed behavior remain unchanged.

## Scope that remains excluded

PA-4 does not authorize or implement:

- PA-5 melody/bass/inner-voice classification
- PA-6 deterministic reduction/octave policy
- automatic arrangement selection
- target-octave or target-voice execution details
- surviving chord-tone selection
- generated revoiced pitches
- arpeggio timing policy
- guitar string/fret/finger/barre/left-hand-shape selection
- public polyphonic conversion API
- writer/PDF/UI changes
- weakening the public monophonic fail-closed path
- production learned/AI arrangement authority

## Next gate

The next separately approved polyphonic gate is:

`PA-5 — deterministic melody/bass/voice analysis`

PA-4 closure does not authorize PA-5 automatically.
