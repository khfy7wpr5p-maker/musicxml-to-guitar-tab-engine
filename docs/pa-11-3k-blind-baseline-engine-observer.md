# PA-11.3K Blind Baseline Engine Observer

## Status

Evaluation-only internal baseline. No production authority.

## Purpose

PA-11.3J can now convert independent engine facts into `TeacherArrangementObservedOutput`, and PA-11.3I can score that output against the exact teacher-approved benchmark. PA-11.3K provides the first gold-blind deterministic engine baseline that can supply those facts.

The selector does **not** receive benchmark bytes, approval bytes, teacher arrangement ids, preferred ids, or accepted arrangements.

## Policy

`PRESERVE_OR_OCTAVE_MIN_ERGONOMIC_1.0`

For every source note:

1. If its MIDI pitch lies inside the existing standard 20-fret guitar register envelope, create a `PRESERVED` PA-4 decision.
2. Otherwise create an `OCTAVE_DISPLACED` PA-4 decision and let PA-6 choose its existing nearest in-register octave target.
3. For a singleton retained tone, choose the playable position by the stable tuple `(fret, string)` ascending.
4. For a simultaneous multi-note result, use existing PA-8 candidates and PA-9 verdicts. Only `PLAYABLE_WITHIN_POLICY` shapes with no reason codes are eligible.
5. Rank eligible shapes by the stable tuple:
   - fret span
   - used finger count
   - barre count
   - maximum fret
   - sum of frets
   - sum of string numbers
   - source-order fret vector
   - source-order string vector
   - voicing candidate id
   - shape candidate id
6. If the source contains more than six notes, no retained tones, no playable position, more than one PA-8/PA-9 simultaneous group, or no PA-9-approved shape, return no result (`null`).

This policy intentionally does not perform `REVOICED`, `VOICE_REDISTRIBUTED`, `CHORD_REDUCED`, or `ARPEGGIATED` decisions. In particular, it does not attempt to reproduce the teacher-approved C=`x32010` or Cmaj7=`x32000` voicings.

## Output boundary

`createBlindBaselineEngineResult(sourceModel)` returns exactly the PA-11.3J engine-result fields:

- `sourceOutcomes`
- `selectedTones`
- `barres`

No benchmark identity or teacher-gold identity is embedded in the result. PA-11.3J remains responsible for attaching evaluation scope and generating local observation tone ids.

## Safety / non-authority

PA-11.3K:

- is internal and is not exported from the package root;
- does not change the canonical writer or public conversion API;
- does not activate a production polyphonic final selector;
- does not activate `REVOICED` or `VOICE_REDISTRIBUTED` production execution;
- cannot train a model or mutate production selection;
- is a baseline measurement component only.

## Verification requirements

Before merge:

- deterministic decision tests;
- exact open-interval baseline test;
- octave-displacement singleton test;
- negative anti-revoicing checks for the triad and four-note fixture;
- PA-11.3J compatibility test;
- package-root API regression test;
- full Node 18/20/22 test matrix;
- MusicXML Compatibility / alphaTab checks;
- independent diff/scope/review inspection.
