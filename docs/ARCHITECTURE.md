# MusicXML to Guitar TAB Engine — Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-24 -->

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146.

## 1. Authority model

The system separates the protected public deterministic path from internal polyphonic, teacher-evaluation and learned/shadow paths. `CanonicalTabResult 1.0.0` remains the only public TAB authority. No internal helper becomes authoritative merely because it is merged.

Package: version `0.1.0`, `private: true`, `SEE LICENSE IN LICENSE`, Node.js >=18.

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
physical string/fret candidates
 ↓
deterministic fingering cost + DP optimizer
 ↓
CanonicalTabResult 1.0.0
 ↓
shared canonical validator
 ↓
JSON | ASCII TAB | TAB MusicXML
```

Parser authority, candidate authority, optimizer authority, canonical-result authority and writer authority remain separate. Writers serialize selected positions and never re-optimize.

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
authentic immutable single-generation PA-7 handoff
 ├─→ PA-8 LeftHandShapeModel 1.0.0
 │    ↓
 │   PA-9 PhysicalPlayabilityValidation 2.0.0
 │    ↓
 │   deterministic evaluation selection
 │
 └─→ detached deeply frozen PA-7 read-copy
      ↓
     GuitarSet v2 runtime-shadow score/evidence only

PA-10 canonical-v2 design/compatibility contracts through PA-10.5
PA-11 independent teacher-evaluation infrastructure through PA-11.4A
future final polyphonic selector
future CanonicalTabResult 2.0.0 runtime
future PA-12 E2E / PA-13 public polyphonic API
```

PA-1 through PA-9 are merged internal foundations. PA-10.0 through PA-10.5 are contract/design evidence. PA-11 is evaluation infrastructure through PA-11.4A. Final production arrangement selection remains unimplemented.

## 4. PA responsibilities

- **PA-1/2:** preserve/project bounded source truth; no guitar selection.
- **PA-3:** group exact simultaneous source events; no arrangement authority.
- **PA-4:** represent explicit arrangement decisions/provenance; does not choose a policy.
- **PA-5:** deterministic onset-local register roles; not semantic melody/bass truth.
- **PA-6:** deterministic execution of the approved subset; deferred decisions remain fail-closed.
- **PA-7:** enumerate exact-target-MIDI, distinct-string standard-guitar candidates in fret domain 0..20; enumeration order is not ranking.
- **PA-7 handoff:** produce PA-7 exactly once and preserve authentic immutable identity/order/position facts for downstream consumers.
- **PA-8:** structural finger/barre candidates; no universal ergonomic or final-selection truth.
- **PA-9:** conservative static playability verdicts; policy-specific, not universal comfort/anatomy/tempo truth.
- **PA-10.5:** exact-version fail-closed dispatch contract only.
- **PA-11:** teacher-reviewed evaluation/replay/scoring; no production selection.
- **PA-11.4A:** evaluation-only revoicing tone candidate atoms; no complete production voicing selection.

## 5. Runtime shadow architecture

Stage: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

Runtime shadow connection: internal default-off.

The only reviewed engine-side seam is `src/learning/guitarsetVoicingModelV2RuntimeShadow.js`. It may explicitly invoke the sealed v2 parity adapter; ordinary runtime source files may not import or activate that bridge, and package-root exports remain unchanged.

Execution invariants:

1. deterministic PA-7 candidates are generated exactly once;
2. PA-8/PA-9 deterministic selection consumes the authentic handoff;
3. the shadow branch receives only a detached deeply frozen read-copy of PA-7 candidate identity/order/position facts;
4. shadow scoring may rank only for diagnostic evidence;
5. no shadow ranking is fed to deterministic selection;
6. model/artifact/scoring failures are isolated and cannot replace the deterministic result.

Authority boundary:

- live/user input: false
- learned candidate generation/mutation/filter/deletion: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation: false
- refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- public exposure: false

The retained development artifact and underlying parity adapter retain their own historical `runtime_connection_authorized=false` and `shadow_execution_authorized=false` provenance. Engine-side permission is represented by the separately reviewed bridge and does not alter the retained model contract.

## 6. Canonical v1/v2 boundary

Current runtime implements/publishes only `CanonicalTabResult 1.0.0` for supported monophonic conversion. PA-10 documentation defines future polyphonic requirements but there is no runtime v2 validator, dispatcher, migration engine, v2 writer or package-root polyphonic API.

## 7. Teacher evaluation architecture

Teacher benchmark evidence is independent evaluation truth, not training data and not production authority. The genuine blind baseline remains 2/4 teacher-approved matches. Shadow scoring does not alter teacher-gold evidence or deterministic baseline output.

## 8. GuitarSet scientific boundary

`GUITARSET-OBSERVED-VOICING-MODEL.v2` uses candidate domain 0..20. Observed positive-gold remains 0..19, so `fret20QualityAuthority=false`.

Controlled offline evidence remains immutable as `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Historical evidence records 4/4 candidate-bearing coverage, 153/153 candidate preservation, one zero-candidate NO_SCORE group, 1/4 baseline agreement, three disagreements, 48 fret-20 candidates, zero shadow errors and 10/10 determinism.

## 9. Public compatibility boundary

Public monophonic validation remains fail-closed for chords/simultaneity, backup/forward, multiple voices/staves, multipart scores, grace notes, tuplets, unsupported rhythms and compressed `.mxl`. Internal PA or shadow support must never be exposed by weakening those checks.

PR #146 functional implementation slice passed Node.js 18/20/22 tests, alphaTab MusicXML import/SVG on all supported Node versions, browser renderer/cursor, synth diagnostic and MuseScore CLI availability. Exact-head protected CI must pass again after documentation convergence.

## 10. Rendering/product boundary

Renderers are downstream presentation adapters with no fingering authority. MuseScore semantic round-trip, production PDF, playback authority, product viewer/persistence and public polyphonic application integration remain separate gates.

## 11. Non-negotiable safety rules

1. Original MusicXML is immutable source truth.
2. XML/resource/deadline/cancellation hostile-input limits remain fail-closed.
3. Parsing never chooses guitar positions.
4. Physical validity precedes learned scoring.
5. Deterministic public optimization remains reproducible and authoritative for the current public path.
6. PA-7 enumeration is not preference/final selection.
7. Teacher approval cannot bypass physical validity and is not training consent.
8. Fixed evaluation benchmarks remain separate from training.
9. Learned models cannot create/delete/filter/truncate/mutate PA-7 candidates.
10. Runtime shadow scoring cannot feed deterministic selection without a separate authority gate.
11. Historical sealed evidence is immutable evidence, not a mutable status file.
12. Canonical-v2 design does not imply runtime-v2 implementation.
13. Live/user-input shadow activation, learned selection authority, public polyphony and production are separate consequential gates.
