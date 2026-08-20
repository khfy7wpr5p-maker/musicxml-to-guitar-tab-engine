# PA-11.2S Revoiced Teacher Benchmark Schema 1.1 Proposal

## Status

- Gate: `PA-11`
- Slice: `PA-11.2S`
- Artifact contract: `TeacherArrangementBenchmark 1.1.0`
- Proposed benchmark version: `0.2.0`
- Review status: `proposed`
- Authority: evaluation only
- Production / training authority: none
- Public API / writer / canonical output: unchanged

## Why 1.1 is required

The `0.1.0` seed assumes a one-source-note to one final note-outcome model. That is sufficient for
preservation, omission, conservative reduction, and octave displacement.

The explicit teacher directions for cases 2 and 3 require standard open guitar chord shapes:

- C major: `x32010`
- Cmaj7: `x32000`

Those shapes redistribute source chord members into lower registers and deliberately double selected
pitch classes. One source event can therefore correspond to more than one realized guitar tone.

That cannot be represented faithfully by the 1.0 note-outcome structure without either discarding
part of the requested chord shape or fabricating unrelated source events.

## Composition rule

Version 1.1 remains a fixed evaluation artifact but allows two accepted-arrangement modes.

### BASELINE_REFERENCE

For unchanged reviewed cases, the arrangement may reference one exact accepted arrangement from the
immutable `0.1.0` baseline.

The root binds the exact baseline Git blob. A reference is valid only if the arrangement ID exists in
the matching case of that exact blob.

### REALIZED_VOICING

A revoiced arrangement records:

- one group-level `REVOICED` decision;
- `VOICE_REDISTRIBUTED` as supporting transformation context;
- one source mapping for every selected source event;
- one or more realized tone IDs per source mapping;
- complete realized guitar tones with MIDI/string/fret/finger facts;
- one exact selected guitar shape;
- physical-policy status.

Every realized tone must map back to exactly one source event. A source event may map to multiple
realized tones. Each realized tone must preserve the source event's pitch class in this initial
proposal.

This permits octave redistribution and pitch-class doubling without inventing new harmonic pitch
classes.

## Exact evidence binding

The `0.2.0` proposal binds both:

- baseline benchmark Git blob `81f921dee9e02f43ee3917ef81868e7300f796df`
- teacher review record Git blob `8654cd68f1b8def22e38a501242afe22cf468322`

Any change to either dependency requires a new proposal/review cycle.

## Proposed case semantics

### Case 1

Both previously presented baseline arrangements remain referenced. No preference is inferred.

### Case 2

Exact teacher-requested C major shape:

```text
x32010
6 muted
5: C3  fret 3 finger 3
4: E3  fret 2 finger 2
3: G3  open
2: C4  fret 1 finger 1
1: E4  open
```

Source mapping:

- source C4 -> realized C3 + C4
- source E4 -> realized E3 + E4
- source G4 -> realized G3

### Case 3

Exact teacher-requested Cmaj7 shape:

```text
x32000
6 muted
5: C3  fret 3 finger 3
4: E3  fret 2 finger 2
3: G3  open
2: B3  open
1: E4  open
```

Source mapping:

- source C4 -> realized C3
- source E4 -> realized E3 + E4
- source G4 -> realized G3
- source B4 -> realized B3

### Case 4

The previously presented octave-displacement baseline arrangement remains referenced. No preference
is inferred.

## Fail-closed compatibility boundary

The existing PA-11.3A admission implementation accepts only `TeacherArrangementBenchmark 1.0.0`.
The new `1.1.0` proposal is intentionally tested to be rejected by that old path.

Therefore:

- PA-11.3B-E cannot silently score this artifact;
- no old evaluator can misinterpret `REALIZED_VOICING`;
- a separate reviewed evaluator extension is required after exact teacher approval;
- production arrangement behavior remains unchanged.

## Human gate

`benchmark.proposed.v0.2.0.json` is not teacher-approved merely because it was generated from the
review record and passes CI.

The exact `0.2.0` artifact must be reviewed as a whole. Only an explicit approval of that exact
artifact can authorize a later immutable teacher-approved copy/version.
