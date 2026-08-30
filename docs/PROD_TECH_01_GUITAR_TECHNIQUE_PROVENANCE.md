# PROD-TECH-01 — Bounded guitar technique provenance

Production base: `3aad8dab19e7614ab606e6ae3f65e08ecc7fa9f3`

Research authority: Guitar Polyphony Lab through LAB-TECH-05 (`6bce32e4781eaeea94f452d8b8426f5dccdc6589`).

## Scope

This stage adds a strict, standalone `GuitarTechniqueProvenance` extractor for verified metadata-only MusicXML guitar technique source forms. It does not change the strict polyphonic projector, candidate generation, physical solver state, or ranking.

Accepted source forms are bounded to corpus-backed shapes:

- Guitar Pro / MusicXML hammer-on `start` and `stop` markers with bounded `number`, without automatic pairing;
- MusicXML slide `start` and `stop` markers with bounded `number`, without same-string/path inference;
- empty/unspecified technical harmonic marker;
- natural harmonic with exact `natural + base-pitch` children;
- exact note-level `play/mute=straight`;
- technical `string`, `fret`, `fingering`, and `pluck` evidence within bounded scalar ranges.

Every accepted record is `SAFE_METADATA_ONLY`. Pairing fields remain null in this stage. No record may carry pitch, octave, onset, duration, voice, staff, tie, grace, chord membership, candidates, ranking, or solver state.

## Fail-closed boundary

Artificial-harmonic pitch-role structures, pull-off, bend, tap, palm-mute/unknown technical children, malformed/duplicate hammer-on structures, malformed slide structures, and unknown `play` shapes remain rejected.

Let-ring remains outside this extractor because the observed Guitar Pro 7.6.0 form is a producer processing instruction whose sounding scope is not proven.

## Stage separation

`extractGuitarTechniqueProvenance()` is intentionally not wired into `runtimeGuitarNotationNormalizer` in PROD-TECH-01. Hammer-on and slide therefore continue to hit the existing strict-projector compatibility blocker. Wiring verified metadata-only records through runtime normalization/projection belongs to PROD-TECH-02.

This separation ensures PROD-TECH-01 cannot alter solver inputs, candidate sets, ranking, source musical facts, or production routing.
