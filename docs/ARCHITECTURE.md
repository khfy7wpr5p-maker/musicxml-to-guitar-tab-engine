# MusicXML to Guitar TAB Engine — Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

## 1. Authority model

The system deliberately separates the protected public deterministic path from internal polyphonic, teacher-evaluation, and learned/shadow paths. `CanonicalTabResult 1.0.0` remains the only public TAB authority. No internal helper becomes authoritative merely because it is merged on `main`.

Package: version `0.1.0`, `private: true`, `UNLICENSED`, Node.js >=18.

## 2. Public deterministic engine

```text
MusicXML
 ↓
XML normalization/safety + ProcessingBudget/deadline/cancellation
 ↓
ParsedMusicXmlDocument 1.0.0
 ↓
supported monophonic semantic projection
 ↓
CanonicalMusicDocument
 ↓
GuitarConfiguration + physical string/fret candidates
 ↓
deterministic fingering cost model
 ↓
dynamic-programming optimizer
 ↓
CanonicalTabResult 1.0.0
 ↓
shared canonical validator
 ↓
JSON | ASCII TAB | TAB MusicXML
```

Parser authority, guitar-candidate authority, optimizer authority, canonical-result authority and writer authority remain separate. Writers serialize selected positions and never re-optimize.

## 3. Internal polyphonic architecture

```text
Polyphonic MusicXML
 ↓
XML Safety + ProcessingBudget
 ↓
ParsedMusicXmlDocument 1.0.0
 ↓
PA-1 PolyphonicSourceModel 1.0.0
 ↓
PA-2 bounded polyphonic projector
 ↓
PA-3 SimultaneousEventModel 1.0.0
 ↓
PA-4 GuitarArrangementPlan 1.0.0
 ↓
PA-5 DeterministicVoiceAnalysis 1.0.0
 ↓
PA-6 DeterministicReductionPlan 1.0.0
 ↓
PA-7 GuitarVoicingCandidateModel 1.0.0 (0..20 fret)
 ↓
PA-8 LeftHandShapeModel 1.0.0
 ↓
PA-9 PhysicalPlayabilityValidation 2.0.0
 ↓
PA-10 canonical-v2 design/compatibility contracts
 ↓
PA-11 independent teacher-evaluation infrastructure through PA-11.4A
 ↓
future final polyphonic selector
 ↓
future CanonicalTabResult 2.0.0 runtime
 ↓
future PA-12 E2E / PA-13 public polyphonic API
```

PA-1 through PA-9 are merged internal foundations. PA-10.0 through PA-10.5 are merged contract/design evidence. PA-11 is merged evaluation infrastructure through PA-11.4A. Final production arrangement selection is not implemented.

## 4. PA responsibilities

- **PA-1/2:** preserve/project bounded source truth; no guitar selection.
- **PA-3:** group exact simultaneous source events; no arrangement authority.
- **PA-4:** represent explicit arrangement decisions/provenance; does not choose a policy.
- **PA-5:** deterministic onset-local register roles; not semantic melody/bass truth.
- **PA-6:** deterministic preserved/omitted/octave-displaced/conservative chord-reduced execution; deferred decision kinds remain fail-closed.
- **PA-7:** enumerate exact-target-MIDI, distinct-string standard-guitar candidates in fret domain 0..20; enumeration order is not ranking.
- **PA-8:** structural finger/barre candidates; no universal ergonomic or final-selection truth.
- **PA-9:** conservative static playability verdicts; `PLAYABLE_WITHIN_POLICY` is policy-specific, not universal comfort/anatomy/tempo truth.
- **PA-10.3:** v1↔v2 compatibility/migration matrix.
- **PA-10.4:** minimal `CanonicalTabResult 2.0.0` schema proposal only.
- **PA-10.5:** exact-version fail-closed dispatch contract only.
- **PA-11:** teacher-reviewed evaluation, replay and scoring; no production selection.
- **PA-11.4A:** evaluation-only revoicing tone candidate atoms; no complete production voicing composition/selection.

## 5. Canonical v1/v2 boundary

Current runtime implements and publishes only `CanonicalTabResult 1.0.0` for the supported monophonic conversion path. PA-10 documentation proves why polyphonic meaning needs a separate major schema and defines future requirements, but there is no runtime v2 validator, dispatcher, migration engine, v2 writer, or package-root polyphonic API.

A v1 artifact alone cannot be losslessly upgraded to future v2 because required source/arrangement provenance is absent. Canonical v2→v1 downgrade is not a lossless semantic operation.

## 6. Teacher evaluation architecture

Teacher benchmark evidence is independent evaluation truth, not training data and not production authority. The PA-11 chain binds exact source bytes and exact approved artifact bytes, validates source/shape/physical semantics, produces gold-blind observed output, and scores only after the engine result is frozen. The genuine blind baseline is 2/4 teacher-approved matches.

## 7. Learned/shadow architecture

Historical GuitarSet v1 is scientifically bound to candidate frets 0..19. Exact v1 offline evidence remains historical and must not be rewritten.

`GUITARSET-OBSERVED-VOICING-MODEL.v2` is separately preregistered for candidate domain 0..20. PR #136 merged only an isolated offline/parity adapter. Python and Node feature/score/ranking parity and real PA-7 fret-20 candidate scoring are verified.

Safety facts:

- observed positive-gold domain: 0..19;
- `fret20QualityAuthority=false`;
- candidate mutation/filter/truncation: false;
- shadow execution: false at the PR #136 adapter boundary;
- live/user input: false;
- runtime connection: false;
- authoritative optimizer/canonical/TAB effect: false;
- production: false.

Next gate: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`.

That fixture-only gate may measure coverage, NO_SCORE, baseline agreement/disagreement, margins, candidate preservation, failure/privacy isolation and 10/10 determinism. It cannot wire the model into normal conversion.

## 8. Public compatibility boundary

Public monophonic validation remains fail-closed for chords/simultaneity, backup/forward, multiple voices/staves, multipart, grace notes, tuplets, unsupported 32nd rhythms and compressed `.mxl`. Internal PA support must never be exposed by weakening those checks.

## 9. Rendering/product boundary

```text
CanonicalTabResult 1.0.0
 ↓
TAB MusicXML
 ├─ alphaTab compatibility adapter
 └─ future MuseScore engraving/PDF adapter
```

PR #136 Tests #764 and MusicXML Compatibility #533 passed. alphaTab import, SVG render and browser renderer/cursor are compatibility-verified. Synth remains diagnostic, MuseScore semantic round-trip remains unverified, and PDF/application UI/persistence are not implemented. Renderers have no fingering authority.

## 10. Non-negotiable safety rules

1. Original MusicXML is immutable source truth.
2. XML/resource/deadline/cancellation hostile-input limits remain fail-closed.
3. Parsing never chooses guitar positions.
4. Physical validity precedes learned scoring.
5. Deterministic public optimization remains reproducible.
6. Teacher approval cannot make an impossible shape physically valid.
7. Teacher review is not training consent.
8. Evaluation benchmarks remain separate from training.
9. Learned models cannot fabricate notes/candidates or bypass physical validation.
10. Historical sealed evidence is immutable evidence, not a mutable status file.
11. Canonical-v2 design does not imply runtime-v2 implementation.
12. Runtime shadow, final selection, public polyphony and production are separately gated.
