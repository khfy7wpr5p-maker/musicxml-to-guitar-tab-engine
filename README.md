# MusicXML to Guitar TAB Engine

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-24 -->

A security-first deterministic MusicXML → playable six-string guitar TAB engine with separately gated internal polyphonic-arrangement and learned-fingering research paths.

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146. PA-12 internal end-to-end implementation: PR #150.

## Current authority boundary

The public package remains the deterministic monophonic engine. `CanonicalTabResult 1.0.0` is the only current public downstream TAB authority.

Current package metadata:

- version: `0.1.0`
- `private: true`
- license: `SEE LICENSE IN LICENSE`
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

The parser never chooses guitar strings/frets. Writers never rerun optimization. Unsupported public polyphonic structures remain fail-closed.

## Public package API

`src/index.js` exposes only the approved conversion, preflight, fretboard, error-detection and writer APIs. No PA, benchmark, teacher, GuitarSet, model, shadow adapter or runtime-shadow bridge is package-root exported.

## Internal polyphonic architecture

```text
Polyphonic / piano MusicXML
        ↓
XML Safety + ProcessingBudget
        ↓
ParsedMusicXmlDocument 1.0.0
        ↓
PA-1  PolyphonicSourceModel 1.0.0
        ↓
PA-2  bounded polyphonic projection
        ↓
PA-3  SimultaneousEventModel 1.0.0
        ↓
PA-4  GuitarArrangementPlan 1.0.0
        ↓
PA-5  DeterministicVoiceAnalysis 1.0.0
        ↓
PA-6  DeterministicReductionPlan 1.0.0
        ↓
PA-7  GuitarVoicingCandidateModel 1.0.0 (frets 0..20)
        ↓
authentic immutable single-generation PA-7 handoff
        ├─→ PA-8 LeftHandShapeModel 1.0.0
        │     ↓
        │   PA-9 PhysicalPlayabilityValidation 2.0.0
        │     ↓
        │   deterministic evaluation selection
        │
        └─→ detached deeply frozen read-copy
              ↓
            GuitarSet v2 runtime-shadow score/evidence only

PA-10 canonical-v2 design/compatibility: PA-10.0–PA-10.5 merged contracts
PA-11 teacher-approved evaluation: through PA-11.4A
internal deterministic final selector: implemented, non-ML and fail-closed
internal CanonicalTabResult 2.0.0 runtime/writer: implemented
PA-12 internal E2E: implemented, non-public
future PA-13 public polyphonic API: not implemented
```

The shadow branch is not the final selector and cannot feed score ordering back into deterministic selection.

## Learned fingering / GuitarSet boundary

Historical GuitarSet v1 remains bound to candidate frets 0..19. `GUITARSET-OBSERVED-VOICING-MODEL.v2` uses candidate domain 0..20 while observed positive-gold remains 0..19, therefore `fret20QualityAuthority=false`.

Controlled exact-main evidence remains sealed as `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Historical diagnostics include 4/4 candidate-bearing coverage, 153/153 candidate preservation, one zero-candidate NO_SCORE group, 1/4 baseline agreement, three disagreements, 48 fret-20 candidates, zero shadow errors and 10/10 deterministic reproduction.

## Runtime shadow connection

Current gate: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

Runtime shadow connection: internal default-off.

When an internal caller explicitly enables the reviewed bridge:

1. deterministic PA-7 candidates are generated exactly once;
2. PA-8/PA-9 and deterministic selection consume that authentic handoff;
3. learned scoring receives only a detached, deeply frozen read-copy of the same PA-7 candidate identity/order/position facts;
4. the existing sealed v2 adapter scores candidates for diagnostic evidence;
5. scoring/model/artifact failures are isolated and cannot replace the deterministic result.

Authority boundary:

- live/user input: false
- candidate generation/mutation/filter/deletion by learned code: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation: false
- refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- public package-root exposure: false

The retained model and parity adapter keep their own historical `runtime_connection_authorized=false` / `shadow_execution_authorized=false` fields. PR #146 adds an engine-side reviewed seam; it does not rewrite the sealed model artifact or grant learned decision authority.

## Compatibility and presentation

PR #146 passed the protected Node.js 18/20/22, alphaTab import/SVG, browser renderer/cursor, synth diagnostic and MuseScore CLI-availability matrix before it was merged. Every later change must independently pass the applicable protected matrix on its own exact head; PR #165 adds the UI-07 Node and real-Chromium gates.

The Guitar TAB Workbench is implemented as a browser/controller layer with guarded MONO_V1 and POLY_V2 host seams. It keeps source bytes immutable, binds edits to the exact source SHA and cumulative bounded commands, and reloads only fully regenerated notation+TAB MusicXML. UI-07 in PR #165 adds fail-closed same-pitch POLY_V2 selection through renderer voice, per-voice onset, chord fingerprint and duplicate-ordinal evidence without changing runtime contract `1.0.0` or enabling retained ties.

The GitHub Pages build is a fixed-fixture, read-only preview with no runtime upload/edit authority. MuseScore semantic round-trip, production PDF, hosted persistence and release operations remain unverified or unimplemented.

## Non-negotiable rules

1. Source MusicXML remains immutable source truth.
2. XML/semantic resource limits, deadlines, cancellation and hostile-input fail-closed behavior remain mandatory.
3. `CanonicalTabResult 1.0.0` remains authoritative for the current public monophonic path.
4. PA-7 candidate order is enumeration, not preference.
5. PA-8 structural fingering is not universal ergonomic truth.
6. PA-9 `PLAYABLE_WITHIN_POLICY` is a bounded policy verdict, not universal comfort/tempo/anatomy truth.
7. Teacher approval is evaluation evidence, not automatic training consent or production authority.
8. Fixed teacher benchmarks remain separate from training data.
9. Learned models may score only existing validated candidates and may not fabricate, delete, filter or mutate notes/positions.
10. Historical sealed evidence is not recomputed or rewritten to fit later models.
11. Internal `CanonicalTabResult 2.0.0` runtime and PA-12 do not create package-root/public authority.
12. Runtime shadow connection does not authorize final selection.
13. Live/user-input shadow activation, learned decision authority, public polyphonic API, playback, PDF and production release are separately gated.

## Licensing

First-party software is available under the PolyForm Noncommercial License 1.0.0. Commercial use requires a separate signed agreement; see `COMMERCIAL-LICENSE.md`. Model/data/contributor and third-party boundaries remain documented in the repository licensing files.
