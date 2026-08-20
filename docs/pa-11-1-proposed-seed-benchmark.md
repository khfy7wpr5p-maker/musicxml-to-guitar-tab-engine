# PA-11.1 Proposed Teacher Arrangement Seed Benchmark

## Status

- Gate: `PA-11`
- Slice: `PA-11.1`
- Authority: evaluation artifact only
- Review status: `proposed`
- Teacher approval: none
- Production selection authority: none
- Public API change: none
- Runtime change: none

## Purpose

Freeze a small self-authored seed packet that can be reviewed pedagogically in PA-11.2 without claiming that any proposed arrangement is teacher-approved.

## Seed cases

The proposed seed contains four single-onset/static cases only:

1. two-note preservation with an open-string and a barre alternative;
2. three-note preservation with two statically playable guitar voicings;
3. conservative `CHORD_REDUCED` outer-register retention;
4. nearest in-register `OCTAVE_DISPLACED` singleton realization.

Every fixture is repository-local, self-authored MusicXML and SHA-256 bound in `benchmark.proposed.json`.

## Explicit exclusions

The initial seed does not contain or require:

- sustained-sonority hand-occupancy semantics;
- transition/path optimization;
- `VOICE_REDISTRIBUTED`;
- `REVOICED`;
- `ARPEGGIATED`;
- tuplets or grace-note arrangement semantics;
- public polyphonic conversion;
- learned ranking or training use.

## Review semantics

`acceptedArrangements[]` contains complete proposed review candidates, not teacher-approved truth. `preferredArrangementId` remains `null` for every case. PA-11.2 must explicitly review the exact fixture bytes, manifest version and complete arrangements before any reviewed version may use `reviewStatus: "teacher-approved"`.

## Safety invariants

The seed checks:

- exact source-event coverage;
- lowercase SHA-256 source binding;
- safe repository-relative source paths;
- standard six-string tuning and 0–20 fret configuration;
- only currently executable PA-6 decision kinds;
- exact target-MIDI/string/fret round-trip;
- complete multi-note selected-shape membership;
- distinct strings inside each selected shape;
- open-string finger `0` and fretted finger `1..4` semantics;
- PA-9 policy status `PLAYABLE_WITHIN_POLICY` for every proposed multi-note shape;
- no inferred preferred arrangement;
- no teacher-approved status.

PA-11.1 does not add a runtime benchmark validator and does not change existing conversion behavior.
