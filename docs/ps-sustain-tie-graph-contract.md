# PS-2 Sustain/Tie Graph Contract

Status: ACTIVE INTERNAL/APPLICATION CONTRACT / NON-PACKAGE-ROOT  
Contract version: `1.2.0`

PS-2 derives immutable sustain chains from `PolyphonicSourceModel`. It is facts-only: it has no arrangement, string, fret, finger, barre, cost, ranking, or final-selection authority, and it never mutates source MusicXML or source-event facts.

Implementation: `src/music/sustainTieGraph.js`.

## Layering

```text
PS-2  SustainTieGraph
  ↓
PS-3  logical sustain/tie continuity
  ↓
PS-4A active sonority (attack / hold / release)
  ↓
PS-4C / PA-8 sustained left-hand physical enumeration
  ↓
sustained path solver
  ↓
PA-12 sustained canonical final selection
```

Each later layer consumes sealed facts from the previous layer. No layer may use corpus identity as authority.

## Tie identity and ordinary chains

Each chain is keyed by the exact tuple `(staff, voice, MIDI pitch, written pitch)`. A continuation must be temporally contiguous in the same measure, or must end exactly at a complete measure boundary and resume at onset zero of the next measure.

Ordinary chains use source `tieStart` and `tieStop` facts and preserve every raw segment flag in output.

Fixed PS-2 segment/chain ceilings remain tied to the shared `DEFAULT_PROCESSING_LIMITS.maxEvents` boundary. Deadline/cancellation checkpoints remain active.

## Bounded closed-stop continuation

Some Guitar Pro exports encode a visually continuous sustain run as a closed `tieStop` segment followed immediately by another same-identity `tieStop` segment. The later segment may also carry `tieStart`.

PS-2 may reconnect only this exact representation:

- the current segment has source `tieStop`;
- the prior segment is the last segment of the same exact identity's closed chain;
- that prior segment has `tieStop` and does **not** have `tieStart`;
- staff, voice, MIDI pitch, and written pitch match exactly;
- the two segments are temporally contiguous under the ordinary chain rule.

This covers the reviewed closed continuation and repeated exact closed-stop form. The existing chain identity is reused and every original segment flag is retained unchanged.

PS-2 does **not**:

- synthesize a source note;
- add a missing `tieStart`;
- infer pitch, octave, voice, or staff;
- relax timing contiguity;
- merge mismatched identities;
- use a corpus filename or SHA as a condition.

## PS-3 downstream continuity

PS-3 consumes sealed chain order, not a guessed raw `tieStart` interpretation. Every non-final chain segment remains the same active logical note through its successor. The final segment releases the logical note.

Therefore bounded representation-level closed-stop continuation can reach active-sonority and sustained-selection stages without rewriting source facts.

## Fail-closed boundary

A real orphan tie stop is still invalid. PS-2 fails closed on:

- `ORPHAN_TIE_STOP` — no exactly matching contiguous open/closed chain exists;
- `NONCONTIGUOUS_TIE_CONTINUATION` — identity matches but timing does not;
- `MISSING_TIE_STOP_AT_CONTINUATION` — an open chain reaches a contiguous matching note without the required stop fact;
- `AMBIGUOUS_TIE_START` — a second chain would be opened for the same exact identity;
- `UNTERMINATED_TIE_CHAIN` — source ends while a chain remains open;
- fixed segment/chain limit exhaustion;
- processing deadline/cancellation.

Ambiguity or missing semantic evidence is not repaired by guessing.

## Source immutability and determinism

The graph is derived from immutable source events and returns deeply immutable ordered chains/memberships. Identical source and runtime options must produce identical graph identity and ordering. Compatibility changes may not alter PA candidate ordering, physical rules, ranking/cost, or solver tie-break behavior.

## Required evidence for future changes

Changes to this contract require focused coverage for:

- ordinary within-measure and cross-measure ties;
- valid bounded closed-stop continuation;
- repeated exact closed-stop continuation;
- rejected bare orphan stops;
- rejected non-contiguous or mismatched continuation;
- ambiguous/unterminated chains;
- source immutability and deterministic output;
- fixed limit and deadline/cancellation behavior;
- downstream active-sonority/sustained-selection regression;
- full required CI.
