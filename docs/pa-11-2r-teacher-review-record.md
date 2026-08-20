# PA-11.2R Immutable Teacher Review Record

## Status

- Gate: `PA-11`
- Slice: `PA-11.2R`
- Scope: immutable machine-readable capture of the explicit teacher review direction
- Authority: evaluation review evidence only
- Production authority: none
- Training authority: none
- Public API / writer / canonical output: unchanged
- Current benchmark `reviewStatus`: remains `proposed`

## Purpose

The existing `TeacherArrangementBenchmark 1.0.0` seed is bound to exact-pitch source outcomes.
The explicit teacher review accepted cases 1 and 4 as presented, but requested standard open-guitar
harmonic shapes for cases 2 and 3:

- case 2: open C major, `x32010`
- case 3: open Cmaj7, `x32000`

Those two directions cannot be silently rewritten into the existing `0.1.0` benchmark because they
introduce lower-octave redistribution and additional realized chord tones that are not representable
by the current one-source-note/one-outcome benchmark shape.

PA-11.2R therefore records the review direction without claiming that the current seed is
teacher-approved.

## Exact benchmark binding

The review record binds to:

- path: `benchmarks/teacher-arrangement-v1/benchmark.proposed.json`
- benchmark id: `teacher-arrangement-seed-v1`
- benchmark version: `0.1.0`
- observed review status: `proposed`
- repository commit: `69b92fe4801c3c8c6e252d2e8177b6f7241d9cf2`
- exact Git blob SHA: `81f921dee9e02f43ee3917ef81868e7300f796df`

Tests recompute the Git blob SHA from the checked-out benchmark bytes. Any material benchmark-byte
change breaks the binding.

## Case decisions

### Case 1

`pa11-seed-001-two-note-open-vs-barre`

- verdict: `PASS_AS_PRESENTED`
- the presented acceptable set remains accepted for this review direction
- no preferred arrangement is inferred

### Case 2

`pa11-seed-002-three-note-voicing`

Teacher direction: standard open C major, `x32010`.

```text
6: muted
5: fret 3, finger 3, C3
4: fret 2, finger 2, E3
3: open, G3
2: fret 1, finger 1, C4
1: open, E4
```

This direction is physically ordinary on standard guitar, but it is not an exact one-to-one
translation of the current C4/E4/G4 source events. It requires a separately proposed benchmark
schema/version capable of representing redistributed/revoiced output and additional realized tones.

### Case 3

`pa11-seed-003-conservative-reduction`

Teacher direction: standard open Cmaj7, `x32000`.

```text
6: muted
5: fret 3, finger 3, C3
4: fret 2, finger 2, E3
3: open, G3
2: open, B3
1: open, E4
```

The E chord member is deliberately retained in the requested voicing so the major/minor quality
remains explicit; B supplies the major-seventh quality.

As with case 2, this requires a future reviewed benchmark schema/version rather than mutation of the
current exact-pitch seed.

### Case 4

`pa11-seed-004-octave-displacement`

- verdict: `PASS_AS_PRESENTED`
- no preferred arrangement is inferred

## Required future semantics

Cases 2 and 3 are marked as requiring future evaluation-schema support for:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- additional realized tones
- non-bijective source-to-output mapping

This is a benchmark/evaluation schema requirement only. It does not activate those decision types in
the production runtime.

## Next gate

The next safe step is to create a **new proposed benchmark version** that can represent the exact
open C and Cmaj7 review directions. That new artifact must itself be shown/reviewed exactly before
`reviewStatus: teacher-approved` can be asserted.

No scoring against teacher-approved gold is authorized by PA-11.2R alone.
