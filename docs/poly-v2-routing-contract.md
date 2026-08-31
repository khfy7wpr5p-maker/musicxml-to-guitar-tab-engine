# POLY_V2 Routing Contract

Stage 02 makes routing an explicit early application decision, before the monophonic converter can return a successful result.

`POLY_V2` is required when parsed MusicXML contains any of these structural facts:

- a `<backup>` timing lane;
- a chord-marked note;
- more than one effective note voice;
- a note on a staff other than staff 1;
- an attributes-level `<staves>` value greater than one.

These are routing facts, not permission to infer missing music. A required POLY route may still be `PASS`, `REVIEW_REQUIRED`, or `BLOCKED` under the Stage 01 score-state contract. It must never be presented as successful `MONO_V1` output.

True one-voice, one-staff, chord-free MusicXML keeps the `MONO_V1` route.
