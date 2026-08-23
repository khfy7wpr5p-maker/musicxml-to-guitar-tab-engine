# TAB MusicXML Compatibility Validation

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

This document records the current compatibility boundary for MusicXML emitted by the public `CanonicalTabResult 1.0.0` writer. Compatibility tools are downstream observers and never gain fingering, candidate, optimizer, canonical or production authority.

## Latest verified evidence

PR #136 exact-head verification:

- Tests #764: **PASS** on Node.js 18 / 20 / 22;
- MusicXML Compatibility #533: **PASS**;
- alphaTab 1.8.4 MusicXML import: **PASS**;
- alphaTab SVG render: **PASS**;
- alphaTab browser renderer/cursor on Node.js 22: **PASS**.

The compatibility workflow itself runs the complete repository suite before the renderer checks, so PR #136's frozen GuitarSet v2 parity/isolation tests were included in that passing repository state. PR #136 does not alter public writer semantics.

## Current verdict

**Strong alphaTab import/render/cursor compatibility evidence; production playback, MuseScore semantic round-trip and PDF remain open.**

Verified:

- deterministic public TAB MusicXML writer contract;
- well-formed MusicXML output for the supported public scope;
- alphaTab import and SVG rendering on Node.js 18/20/22;
- browser rendering and bar/beat cursor behavior in headless Chrome;
- standard notation + six-line TAB compatibility fixture;
- double-digit fret rendering, ties, beams and selected-position fidelity;
- public writer output remains independent of alternative unselected candidates.

Not established:

- production alphaTab synth/player readiness;
- real MuseScore Studio semantic import/re-export/round-trip;
- MuseScore PDF export;
- production PDF adapter/viewer;
- production score/TAB application viewer;
- application persistence/export/share.

## Workflow semantics

`.github/workflows/musicxml-compatibility.yml` uses a pinned compatibility environment.

For Node.js 18/20/22 it:

1. installs project dependencies with scripts disabled;
2. runs the complete `npm test` suite;
3. installs pinned alphaTab `1.8.4` without changing the repository;
4. runs the alphaTab MusicXML importer smoke test;
5. runs the alphaTab SVG renderer smoke test.

On Node.js 22, a separate browser job:

1. finds an existing Chrome/Chromium executable;
2. runs the validated alphaTab browser renderer/cursor test;
3. runs the synth diagnostic;
4. uploads the renderer screenshot artifact.

The synth diagnostic is configured `continue-on-error: true`. Therefore a successful `MusicXML Compatibility` workflow is **not** proof of production synth/player readiness.

The MuseScore job only checks whether a MuseScore CLI command is preinstalled. When it is absent, the job exits successfully without running import, re-export, semantic round-trip or PDF tests. Workflow success must not be described as MuseScore semantic compatibility evidence.

## Public authority boundary

```text
CanonicalTabResult 1.0.0
        ↓
TAB MusicXML writer
        ↓
┌───────────────────────┬────────────────────────┐
│ alphaTab compatibility│ future MuseScore adapter│
└───────────────────────┴────────────────────────┘
```

Neither renderer may recalculate, replace or correct engine fingering. A renderer failure cannot mutate a valid canonical result.

## Relationship to the current internal architecture

The repository now also contains merged internal PA-8 `LeftHandShapeModel 1.0.0`, PA-9 `PhysicalPlayabilityValidation 2.0.0`, PA-10.5 canonical-v2 dispatch design, and PA-11.4A evaluation-only revoicing candidates. None is package-root public and none changes the public writer contract.

The isolated `GUITARSET-OBSERVED-VOICING-MODEL.v2` adapter has completed Python↔Node parity and exact-main controlled-offline evidence. Candidate domain 0..20 matches PA-7, but observed positive GuitarSet gold remains 0..19, so `fret20QualityAuthority=false`.

Evidence status: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`; immutable artifact `evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`, byte SHA-256 `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba`.

Current learned authority remains:

- controlled repository-fixture execution: complete
- live/user input: false
- runtime connection: false
- authoritative optimizer/canonical/TAB effect: false
- production: false

Next human/consequential gate: `RUNTIME_SHADOW_CONNECTION_REVIEW`.

## Compatibility fixtures

The repository keeps deterministic fixtures for single-note and multi-measure TAB MusicXML behavior. Coverage includes standard notation and TAB staves, six-string tuning, pickup/measure behavior, supported rhythm values, dots, ties, beams, accidentals, rests, open strings and double-digit frets.

Alternative valid guitar positions are deliberately present in compatibility data so tests can prove that only the already-selected canonical position reaches writer output.

## Safety conclusion

No compatibility evidence currently identifies a public TAB MusicXML writer defect. The remaining renderer/product gaps are downstream productization work and must not be used to weaken the deterministic core or to infer runtime authority for internal PA/learning components.
