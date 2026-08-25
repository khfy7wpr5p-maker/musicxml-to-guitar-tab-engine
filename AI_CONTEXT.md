# AI Context — Read This First

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-24 -->

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146. PA-12 internal end-to-end implementation: PR #150.

This is the active read-first status for coding agents and reviewers. Historical versioned contracts, closure records and sealed scientific evidence remain exact historical records and are not rewritten when the live architecture advances.

## Executable authority

Current package metadata: version `0.1.0`, `private: true`, `SEE LICENSE IN LICENSE`, Node.js >=18.

The public conversion path remains deterministic and monophonic:

```text
MusicXML → XML safety/ProcessingBudget → ParsedMusicXmlDocument 1.0.0
→ supported monophonic semantic projection → CanonicalMusicDocument
→ physical candidates → deterministic cost + DP optimizer
→ CanonicalTabResult 1.0.0 → canonical validator
→ JSON / ASCII TAB / TAB MusicXML
```

`CanonicalTabResult 1.0.0` is the only public downstream TAB authority. Package-root exports remain exactly the approved conversion, preflight, fretboard, error-detection and writer APIs. No PA, teacher benchmark, learned model, GuitarSet adapter or runtime-shadow bridge is exported.

## Current PA state

- PA-1 `PolyphonicSourceModel 1.0.0`: ✅ internal
- PA-2 projection sequence: ✅ closed
- PA-3 `SimultaneousEventModel 1.0.0`: ✅ internal
- PA-4 `GuitarArrangementPlan 1.0.0`: ✅ internal
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: ✅ internal
- PA-6 `DeterministicReductionPlan 1.0.0`: ✅ internal
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: ✅ internal, standard six-string frets 0..20
- deterministic PA-7 single-generation immutable handoff: ✅ merged
- PA-8 `LeftHandShapeModel 1.0.0`: ✅ internal
- PA-9 `PhysicalPlayabilityValidation 2.0.0`: ✅ internal
- PA-10.0–PA-10.5: ✅ merged canonical-v2 compatibility/design contracts
- PA-11 evaluation chain: ✅ merged through PA-11.4A
- deterministic final polyphonic selector: ✅ internal, non-ML and fail-closed
- `CanonicalTabResult 2.0.0` runtime/validator/writer: ✅ internal
- PA-12 internal polyphonic E2E: ✅ implemented, non-public
- PA-13 public polyphonic API: 🔒 not implemented

PA-10.3 defines v1↔v2 coexistence/migration rules, PA-10.4 defines minimal `CanonicalTabResult 2.0.0`, and PA-10.5 defines exact-version fail-closed dispatch. The internal v2 runtime/writer and PA-12 path create no package-root/public v2 authority; the public dispatcher remains separately gated.

## GuitarSet v2 state

Retained model identity is `GUITARSET-OBSERVED-VOICING-MODEL.v2`.

Controlled offline status remains `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`.

Historical sealed evidence remains:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Its byte SHA-256 is `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba`. It records 4/4 candidate-bearing coverage, 153/153 candidate preservation, one zero-candidate NO_SCORE group, 1/4 baseline agreement, three disagreements, 48 fret-20 candidates, zero shadow errors and 10/10 deterministic reproduction.

Observed positive GuitarSet gold remains frets 0..19 while candidate domain is 0..20, therefore `fret20QualityAuthority=false`.

## Runtime shadow connection

Current gate: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

Approved architecture:

```text
PA-7 generation exactly once
        ↓
authentic immutable PA-7 snapshot
        ├─→ PA-8 → PA-9 → deterministic baseline selection
        └─→ detached deeply frozen read-copy → GuitarSet v2 score/evidence only
```

Runtime shadow connection: internal default-off.

The reviewed `src/learning/guitarsetVoicingModelV2RuntimeShadow.js` bridge is the only source call site allowed to reach the v2 shadow adapter. Ordinary runtime modules do not activate that bridge, and `src/index.js` does not export it.

Authority boundary:

- runtime shadow connection: internal default-off
- explicit internal shadow execution through reviewed bridge: allowed
- live/user input: false
- candidate generation/mutation/filter/deletion by learned code: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation: false
- refit/retraining: false
- `fret20QualityAuthority=false`
- production: false

The deterministic result is created from the same single-generation PA-7 handoff. Shadow scoring receives only a detached, deeply frozen read-copy. Shadow/model/artifact failures are converted to isolated diagnostic evidence and cannot replace the deterministic result.

The retained development model and underlying offline-parity adapter keep their historical `runtime_connection_authorized=false` and `shadow_execution_authorized=false` provenance fields. The engine-side review does not rewrite those artifacts or grant model authority.

## Compatibility status

PR #146 passed the protected Node.js 18/20/22, alphaTab import/SVG, browser renderer/cursor, synth diagnostic and MuseScore CLI-availability matrix before merge. Each later change must pass its applicable protected matrix on its own exact head; PR #165 adds UI-07 static and real-Chromium identity/command-projection gates.

MuseScore semantic import/re-export/round-trip and production PDF remain unverified/not implemented. Synth compatibility is not production-playback authority.

## Non-negotiable rules

1. Source MusicXML is immutable source truth.
2. Parsing does not choose strings/frets; writers do not rerun optimization.
3. Physical validation precedes learned scoring.
4. Deterministic behavior remains reproducible and authoritative wherever currently defined.
5. Public monophonic rejection rules may not be weakened to expose internal polyphony.
6. PA-7 enumeration order is not preference.
7. PA-8 structural fingering is not universal ergonomics.
8. PA-9 `PLAYABLE_WITHIN_POLICY` is not universal anatomy/comfort/tempo truth.
9. Teacher approval is evaluation evidence, not training consent or production authority.
10. Fixed evaluation benchmarks remain separate from training data.
11. Learned/shadow modules may score only pre-existing valid candidates and cannot fabricate, delete, filter or mutate them.
12. Historical evidence must not be silently regenerated under a newer model/protocol.
13. Internal `CanonicalTabResult 2.0.0` runtime and PA-12 do not create package-root/public v2 authority.
14. Runtime shadow connection does not imply final-selection authority.
15. Live/user-input shadow activation, learned decision authority, public polyphony, production playback/PDF and release remain separate consequential gates.

## Source-of-truth order

When sources disagree:

1. merged source/tests/workflows/package metadata on `main`;
2. applicable runtime contract modules;
3. exact versioned contract/closure/evidence documents;
4. this file;
5. `docs/current-status.md`;
6. `docs/package-status.md`;
7. `docs/ARCHITECTURE.md`, `README.md`, `docs/polyphonic-guitar-arrangement-foundation.md`;
8. older historical/planning drafts.

`docs/DATA-CONTRACT.md` is a deprecated historical draft and is not current runtime authority.
