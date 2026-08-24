# Deterministic Polyphonic Final Selector v1

## Status

- Internal authority only.
- Contract version: `1.0.0`.
- Policy: `STATIC_ATTACK_PATH_LEXICOGRAPHIC_1.0`.
- Transition policy: `MIN_FRET_ANCHOR_DISTANCE_THEN_ERGONOMIC_TOTALS_1.0`.
- Sustained-sonority policy: `FAIL_CLOSED_ON_RETAINED_OVERLAP_OR_TIE_1.0`.
- Machine-learning authority: none.
- Package-root/public API exposure: none.
- CanonicalTabResult v2 production: not part of this slice.

## Purpose

This stage supplies the separately gated deterministic authority that PA-10.2/PA-10.4 require before a `CanonicalTabResult 2.0.0` producer can exist. It chooses final physical guitar positions from the already validated PA-6 -> PA-7 -> PA-8 -> PA-9 lineage without treating candidate enumeration order as ranking authority.

## Input lineage

The selector accepts a validated `PolyphonicSourceModel 1.0.0` plus PA-4 arrangement decisions. It recomputes the approved deterministic reduction and creates exactly one authentic `DeterministicPa7CandidateSnapshotHandoff 1.0.0`.

The handoff preserves one PA-7 generation through PA-8 and PA-9. The selector never asks GuitarSet or another learned model to create, remove, reorder, filter or choose candidates.

## Selection units

A retained attack becomes exactly one selection unit:

- two or more retained members of one PA-3 attack group -> one multi-note group unit;
- one retained member after reduction -> one singleton unit;
- an ordinary retained monophonic attack -> one singleton unit;
- fully omitted attacks -> no selection unit.

Every retained PA-6 instruction must be conserved exactly once in final note selections.

## Multi-note candidate rule

For every PA-7 voicing candidate, only PA-8 shapes with an exact PA-9 `PLAYABLE_WITHIN_POLICY` verdict and no rejection codes are eligible.

If multiple playable PA-8 fingerings exist for the same voicing, the selector chooses the best semantic shape using a deterministic ergonomic key derived from physical facts:

1. fret span;
2. used finger count;
3. barre count;
4. maximum fret;
5. fret sum;
6. string sum;
7. a canonical fact signature over positions, fingers and barres.

PA-7/PA-8 candidate indexes and candidate IDs are retained only as selected provenance; they are not used as preference ranking.

## Singleton rule

A singleton retained note receives one explicit standard-guitar string/fret position from the existing fretboard authority. The position must round-trip exactly to the PA-6 target MIDI. Singleton selection does not fabricate PA-7, PA-8 or PA-9 multi-note shape provenance.

## Path rule

Selection is sequence-aware. Across consecutive selection units, the primary path objective minimizes total movement of the deterministic fret anchor. Ties are resolved by aggregate physical/ergonomic totals and finally by canonical fact signatures.

This means the selector chooses a whole path rather than independently accepting the first locally enumerated candidate.

## Sustained-sonority boundary

PA-3 models attack simultaneity, not complete sounding-note occupancy. v1 therefore fails closed instead of guessing when:

- a retained source event carries `tieStart` or `tieStop`; or
- a retained note extends beyond the onset of the next retained attack in the same measure.

These cases require a separately versioned sustained-sonority selector. They are not silently approximated.

## Fail-closed conditions

The selector rejects at least:

- invalid source/arrangement/reduction provenance;
- loss of PA-7 -> PA-8 -> PA-9 identity;
- zero playable candidates for a retained selection unit;
- retained ties;
- retained-note overlap into a later retained attack;
- candidate counts beyond the fixed selector bound;
- target-MIDI/string/fret round-trip failures;
- loss or duplication of retained source-note identity;
- unsafe-integer path-cost accumulation.

## Output authority

The internal result records:

- exact selector policy identities;
- `authority: DETERMINISTIC_NON_ML`;
- exact source/arrangement/reduction/guitar provenance;
- `candidateGenerationCount: 1`;
- selected string/fret for every retained note;
- selected PA-7/PA-8 identities only for chosen multi-note shapes;
- selected finger assignments/barres;
- positive PA-9 physical-validation status;
- deterministic path cost.

It does not contain learned scores and does not expose rejected candidate graphs as canonical truth.

## Non-authority statement

This contract does not authorize:

- GuitarSet or any AI model to affect selection;
- learned ranking or online learning;
- public polyphonic API exposure;
- `CanonicalTabResult 2.0.0` runtime by itself;
- tied/sustained-overlap production claims;
- PA-13;
- production application/PDF/playback authority.
