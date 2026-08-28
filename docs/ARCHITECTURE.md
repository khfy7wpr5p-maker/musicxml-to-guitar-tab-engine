# MusicXML to Guitar TAB Engine — Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-28 -->

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146. PA-12 internal end-to-end implementation: PR #150.

Polyphony status reconciliation base: protected `main` at `0210976ffc74123df8a3c8c0fab2d3cf69067c32`. This update records implementation status only; it does not change the authority model or main architecture. See `docs/polyphony-compatibility-audit-2026-08-28.md`.

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
 │   attack-local deterministic evaluation selection
 │
 └─→ detached deeply frozen PA-7 read-copy
      ↓
     GuitarSet v2 runtime-shadow score/evidence only

PA-10 canonical-v2 design/compatibility contracts through PA-10.5
PA-11 independent teacher-evaluation infrastructure through PA-11.4A
internal attack-local deterministic final polyphonic selector
internal CanonicalTabResult 2.0.0 runtime/writer
PA-12 internal E2E
future PA-13 public polyphonic API
```

PA-1 through PA-9 are merged internal foundations. PA-10.0 through PA-10.5 are contract/design evidence. PA-11 is evaluation infrastructure through PA-11.4A. The current Canonical V2 producer and PA-12 path are internal, explicit-decision, non-ML and fail-closed. Production/public arrangement authority remains unimplemented.

### 3.1 Sustained-polyphony implementation status

The PS architecture remains a parallel internal line rather than a silent replacement of the active selector:

```text
PolyphonicSourceModel
 ↓
PS-1 temporal events
 ↓
PS-2 sustain/tie + duration invariants
 ↓
PS-3 active sonority/timeline
 ↓
PS-4 sustained guitar-state/slicing foundations
 ↓
PS-5 bounded deterministic sustained path solver
 ↓
[separately reviewed Canonical V2 integration gate]
```

PS-1 through PS-6 implementation/evidence work exists internally on main, including the sustained path solver and subsequent Bach/real-world compatibility normalizers. However, at the 2026-08-28 audit base, `createCanonicalTabResultV2()` still delegates final selection to the older attack-local `createDeterministicPolyphonicFinalSelection()` path. That active selector declares sustained policy `FAIL_CLOSED_ON_RETAINED_OVERLAP_OR_TIE_1.0`; retained-note overlap fails with generic code `UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION` and `details.reason = RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED`.

Therefore the repository has **internal sustained-solving capability but no active sustained-selector authority in Canonical V2 yet**. This is an integration gap, not a writer limitation and not permission to change the authority graph without a new reviewed gate.

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
- **Attack-local deterministic final selector:** selects only from physically validated candidates under explicit PA-4 decisions and fails closed on unsupported sustained overlap.
- **PS-1..PS-5:** derive/solve bounded sustained temporal and guitar-state facts internally; PS-5 output is not currently connected as Canonical V2 authority.
- **PS-6:** regression/determinism/Bach-oriented compatibility evidence line; broad real-world support remains gated by exact-head evidence.
- **PA-12:** integrates bounded raw MusicXML through internal `CanonicalTabResult 2.0.0` and its MusicXML writer under one shared runtime budget; it is not package-root exported.

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

The public runtime implements/publishes only `CanonicalTabResult 1.0.0` for supported monophonic conversion. Internal code implements the exact `CanonicalTabResult 2.0.0` producer/validator and MusicXML writer used by PA-12. There is still no public v1/v2 dispatcher, migration engine or package-root polyphonic API.

`CanonicalTabResult 2.0.0` must not be described as already having sustained-polyphony selection authority. Its current producer still delegates to the attack-local selector; the separate sustained path solver requires its own reviewed integration gate.

## 7. Teacher evaluation architecture

Teacher benchmark evidence is independent evaluation truth, not training data and not production authority. The genuine blind baseline remains 2/4 teacher-approved matches. Shadow scoring does not alter teacher-gold evidence or deterministic baseline output.

## 8. GuitarSet scientific boundary

`GUITARSET-OBSERVED-VOICING-MODEL.v2` uses candidate domain 0..20. Observed positive-gold remains 0..19, so `fret20QualityAuthority=false`.

Controlled offline evidence remains immutable as `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Historical evidence records 4/4 candidate-bearing coverage, 153/153 candidate preservation, one zero-candidate NO_SCORE group, 1/4 baseline agreement, three disagreements, 48 fret-20 candidates, zero shadow errors and 10/10 determinism.

## 9. Public compatibility boundary

Public monophonic validation remains fail-closed for chords/simultaneity, backup/forward, multiple voices/staves, multipart scores, grace notes, tuplets, unsupported rhythms and compressed `.mxl`. Internal PA, PS or shadow support must never be exposed by weakening those checks.

For internal POLY_V2, parser capability and polyphonic admission are separate boundaries: real-world exported MusicXML may parse successfully yet still be rejected by the strict polyphonic projection/normalization subset. This must be described as an admission/normalization incompatibility rather than a generic XML-reader defect.

PR #146 passed the protected Node.js 18/20/22, alphaTab MusicXML import/SVG, browser renderer/cursor, synth diagnostic and MuseScore CLI-availability matrix before merge. Every later change must pass the applicable protected matrix on its own exact head; PR #165 adds UI-07 static and real-Chromium identity/command-projection gates. PR #208 remains open and lacks passing exact-head test/MusicXML-compatibility evidence at the 2026-08-28 audit, so grace-note or broad Bach compatibility is not yet an approved claim.

## 10. Rendering/product boundary

Renderers are downstream presentation adapters with no fingering authority. The Guitar TAB Workbench is an implemented browser/controller layer over bounded application hosts:

`immutable source bytes + exact SHA + bounded command chain → MONO_V1 or POLY_V2 runtime host → full canonical/TAB regeneration → alphaTab reload`

The browser may hold read-only renderer/source identity evidence, but the host projects requests to the versioned runtime schema and the authoritative runtime revalidates source identity, group topology and playability. Same-pitch POLY_V2 selection is accepted only through matching renderer voice, canonical source track, per-voice onset, chord MIDI multiset and duplicate ordinal evidence. Retained POLY_V2 ties remain fail-closed with `RETAINED_TIE_NOT_SUPPORTED`.

GitHub Pages is a static, read-only preview produced from a fixed CI fixture and has no upload/edit endpoint. MuseScore semantic round-trip, production PDF, hosted persistence, release operations and public polyphonic API authority remain separate gates.

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
12. Internal canonical-v2 implementation does not imply package-root/public v2 authority.
13. Internal sustained-path implementation does not imply active Canonical V2/runtime authority.
14. Live/user-input shadow activation, learned selection authority, public polyphony and production are separate consequential gates.
