# PROD-TECH-04 — Deterministic slide provenance pairing

## Scope

This bounded Stage 03 slice adds deterministic pairing identity for already-cleared MusicXML
`<slide number="N" type="start|stop"/>` provenance. It remains `SAFE_METADATA_ONLY`.

It does not infer a string, finger, direction, destination pitch, physical path, candidate, ranking,
or playable legato behavior. Source notes and source bytes remain unchanged.

## Pairing rule

Markers are first balanced strictly by exact `(part, voice, staff, kind, number)`. A pairing is attached
only to a balanced segment containing exactly one START and one STOP with deterministic source-tree
locators. Reused-number nesting or overlapping chains remain present but deliberately unpaired.

The identifier is `SLIDE:n<number>:<sha256-prefix>` and its only basis is the two source-tree locators.
The number is never sufficient identity by itself.

## Boundaries

- orphan and unmatched endpoints fail closed;
- cross-voice or cross-staff endpoints fail closed;
- pull-off, bend, artificial harmonic and uncleared technical shapes remain unsupported;
- physical interpretation remains outside this stage.
