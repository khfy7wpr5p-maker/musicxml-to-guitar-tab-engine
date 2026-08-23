# MusicXML to Guitar TAB Engine

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

A security-first deterministic MusicXML → playable six-string guitar TAB engine with a separately gated internal polyphonic-arrangement and learned-fingering research path.

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

## Current authority boundary

The public package remains the deterministic monophonic engine. `CanonicalTabResult 1.0.0` is the only current public downstream TAB authority. Internal polyphonic, teacher-evaluation, and learned/shadow components cannot alter public conversion output unless a future separately reviewed runtime gate explicitly changes that contract.

Current package metadata:

- version: `0.1.0`
- `private: true`
- license: `UNLICENSED`
- Node.js >=18
- runtime dependency: `saxes@6.0.0`

## Public deterministic path

```text
MusicXML
  ↓
XML normalization + safety + ProcessingBudget
  ↓
ParsedMusicXmlDocument 1.0.0
  ↓
supported monophonic semantic projection
  ↓
CanonicalMusicDocument
  ↓
physical string/fret candidates
  ↓
deterministic fingering cost model
  ↓
dynamic-programming optimizer
  ↓
CanonicalTabResult 1.0.0
  ↓
shared canonical validation
  ↓
JSON / ASCII TAB / TAB MusicXML
```

The parser never chooses guitar strings/frets. Writers never rerun optimization. Unsupported public structures remain fail-closed.

### Current public musical scope

Supported: uncompressed `score-partwise` MusicXML, one part, one staff, one voice, monophonic notes/rests, pitch step/alter/octave, whole/half/quarter/eighth/16th values, dots, divisions, time signatures, pickup/implicit measures, ties, and beam metadata.

The public path continues to reject chords/simultaneous events, `backup`/`forward` polyphonic timing, multiple voices/staves, multipart scores, grace notes, tuplets, unsupported values such as 32nd notes, and compressed `.mxl`.

## Public package API

`src/index.js` exposes exactly:

- `ENGINE_ERROR_CONTRACT_VERSION`
- `FretboardError`
- `PREFLIGHT_STATUS`
- `convertMusicXmlToCanonicalTab`
- `getPositionCandidates`
- `isEngineError`
- `positionToMidi`
- `preflightMusicXml`
- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`
- `validateMidi`

No PA, benchmark, GuitarSet, model, or shadow adapter is package-root exported.

## Internal polyphonic architecture

```text
Polyphonic / piano MusicXML
        ↓
XML Safety + ProcessingBudget
        ↓
ParsedMusicXmlDocument 1.0.0
        ↓
PA-1  PolyphonicSourceModel 1.0.0                    ✅ internal
        ↓
PA-2  bounded polyphonic projection                  ✅ closed
        ↓
PA-3  SimultaneousEventModel 1.0.0                   ✅ internal
        ↓
PA-4  GuitarArrangementPlan 1.0.0                    ✅ internal
        ↓
PA-5  DeterministicVoiceAnalysis 1.0.0               ✅ internal
        ↓
PA-6  DeterministicReductionPlan 1.0.0               ✅ internal
        ↓
PA-7  GuitarVoicingCandidateModel 1.0.0              ✅ internal, frets 0..20
        ↓
PA-8  LeftHandShapeModel 1.0.0                       ✅ internal
        ↓
PA-9  PhysicalPlayabilityValidation 2.0.0            ✅ internal
        ↓
PA-10 canonical-v2 compatibility/design              ✅ 10.0–10.5 merged contracts
        ↓
PA-11 teacher-approved evaluation                     ✅ through PA-11.4A
        ↓
future final polyphonic selector                      🔒 not implemented
        ↓
future PA-12 internal E2E                             🔒
        ↓
future PA-13 public polyphonic API                    🔒
```

### PA-10 status

PA-10.0 through PA-10.5 are merged design/compatibility evidence:

- PA-10.0 v1/v2 authority boundary
- PA-10.1 frozen-v1 compatibility characterization
- PA-10.2 polyphonic canonical data requirements
- PA-10.3 v1↔v2 compatibility/migration matrix
- PA-10.4 minimal `CanonicalTabResult 2.0.0` schema proposal
- PA-10.5 exact-version fail-closed dispatch contract

These do **not** implement a runtime `CanonicalTabResult 2.0.0` validator, runtime version dispatcher, migration engine, final selector, or public polyphonic writer/API.

### PA-11 status

The teacher-arrangement evaluation chain is merged through PA-11.4A. It includes exact teacher-review binding, fail-closed benchmark admission, semantic/source/physical replay, independent observed-output scoring, a gold-blind baseline, and the evaluation-only revoicing tone candidate model.

The genuine blind baseline measured 2/4 teacher-approved matches (50%). PA-11.4A expands evaluation-only revoicing tone candidates but does not compose/select complete production voicings and has no production authority.

## Learned fingering / GuitarSet boundary

Historical GuitarSet model v1 was scientifically valid for a candidate domain of frets 0..19. The engine PA-7 domain is 0..20, so the v1 controlled offline evidence correctly produced a domain-incomplete hold rather than truncating candidates or extrapolating silently.

A separately preregistered `GUITARSET-OBSERVED-VOICING-MODEL.v2` was trained/evaluated with candidate domain 0..20 while the observed positive-gold domain remains 0..19. The v2 research checkpoint completed preregistration, DEVELOPMENT, one-shot VALIDATION, one-shot UNTOUCHED_FINAL, retention review, and cross-repo shadow-integration review.

PR #136 merged an isolated Node v2 adapter with frozen Python↔Node feature/score/ranking parity and real PA-7 fret-20 candidate coverage. It does not add runtime wiring.

Scientific safety boundary:

- candidate domain: 0..20
- observed positive-gold domain: 0..19
- `fret20QualityAuthority=false`
- candidate mutation/filter/truncation: false
- live/user input: false
- runtime connection: false
- authoritative optimizer/canonical/TAB effect: false
- production: false

Next learned-model gate:

`GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`

This gate is fixture-only, controlled, diagnostic, and non-authoritative. It must measure v2 coverage/NO_SCORE, baseline agreement/disagreement, candidate preservation, failure isolation, privacy, and deterministic reproduction before any later runtime-shadow review.

## Compatibility and presentation

Latest PR #136 verification:

- Tests #764: PASS on Node.js 18/20/22
- MusicXML Compatibility #533: PASS
- alphaTab 1.8.4 MusicXML import: verified in CI
- alphaTab SVG render: verified in CI
- alphaTab browser renderer/cursor: verified in CI
- synth step remains diagnostic and is not production-playback proof
- MuseScore CI currently checks CLI availability only; semantic import/re-export/round-trip remains unverified
- production PDF renderer/viewer: not implemented
- application score/TAB viewer, persistence, export/share UI: not implemented

Renderers are downstream presentation adapters. They may not recalculate or replace deterministic TAB authority.

## Non-negotiable rules

1. Source MusicXML remains immutable source truth.
2. XML/semantic resource limits, deadlines, cancellation, and hostile-input fail-closed behavior remain mandatory.
3. `CanonicalTabResult 1.0.0` remains authoritative for the current public monophonic path.
4. PA-7 candidate order is enumeration, not preference.
5. PA-8 structural fingering is not universal ergonomic truth.
6. PA-9 `PLAYABLE_WITHIN_POLICY` is a fixed conservative policy verdict, not universal comfort/tempo/anatomy truth.
7. Teacher approval is evaluation evidence, not automatic training consent or production authority.
8. Fixed teacher benchmarks must remain separate from training data.
9. Learned models may score only existing validated candidates and may not fabricate notes or positions.
10. Historical sealed evidence is not recomputed or rewritten to fit later models.
11. A v2 runtime/public path requires separate implementation and review; documentation proposals do not create runtime authority.
12. Any future runtime-shadow connection, final selector, public polyphonic API, playback, PDF, or production release is separately gated.

## Source-of-truth order

When documents disagree, use:

1. merged source/tests/workflows/package metadata on `main`;
2. applicable versioned runtime contract modules;
3. exact versioned contract/closure/evidence documents;
4. `AI_CONTEXT.md`;
5. `docs/current-status.md`;
6. `docs/package-status.md`;
7. `docs/ARCHITECTURE.md` and this README;
8. older historical planning drafts.

Historical versioned PA contracts, closure records, and sealed v1 shadow evidence retain their original stage-specific statements. They are evidence, not a live status dashboard.

See `AI_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/current-status.md`, `docs/package-status.md`, `docs/polyphonic-guitar-arrangement-foundation.md`, and `docs/musicxml-compatibility.md` for the converged active architecture surfaces.
