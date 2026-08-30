# PROD-TECH-02 — Strict projector provenance support

Production base: `03325c801844ac62fdb013fa96a803f39a17de03`.

Research authority: Guitar Polyphony Lab through LAB-TECH-05 (`6bce32e4781eaeea94f452d8b8426f5dccdc6589`).

## Scope

This stage wires the PROD-TECH-01 `GuitarTechniqueProvenance` extractor into the production polyphonic compatibility projection path.

Before the strict polyphonic projector runs, verified `SAFE_METADATA_ONLY` guitar technique nodes are extracted into an immutable sidecar and removed only from the derived projection copy. The original parsed MusicXML document is never mutated. The sidecar is returned as `guitarTechniqueProvenance` from the production compatibility chain.

Cleared metadata-only source forms remain exactly those bounded by PROD-TECH-01/LAB-TECH-04:

- hammer-on start/stop source markers with validated endpoint balance and no inferred physical destination;
- slide start/stop source markers with validated endpoint balance and no inferred same-string/path semantics;
- empty/unspecified technical harmonic;
- natural harmonic with exact natural + base-pitch structure;
- exact note/play straight mute;
- technical string, fret, fingering and pluck evidence.

## Fail-closed boundary

The pre-projection gate reuses `extractGuitarTechniqueProvenance()` as the authority. Unknown, malformed or ambiguous technique structures remain blocked. Provenance extraction errors are translated back to the existing strict-projector blocker family so production callers keep explicit `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE` behavior for technical, slide and play blockers.

Artificial harmonic pitch-role structures, pull-off, bend, tap, palm-mute, producer-specific let-ring, malformed endpoint chains and unknown technical/play structures remain unsupported.

## Invariants

PROD-TECH-02 does not:

- change pitch, octave, onset, duration, voice, staff, tie, grace or chord membership;
- add technique fields to solver note objects;
- change fretboard candidate generation;
- change solver ranking/cost vectors;
- enable physical technique semantics;
- infer pairing identity, endpoint pitch, string path, harmonic sounding pitch, mute duration or let-ring scope.

Focused regression coverage compares the strict-projected source model with an otherwise identical technique-free baseline, checks original-source immutability, checks two-run determinism, and verifies fail-closed behavior for unknown/ambiguous technique shapes.
