# GuitarSet v2 Controlled Offline Shadow Evidence Closeout

## Status

`GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`

This document closes the bounded, repository-fixture-only GuitarSet v2 controlled-offline shadow evidence gate. It does not authorize normal-runtime connection, live/user-file evaluation, optimizer or final-selector influence, canonical-result/TAB/writer influence, checkpoint mutation/refit, or production.

The deterministic GuitarTab Engine remains authoritative.

## Evidence identity

- exact-main engine commit: `acdb66e2bb2ad809ab45fc7c2183d84280d61ad7`
- source capture PR: `#142` (review-only; never merge)
- source capture head: `c7ccc955c6c98706eb041d9c5866d5217db42e9f`
- source workflow run: `32651523727`
- source Node.js 22 job: `97223773950`
- immutable artifact: `evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`
- artifact byte SHA-256: `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba`
- model artifact SHA-256: `7a56436c27ee6d996a49e7f989d37d7ffff187232277095b176c3c395c432314`
- model transport SHA-256: `6f71e1aef2b4b858a4b8c19a205e269e0fa9d4b3b35b8b703bc2e13e58d27955`
- feature schema SHA-256: `617981e90cce46c941596d1bd50ffffff64e6816c59d8f0dbed1acd6d8938285`
- protocol SHA-256: `db67d88c4889a2b8c63411cd1e9bbd7481248dfbdd76da67f5df60b3871b4c02`
- shadow-integration review SHA-256: `f42809c1ca9d5f6ff1c62dd072c91a9195bb46e1714e88bd84e8a5a57eef9140`
- run digest SHA-256: `855e62f2dddece4ad7d3008c915418611dc59fcd06cfc1bfdbc22060755d0bed`
- determinism digest SHA-256: `6b67196a87046916bb1411e8ecfb826f92a5e8c8ebd4243e0278a7070769a791`

The artifact is byte-SHA sealed. Integrity tests load the committed artifact directly and do not recompute historical exact-main evidence through a future runner.

## Sealed result

- fixtures: `6`
- total PA-7 groups: `5`
- candidate-bearing groups: `4`
- scored candidate-bearing groups: `4/4` (`100%`)
- total candidates before/after shadow: `153/153`
- candidate preservation: `100%`
- no-candidate/NO_SCORE groups: `1/5` (`20%`)
- baseline-comparable groups: `4`
- top-1 agreement: `1/4` (`25%`)
- top-1 disagreement: `3/4`
- fret-20 candidates scored: `48` across `3` groups
- top-1/top-2 margin range: `0.431699683208..3.628871628623`
- shadow errors: `0`
- deterministic reproduction: `10/10`

The single NO_SCORE result is the explicit zero-authoritative-candidate control. Candidate-bearing model coverage is 100%.

The three disagreements are diagnostics, not promotion failures:

- `pa11-two-note-interval:P1:measure:0:simultaneous:0`
- `pa11-three-note-triad:P1:measure:0:simultaneous:0`
- `pa11-four-note-reduction:P1:measure:0:simultaneous:0`

The fixture set is intentionally small; it cannot establish production accuracy, teacher preference, or generalization.

## Scientific boundary

The v2 candidate domain is `0..20`, while positive observed GuitarSet gold remains `0..19`.

- fret-20 candidate scoring: allowed as preregistered candidate-domain compatibility
- `fret20QualityAuthority=false`
- no positive fret-20 quality claim
- no candidate generation, filtering, deletion, truncation, repair, or mutation

## Authority and privacy boundary

- controlled repository-fixture execution: complete
- live/user input: false
- runtime connection: false
- authoritative optimizer/final-selector effect: false
- canonical-result effect: false
- TAB/writer effect: false
- checkpoint mutation/refit: false
- network/telemetry: false
- production: false

The sealed artifact contains no raw MusicXML, local path, user filename, teacher label, validation label, or final label.

## Next human gate

`RUNTIME_SHADOW_CONNECTION_REVIEW`

This is a separate human/safety/consequential review. Until separately authorized, runtime connection, user-file shadow execution, final-selector influence, canonical/TAB effects and production remain closed.
