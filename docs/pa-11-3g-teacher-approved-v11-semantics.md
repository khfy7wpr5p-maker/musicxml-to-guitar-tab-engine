# PA-11.3G — Teacher-approved 1.1 semantic validation

PA-11.3G validates the complete evaluation semantics of the exact teacher-approved `TeacherArrangementBenchmark 1.1.0 / 0.2.0` after PA-11.3F admission.

It validates both arrangement modes used by the approved artifact:

- `BASELINE_REFERENCE`: source scope must equal the bound 1.0 baseline and every referenced arrangement must resolve to an accepted baseline arrangement.
- `REALIZED_VOICING`: `REVOICED` + `VOICE_REDISTRIBUTED` source mappings must completely and uniquely cover realized tones, preserve source pitch class, and agree exactly with selected guitar string/fret/finger/MIDI facts.

Additional invariants include:

- exact bound baseline and review-record Git blobs;
- four canonical PA-11 cases with unique IDs;
- exact source/sourceSelection continuity from the baseline;
- one complete realized voicing for teacher C and Cmaj7 cases;
- distinct valid guitar strings and fret range 0..20;
- open strings use finger 0; fretted strings use fingers 1..4;
- static finger order increases with fret;
- selected-shape realized-tone coverage is complete;
- physical status is `PLAYABLE_WITHIN_POLICY`;
- no preferred arrangement is inferred.

The public entry point first requires PA-11.3F exact-byte admission, then validates the bound baseline/review evidence and semantic model. A separate internal semantic function exists for hostile-data regression tests but grants no approval by itself.

This slice is evaluation-only. It does not score or rank engine output, does not activate `REVOICED`/`VOICE_REDISTRIBUTED` in production, does not modify candidate selection, and does not write canonical output.
