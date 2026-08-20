# PA-11.3C Teacher Arrangement Shape Semantics

## Status

- Gate: `PA-11`
- Slice: `PA-11.3C`
- Scope: fail-closed selected-shape / finger / barre semantic consistency
- Authority: evaluation infrastructure only
- Current PA-11.1 review state: `proposed`
- Teacher approval / scoring / production selection authority: none
- Public API / writer / canonical-output change: none

## Purpose

PA-11.3C extends the merged PA-11.3B core semantic validator with the next bounded internal layer: complete selected-shape consistency for retained benchmark outcomes.

It validates:

- selectedShapeId references resolve to one unique selected shape;
- selected-shape sourceGroupId provenance matches the same source part and measure;
- shape membership and deterministic member order exactly match retained note outcomes that reference the shape;
- shape positions exactly match retained target MIDI, string and fret facts;
- selected shape positions use distinct strings;
- finger assignments exactly match shape positions;
- open strings use finger `0` and fretted positions use fingers `1..4`;
- one fretting finger is not assigned to multiple frets in one shape;
- deterministic barre facts are derived from same-finger/same-fret assignments;
- a derived barre may not alter an active lower-fret/open pitch inside its span;
- same-fret active pitches inside the span use the same barre finger;
- stored barre records exactly equal deterministic derived barre records;
- accepted benchmark selected shapes record `PLAYABLE_WITHIN_POLICY`.

## Deliberate exclusions

PA-11.3C does **not** independently parse the bound source MusicXML to prove simultaneity or source pitches from source bytes. Therefore it validates complete shape consistency where shape references are present, but it does not invent a missing shape solely from note count.

It also does not replay PA-8/PA-9 candidate generation inside the evaluator boundary. Runtime physical replay, source-byte replay and benchmark scoring remain separate later PA-11.3 slices.

PA-11.3C does not change benchmark review state, infer teacher approval, score/rank outputs, train a model, modify PA-4 through PA-9 production behavior, expose a package-root API, or activate PA-12.
