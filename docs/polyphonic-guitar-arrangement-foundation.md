# Polyphonic Guitar Arrangement Foundation

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-24 -->

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146.

## Purpose and boundary

This is the active architecture view for the internal polyphonic-arrangement path. It does not replace the public monophonic conversion API. `CanonicalTabResult 1.0.0` remains public TAB authority.

Package context: version `0.1.0`, `private: true`, `SEE LICENSE IN LICENSE`, Node.js >=18.

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
authentic immutable single-generation PA-7 handoff
 ├─→ PA-8 LeftHandShapeModel 1.0.0
 │    ↓
 │   PA-9 PhysicalPlayabilityValidation 2.0.0
 │    ↓
 │   deterministic evaluation selection
 │
 └─→ detached deeply frozen PA-7 read-copy
      ↓
     GuitarSet v2 runtime-shadow evidence only

PA-10 canonical-v2 compatibility/design through PA-10.5
PA-11 teacher-approved evaluation through PA-11.4A
future final polyphonic selector
future internal PA-12 E2E
future public PA-13 polyphonic API
```

## Stage responsibilities

### PA-1 / PA-2
Preserve bounded source truth, timing, voices, staves, chord/source relationships and exact provenance. They do not choose a guitar arrangement.

### PA-3
Groups exact simultaneous pitched source events. Grouping is source evidence, not guitar-selection authority.

### PA-4
Represents explicit arrangement decisions/provenance. It does not autonomously choose final policy.

### PA-5
Provides deterministic onset-local register roles. These are analysis candidates, not semantic melody/bass truth.

### PA-6
Executes the approved deterministic subset. Deferred semantics remain fail-closed rather than guessed.

### PA-7
Enumerates exact-target-MIDI distinct-string positions under standard six-string tuning and frets 0..20. Candidate order is enumeration, not preference. Zero candidates never authorize silent note dropping.

### PA-7 handoff
`DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_V1` generates PA-7 exactly once and preserves authentic immutable group/candidate identity, order and position facts through PA-8/PA-9.

### PA-8
Builds structural left-hand finger/barre candidates while preserving PA-7 positions. Structural feasibility is not final-selection authority.

### PA-9
Replays/revalidates PA-8 under `CONSERVATIVE_STATIC_LEFT_HAND_2.0`. `PLAYABLE_WITHIN_POLICY` is a bounded static policy verdict, not universal comfort/anatomy/tempo truth.

### PA-10 / PA-11
PA-10.0–PA-10.5 define future canonical-v2 compatibility/design only. PA-11 is independent evaluation infrastructure through PA-11.4A. Neither creates a production selector.

## Runtime shadow in relation to PA-7

Stage: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

Runtime shadow connection: internal default-off.

The reviewed runtime bridge uses the same authentic PA-7 handoff consumed by deterministic PA-8/PA-9 selection, but it never passes that authoritative object to learned code. Instead it constructs a detached, deeply frozen plain-data read-copy that must preserve exact candidate group IDs, candidate IDs and sourceEventId/targetMidi/string/fret facts.

The v2 adapter may score that complete read-copy for diagnostics. It may not create, delete, filter, mutate or feed ordering back into deterministic selection. Model/artifact/scoring errors are isolated and the deterministic result survives.

Authority boundary:

- live/user input: false
- learned candidate generation/mutation/filter/deletion: false
- optimizer/final-selection effect: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation/refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- public package-root exposure: false

The retained model artifact remains scientifically bound to its original provenance fields. Engine-side runtime permission exists only in the separately reviewed bridge and does not rewrite the model.

## Learned fingering evidence

Historical GuitarSet v1 remains candidate-domain 0..19 evidence. `GUITARSET-OBSERVED-VOICING-MODEL.v2` uses candidate domain 0..20 while observed positive gold remains 0..19.

Controlled offline status remains `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`.

Immutable evidence:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

It records 4/4 candidate-bearing coverage, 153/153 candidate preservation, three baseline disagreements, 48 fret-20 candidates, zero shadow errors and 10/10 determinism.

## Missing core capability: final polyphonic selection

The architecture has source truth, deterministic reduction, guitar candidate generation, structural fingering, physical validation, teacher evaluation and learned diagnostic scoring. What remains absent is a production final selector that safely decides among complete playable arrangement alternatives across local and transition/path context.

A future selector must separately define and verify candidate admissibility/abstention, deterministic fallback, temporal transition costs, revoicing semantics, sustained-sonority interaction, complete shape selection, teacher-evaluation independence, any learned-score authority tier and audit provenance.

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

None of these arrows is authorized by the runtime shadow connection.

## Security invariants

1. Public monophonic rejection rules remain unchanged until a separate public API is approved.
2. No internal stage mutates original MusicXML source truth.
3. Candidate generation, left-hand modeling, physical validation, shadow scoring and final selection remain distinct authorities.
4. Teacher approval cannot bypass physical validity and is not training consent.
5. Learned models cannot create/delete/filter/truncate/mutate PA-7 candidates.
6. Historical sealed evidence is immutable.
7. Runtime shadow connection is diagnostic and default-off, not learned-selection authority.
8. Live/user-input activation, production selection and public polyphony remain separate consequential gates.
