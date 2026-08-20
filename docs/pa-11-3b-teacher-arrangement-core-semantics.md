# PA-11.3B Teacher Arrangement Core Semantic Validator

## Status

- Gate: `PA-11`
- Slice: `PA-11.3B`
- Scope: fail-closed source/decision/outcome/position semantics
- Authority: evaluation infrastructure only
- Current PA-11.1 review state: `proposed`
- Teacher approval / scoring / production selection authority: none
- Public API / writer / canonical-output change: none

## Purpose

PA-11.3B extends the merged PA-11.3A admission guard with the smallest coherent semantic layer needed before arrangement-shape comparison can exist.

It validates:

- exact guitar tuning/fret record and current PA-9 physical-policy identity;
- sourceSelection part/measure/event identity and uniqueness;
- exactly one arrangement decision covering each selected source event;
- exactly one note outcome for each selected source event;
- decision/outcome identity and decision-type agreement;
- omitted-note null facts;
- PRESERVED and OCTAVE_DISPLACED pitch invariants;
- retained target-MIDI ↔ selection string/fret round-trip;
- bounded/hostile nested object and array behavior.

## Deliberate exclusions

PA-11.3B does **not** validate selected-shape position membership, finger assignments or barre records. Those are kept for the separate PA-11.3C slice so this PR remains reviewable and reversible.

It also does not independently parse the bound source MusicXML to prove stored source pitches against source bytes; that replay belongs to a later evaluator input slice.

`reviewNotesCode` remains null-only until a controlled non-null code vocabulary is separately contracted.

PA-11.3B does not change the benchmark, infer teacher approval, score outputs, train models, alter PA-4 through PA-9, or activate PA-12.
