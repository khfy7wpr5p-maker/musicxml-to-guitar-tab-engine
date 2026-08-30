# PS-2 Sustain/Tie Graph Contract

Status: INTERNAL / DEFAULT-OFF / NON-PUBLIC  
Contract version: `1.1.0`

PS-2 derives immutable sustain chains from `PolyphonicSourceModel`. It is facts-only: it has no arrangement, string, fret, finger, barre, cost or selection authority, and it never mutates source MusicXML or source-event facts.

## Tie identity and ordinary chains

Each chain is keyed by the exact tuple `(staff, voice, MIDI pitch, written pitch)`. A continuation must be temporally contiguous in the same measure, or must end exactly at a complete measure boundary and resume at onset zero of the next measure. Ordinary chains require source `tieStart` and `tieStop` facts and preserve every raw segment flag in output.

## Bounded compatibility bridge

Some Guitar Pro exports encode a chain boundary as a closed `tieStop` segment followed immediately by a same-identity `tieStop+tieStart` segment. PS-2 may reconnect only this exact representation form:

- the current segment has both source facts: `tieStop` and `tieStart`;
- the prior segment is the last segment of a closed chain and has `tieStop` but not `tieStart`;
- staff, voice, MIDI pitch and written pitch match exactly;
- the two segments are temporally contiguous under the ordinary chain rule.

The bridge reuses the existing chain identity and records the original segment facts unchanged. It does not synthesize a source note, add a missing `tieStart`, infer pitch/voice/staff, or relax timing.

## Fail-closed boundary

PS-2 rejects a bare orphan `tieStop`, a bridge with missing `tieStart`, non-contiguous segments, mismatched identity, ambiguous starts, and unterminated chains. The existing processing-runtime checkpoints and segment/chain limits remain authoritative.

## Required evidence

Changes to this contract require focused coverage for ordinary cross-measure ties, a valid bounded bridge, rejected bare orphan stops, rejected non-contiguous continuations, immutability, deterministic output, and the full repository suite.
