# Pedagogical Feature Vector 1.0.0

## Purpose

`PedagogicalFeatureVector 1.0.0` is an internal, deterministic observation contract for describing simple pedagogically relevant properties of an already valid guitar position or transition.

It does not select a fingering, change optimizer cost, create candidates, validate physical playability, or alter `CanonicalTabResult`.

## Version

- Contract version: `1.0.0`
- Internal only; not exported from the package-root public API.

## Features

For a current physical position and optional previous physical position, v1 records:

- `fretMovement`: absolute fret-distance from the previous position; zero for the first position.
- `stringMovement`: absolute string-number distance; zero for the first position.
- `positionContinuity`: whether the fret position is unchanged; true for the first-position baseline.
- `openStringUsage`: whether the current candidate uses fret zero.
- `largeShift`: whether fret movement is strictly greater than the configured threshold (default `4`).
- `handStability`: whether fret movement is at most one fret; true for the first-position baseline.
- `phraseContinuity`: conservative v1 proxy requiring position continuity and at most one-string movement; true for the first-position baseline.

These are descriptive features, not pedagogical truth labels. Their definitions are deliberately narrow and versioned so later research can evolve them without silently changing v1 data.

## Safety boundary

The feature-vector builder:

- accepts only validated-looking six-string positions with non-negative integer frets;
- rejects malformed positions and invalid thresholds fail-closed;
- returns an immutable record;
- performs no I/O;
- has no AI or learned behavior;
- does not mutate source objects;
- does not write to the optimizer or canonical result.

## Non-authority

Pedagogical features MUST NOT:

- create or remove physical candidates;
- override the physical validator;
- change MusicXML pitch or rhythm semantics;
- change deterministic optimizer decisions in this foundation stage;
- write directly to `CanonicalTabResult`;
- bypass teacher review in future learned-ranking stages.

## Integration status

Foundation only. The module is not wired into the normal conversion pipeline in v1. It can be consumed later by observation/benchmark tooling after a separate reviewed integration step.
