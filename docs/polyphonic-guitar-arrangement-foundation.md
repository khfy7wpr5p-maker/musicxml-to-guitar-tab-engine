# Polyphonic Guitar Arrangement Foundation

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

## Purpose and boundary

This is the active architecture view for the internal polyphonic-arrangement path. It does not replace the current public monophonic conversion API. `CanonicalTabResult 1.0.0` remains the public TAB authority.

Package context: version `0.1.0`, `private: true`, `UNLICENSED`, Node.js >=18.

## Implemented internal chain

```text
Polyphonic MusicXML
 ↓
XML safety + ProcessingBudget
 ↓
ParsedMusicXmlDocument 1.0.0
 ↓
PA-1 PolyphonicSourceModel 1.0.0
 ↓
PA-2 bounded polyphonic projection
 ↓
PA-3 SimultaneousEventModel 1.0.0
 ↓
PA-4 GuitarArrangementPlan 1.0.0
 ↓
PA-5 DeterministicVoiceAnalysis 1.0.0
 ↓
PA-6 DeterministicReductionPlan 1.0.0
 ↓
PA-7 GuitarVoicingCandidateModel 1.0.0
 ↓
PA-8 LeftHandShapeModel 1.0.0
 ↓
PA-9 PhysicalPlayabilityValidation 2.0.0
 ↓
PA-10 canonical-v2 compatibility/design contracts through PA-10.5
 ↓
PA-11 teacher-approved evaluation through PA-11.4A
 ↓
future final polyphonic selector
 ↓
future internal PA-12 E2E
 ↓
future public PA-13 polyphonic API
```

## Stage responsibilities

### PA-1 / PA-2

Preserve bounded source truth, timing, voices, staves, chord/source relationships and exact provenance. They do not choose a guitar arrangement.

### PA-3

Groups exact simultaneous pitched source events. Grouping is source evidence, not guitar-selection authority.

### PA-4

Represents explicit decisions such as `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED`, `VOICE_REDISTRIBUTED`, `CHORD_REDUCED`, `REVOICED`, and `ARPEGGIATED`, with exact provenance. It does not autonomously choose the final decision policy.

### PA-5

Provides deterministic onset-local register roles. These are analysis candidates, not semantic melody/bass truth.

### PA-6

Executes the approved deterministic subset: preserved/omitted/octave-displaced/conservative chord-reduced behavior. Deferred decision semantics remain fail-closed rather than being guessed.

### PA-7

Enumerates deterministic exact-target-MIDI distinct-string guitar positions under standard six-string tuning and frets 0..20. Candidate order is enumeration, not preference. Zero candidates never authorize silent note dropping.

### PA-8

Builds structural left-hand finger/barre candidates while preserving PA-7 positions. Structural feasibility is not universal ergonomic or final-selection authority.

### PA-9

Replays/revalidates PA-8 under `CONSERVATIVE_STATIC_LEFT_HAND_2.0`. `PLAYABLE_WITHIN_POLICY` is a bounded static policy verdict, not universal comfort, anatomy, tempo or performance truth.

### PA-10

PA-10.0–PA-10.5 establish the separate-major canonical-v2 direction, frozen-v1 compatibility, exact polyphonic canonical requirements, v1↔v2 migration/coexistence semantics, a minimal `CanonicalTabResult 2.0.0` proposal and exact fail-closed dispatch rules. No runtime v2 validator/dispatcher is implemented.

### PA-11

PA-11 is evaluation infrastructure. Exact teacher review/approval is bound to immutable artifacts; source and physical semantics are replayed independently; gold-blind output is frozen before teacher scoring. The genuine blind baseline is 2/4 matches. PA-11.4A adds evaluation-only revoicing tone candidates, not a complete voicing selector.

## Learned fingering in relation to PA-7

Historical GuitarSet v1 uses candidate domain 0..19 and remains immutable scientific evidence. PA-7 uses 0..20, which exposed a deliberate v1 domain mismatch in controlled shadow evidence.

`GUITARSET-OBSERVED-VOICING-MODEL.v2` was separately preregistered for candidate domain 0..20. Python↔Node parity and exact-main controlled-offline execution are complete without deleting, filtering, truncating or generating PA-7 candidates.

Evidence status: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`. The artifact `evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json` is byte-sealed to `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba` and records 4/4 candidate-bearing coverage, 153/153 candidate preservation, three baseline disagreements, 48 fret-20 candidates, zero shadow errors, and 10/10 determinism.

Observed positive gold remains 0..19, therefore `fret20QualityAuthority=false`.

Authority remains:

- controlled repository-fixture execution: complete
- live/user input: false
- runtime connection: false
- optimizer/final-selection effect: false
- canonical/TAB effect: false
- production: false

Next human/consequential gate: `RUNTIME_SHADOW_CONNECTION_REVIEW`. The evidence cannot become the final selector.

## Missing core capability: final polyphonic selection

The architecture already has source truth, deterministic reduction, guitar candidate generation, structural fingering, physical-policy validation, teacher evaluation and learned offline scoring foundations. What remains intentionally absent is a production final selector that can safely decide among complete playable arrangement alternatives across local and transition/path context.

A future selector must define and verify at least:

- candidate admissibility and abstention;
- deterministic fallback;
- transition/path costs across time;
- revoicing/voice-redistribution semantics;
- sustained-sonority interaction;
- complete shape/fingering selection;
- teacher-evaluation independence;
- learned-score non-authority or explicitly reviewed authority tier;
- deterministic reproduction and audit provenance.

## Future canonical/public path

```text
approved internal final selector
 ↓
separately implemented CanonicalTabResult 2.0.0 validator/runtime
 ↓
exact version dispatcher
 ↓
polyphonic writers/compatibility evidence
 ↓
PA-12 internal E2E + monophonic regression
 ↓
PA-13 public polyphonic API
```

None of these future arrows is authorized merely by the existence of PA-10 design documents or PA-11 evaluation code.

## Security invariants

1. Public monophonic rejection rules remain unchanged until a separate public API is approved.
2. No internal stage mutates original MusicXML source truth.
3. Candidate generation, left-hand modeling, physical validation, ranking and final selection remain distinct authorities.
4. Teacher approval cannot bypass physical validity and is not training consent.
5. Learned models cannot create/delete/filter/truncate PA-7 candidates.
6. Historical sealed evidence is immutable.
7. Runtime shadow, production selection and public polyphony remain separate consequential gates.
