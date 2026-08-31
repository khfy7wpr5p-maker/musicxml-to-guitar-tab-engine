# PS-2 Sustain/Tie Graph Contract

Status: INTERNAL / DEFAULT-OFF / NON-PUBLIC  
Contract version: `1.2.0`

PS-2 derives immutable sustain chains from `PolyphonicSourceModel`. It is facts-only: it has no arrangement, string, fret, finger, barre, cost or selection authority, and it never mutates source MusicXML or source-event facts.

## Tie identity and ordinary chains

Each chain is keyed by the exact tuple `(staff, voice, MIDI pitch, written pitch)`. A continuation must be temporally contiguous in the same measure, or must end exactly at a complete measure boundary and resume at onset zero of the next measure. Ordinary chains require source `tieStart` and `tieStop` facts and preserve every raw segment flag in output.

## Bounded closed-stop continuation

Some Guitar Pro exports encode a sustained display run as a closed `tieStop` segment followed immediately by another same-identity `tieStop` segment. The later segment may additionally carry `tieStart`. PS-2 may reconnect only this exact representation form:

- the current segment has source `tieStop` (an optional `tieStart` remains an unmodified source fact);
- the prior segment is the last segment of a closed chain and has `tieStop` but not `tieStart`;
- staff, voice, MIDI pitch and written pitch match exactly;
- the two segments are temporally contiguous under the ordinary chain rule.

The continuation reuses the existing chain identity and records the original segment facts unchanged. It does not synthesize a source note, add a missing `tieStart`, infer pitch/voice/staff, or relax timing.

## Downstream continuity

PS-3 consumes the sealed chain order, not a raw `tieStart` flag alone: every non-final chain segment remains one active logical note through its successor. The final segment releases it. This preserves the same exact source facts while allowing the bounded closed-stop representation above to reach active-sonority and sustained-selection stages.

## Fail-closed boundary

PS-2 rejects a `tieStop` without an exactly contiguous closed matching chain, non-contiguous segments, mismatched identity, ambiguous starts, and unterminated chains. The existing processing-runtime checkpoints and segment/chain limits remain authoritative.

## Required evidence

Changes to this contract require focused coverage for ordinary cross-measure ties, a valid bounded bridge, rejected bare orphan stops, rejected non-contiguous continuations, immutability, deterministic output, and the full repository suite.
