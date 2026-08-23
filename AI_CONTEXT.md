# AI Context — Read This First

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

This is the active read-first status for coding agents and reviewers. Historical versioned contracts, closure records, and sealed scientific evidence remain exact historical records and are not rewritten when the active snapshot advances.

## Executable authority

Current package metadata: version `0.1.0`, `private: true`, `UNLICENSED`, Node.js >=18.

The public conversion path remains deterministic and monophonic:

```text
MusicXML → XML safety/ProcessingBudget → ParsedMusicXmlDocument 1.0.0
→ supported monophonic semantic projection → CanonicalMusicDocument
→ physical candidates → deterministic cost + DP optimizer
→ CanonicalTabResult 1.0.0 → canonical validator
→ JSON / ASCII TAB / TAB MusicXML
```

`CanonicalTabResult 1.0.0` is the only public downstream TAB authority. Public conversion continues to fail closed for chords/simultaneous events, backup/forward polyphonic timing, multiple voices/staves, multipart scores, grace notes, tuplets, unsupported 32nd values, and compressed `.mxl`.

Package-root exports remain exactly the approved conversion, preflight, fretboard, error-detection and three writer APIs. No PA, teacher benchmark, learned model, or shadow adapter is exported.

## Current PA state

- PA-1 `PolyphonicSourceModel 1.0.0`: ✅ internal
- PA-2 projection sequence: ✅ closed
- PA-3 `SimultaneousEventModel 1.0.0`: ✅ internal
- PA-4 `GuitarArrangementPlan 1.0.0`: ✅ internal
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: ✅ internal
- PA-6 `DeterministicReductionPlan 1.0.0`: ✅ internal
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: ✅ internal, standard six-string 0..20 fret candidates
- PA-8 `LeftHandShapeModel 1.0.0`: ✅ internal
- PA-9 `PhysicalPlayabilityValidation 2.0.0`: ✅ internal
- PA-10.0–PA-10.5: ✅ merged canonical-v2 compatibility/design contracts
- PA-11 evaluation chain: ✅ merged through PA-11.4A
- final polyphonic selector: 🔒 not implemented
- PA-12 internal polyphonic E2E: 🔒 not activated
- PA-13 public polyphonic API: 🔒 not implemented

PA-10.3 defines v1↔v2 coexistence/migration rules, PA-10.4 proposes minimal `CanonicalTabResult 2.0.0`, and PA-10.5 defines exact-version fail-closed dispatch. None creates a runtime v2 validator, dispatcher, migration engine, writer, or public authority.

PA-11 includes immutable teacher review/approval binding, evaluation admission/semantics/replay, independent observed-output scoring, gold-blind baseline measurement, and PA-11.4A revoicing tone candidates. The genuine blind baseline is 2/4 matches. PA-11 remains evaluation-only.

## GuitarSet learned-fingering state

Historical v1 is a 0..19 candidate-domain model and its exact offline evidence remains historical. Engine PA-7 is 0..20, so v1 correctly held domain-incomplete groups rather than clipping/truncating them.

`GUITARSET-OBSERVED-VOICING-MODEL.v2` was separately preregistered for candidate domain 0..20. Training/evaluation/retention and cross-repo shadow-integration review passed. PR #136 merged the isolated v2 Node adapter and Python↔Node 28D feature/score/ranking parity.

Scientific/authority boundary:

- positive observed GuitarSet gold remains frets 0..19;
- `fret20QualityAuthority=false`;
- fret-20 candidate scoring is allowed only as preregistered candidate-domain compatibility;
- candidate mutation/filter/truncation: false;
- shadow execution: false at the PR #136 adapter boundary;
- live/user input: false;
- runtime connection: false;
- authoritative optimizer/canonical/TAB effect: false;
- production: false.

Next gate: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`.

That gate must remain repository-fixture-only and diagnostic. It may measure candidate-bearing coverage, NO_SCORE, baseline agreement/disagreement, margins, fret-20 candidate exposure, candidate preservation, failure/privacy isolation and 10/10 determinism. It may not connect to normal runtime or change TAB.

## Compatibility status

PR #136 exact-head evidence: Tests #764 ✅ and MusicXML Compatibility #533 ✅. The required matrix covers Node.js 18/20/22 plus alphaTab import/SVG; the Node 22 browser job validates renderer/cursor. The alphaTab synth command is diagnostic with `continue-on-error` and is not production playback evidence. MuseScore CI currently checks command availability only; semantic import/re-export/round-trip and PDF remain unverified/not implemented.

## Non-negotiable rules

1. Source MusicXML is immutable source truth.
2. Parsing does not choose strings/frets; writers do not rerun optimization.
3. Physical validation precedes learned scoring.
4. Deterministic optimizer behavior remains reproducible and the mandatory public fallback.
5. Polyphonic support must remain a parallel internal path until separately published; never weaken public monophonic rejection checks.
6. PA-5 role labels are deterministic register candidates, not semantic melody truth.
7. PA-6 executes only approved deterministic transformations; deferred decisions remain fail-closed.
8. PA-7 enumerates candidates; candidate order is not ranking.
9. PA-8 shape existence is not universal ergonomics.
10. PA-9 `PLAYABLE_WITHIN_POLICY` is not universal anatomy/comfort/tempo truth.
11. Teacher approval is evaluation evidence, not training consent or production authority.
12. Fixed evaluation benchmarks must not become training data.
13. Learned/shadow modules may score only pre-existing valid candidates and cannot fabricate source notes or positions.
14. Historical evidence must not be silently regenerated under a newer model/protocol.
15. `CanonicalTabResult 2.0.0` design documents do not create runtime v2 authority.
16. Runtime-shadow connection, final selection, public polyphonic conversion, production playback/PDF and release are separate consequential gates.

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
