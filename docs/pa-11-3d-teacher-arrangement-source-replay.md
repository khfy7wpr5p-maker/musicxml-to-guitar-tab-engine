# PA-11.3D Teacher Arrangement Source Replay

## Status

- Gate: `PA-11`
- Slice: `PA-11.3D`
- Scope: exact bound MusicXML source-byte replay and source-pitch verification
- Authority: evaluation infrastructure only
- Teacher approval / scoring / production selection authority: none
- Public API / writer / canonical-output change: none

## Purpose

PA-11.3D closes the next evidence gap after PA-11.3C: benchmark source facts are no longer trusted merely because the JSON is internally consistent. Each case is replayed from its exact SHA-256-bound MusicXML bytes through the existing parser and PolyphonicSourceModel projector.

It validates:

- one source entry per benchmark case in exact benchmark order;
- exact case identity;
- exact repository-bound source SHA-256 bytes using the PA-11.3A source verifier;
- successful replay through the existing ParsedMusicXmlDocument → PolyphonicSourceModel path;
- replayed part identity matches sourceSelection;
- replayed selected measure exists;
- every selected source event exists and is a pitched note;
- every accepted arrangement's stored `sourceMidi` equals the replayed MusicXML pitch for that exact source event;
- hostile proxy/accessor/sparse/custom source-entry structures fail closed;
- output is immutable measurement evidence with `authority: none`.

## Authority boundary

PA-11.3D intentionally accepts structurally valid `proposed` benchmarks for source-integrity validation. Passing source replay does not change `reviewStatus`, infer teacher approval, rank arrangements, or modify production selection.

The user's PA-11.2 pedagogical PASS remains separate review/design evidence. In particular, the open C-major / Cmaj7 direction may require a later benchmark version with separately contracted revoicing/voice-redistribution semantics; PA-11.3D does not silently rewrite the existing PA-11.1 exact-pitch seed.

## Deferred

- PA-8/PA-9 runtime replay of selected voicing/shape physical facts;
- teacher-approved exact-match scoring;
- preferred/acceptable/unmatched metrics;
- production selection or public polyphonic output;
- PA-12 activation.
