# AI Context — Read This First

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-01 -->

This is the active read-first context for coding agents and reviewers. Historical versioned contracts, closure records, corpus audits, PR numbers, commit SHAs, and sealed scientific evidence remain historical records; they are not current architecture authority merely because they are retained in the repository.

## Source-of-truth order

When sources disagree:

1. merged source/tests/workflows/package metadata on protected `main`;
2. applicable runtime contract modules and exact error/limit constants;
3. live architecture documents dated 2026-09-01 or later;
4. exact versioned contract/closure/evidence documents for the revision they describe;
5. older historical/planning drafts.

`docs/DATA-CONTRACT.md` is a deprecated historical draft and is not current runtime authority.

## Executable authority

Current package metadata:

- version `0.1.0`;
- `private: true`;
- license `SEE LICENSE IN LICENSE`;
- Node.js >=18.

The package root remains deliberately narrow and deterministic:

```text
MusicXML → XML safety / ProcessingRuntime
→ supported monophonic semantic projection
→ CanonicalMusicDocument
→ physical candidates
→ deterministic cost + DP optimizer
→ CanonicalTabResult 1.0.0 / bounded Standard-tuning capo extension 1.1.0
→ canonical validator
→ JSON / ASCII TAB / TAB MusicXML
```

`CanonicalTabResult 1.0.0` remains the ordinary public package-root TAB authority. An explicit nonzero Standard-tuned source capo may use the compatible `CanonicalTabResult 1.1.0` extension. No PA/PS stage, teacher benchmark, learned model, GuitarSet adapter, runtime-shadow bridge, or internal POLY_V2 conversion pipeline is exported from `src/index.js`.

The application/internal polyphonic path is broader:

```text
MusicXML
→ XML safety / bounded parser
→ source guitar configuration provenance / authority
→ representation compatibility normalizers
→ PolyphonicSourceModel
→ temporal / tie / sustain graph
→ active sonority
→ guitar position candidates using resolved configuration
→ PA-8 / PA-9 physical states
→ sustained path solver when required
→ deterministic canonical final selection
→ CanonicalTabResult 2.0.0 / 2.1.0
→ internal/application MusicXML writer
```

Fully validated explicit six-string tuning/capo evidence may become bounded application-side guitar configuration. This does not widen the package-root API. Genuine configuration changes after immutable solve scope begins remain fail-closed.

The two authority boundaries must not be conflated.

## Current PA / PS state

- PA-1 `PolyphonicSourceModel 1.0.0`: ✅ internal
- PA-2 bounded projection: ✅ internal
- PA-3 `SimultaneousEventModel 1.0.0`: ✅ internal
- PA-4 `GuitarArrangementPlan 1.0.0`: ✅ internal
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: ✅ internal
- PA-6 `DeterministicReductionPlan 1.0.0`: ✅ internal
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: ✅ internal
- PA-8 `LeftHandShapeModel 1.0.0`: ✅ internal; fixed ceilings 20,000 shapes / 100,000 assignment attempts per independently processed group
- PA-9 `PhysicalPlayabilityValidation 2.0.0`: ✅ internal
- PA-10.0–PA-10.5 canonical-v2 compatibility/design: ✅ merged
- PA-11 evaluation chain through PA-11.4A: ✅ merged
- PA-12 internal polyphonic E2E: ✅ implemented / non-package-root
- PS-2 `SustainTieGraph 1.2.0`: ✅ active
- PS-3 logical sustain continuity: ✅ active
- PS-4A active sonority: ✅ active
- PS-4C sustained PA-8/PA-9 physical enumeration: ✅ active
- sustained canonical final selection: ✅ active for the exact recognized fallback boundary
- internal configuration-aware `CanonicalTabResult 2.1.0`: ✅ active where admitted
- PA-13 public polyphonic API: 🔒 not implemented

The sustained PA-8 enforcement window is per PS-4A sonority point, not a whole-score aggregate budget. Fixed ceilings and enumeration/ranking rules are unchanged.

## Stage 03 source guitar configuration boundary

`src/parser/musicXmlGuitarConfigurationProvenance.js` extracts explicit source tuning/capo evidence. A complete executable tuning requires exactly six `staff-tuning` lines, valid scalar pitch facts, physically consistent six-string ordering, at most one capo, and successful immutable configuration construction.

The first executable configuration must be established before immutable solve scope begins. Current provenance records `afterSolveStart` when the declaration appears after measure index 0 or after a `note`, `backup`, or `forward` has already occurred earlier in measure 0. A genuine later tuning/capo change remains fail-closed as `UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE`.

A capo-only restatement may inherit only a prior complete configuration on the same part/staff. Identical later declarations are restatements rather than new authority.

Historical producer TAB presentation metadata is not executable tuning authority. The legacy fallback is allowed only for the exact reviewed partial or physically reversed complete TAB presentation shape, at the exact parser-error location in measure 0, on the matching TAB staff/clef, before any earlier `note`/`backup`/`forward`, with exactly one compatible presentation block and no executable capo/configuration conflict. When admitted it falls back to `STANDARD_DEFAULT` with `TAB_PRESENTATION_PROVENANCE_ONLY`. A lone legacy declaration after solve start remains fail-closed.

See `docs/stage-03-source-guitar-configuration-closeout.md`.

## MusicXML compatibility boundary

Production compatibility rules are generic representation contracts. They are filename-independent, SHA-independent, bounded, deterministic, fail-closed, and source-immutable.

Current exact compatibility includes:

- exact legacy TAB presentation-only tuning fallback described above;
- reviewed Guitar Pro grace representation;
- exact attribute-free grace nominal types `eighth` and `32nd`;
- exact Guitar Pro bracketed-below 3:2 triplet display backed by validated time-modification semantics;
- exact normalized notation/TAB staff mirror collapse after original staff-2 TAB evidence and semantic equality are proven;
- exact contiguous closed sustain-stop continuation under PS-2 v1.2.0.

Valid explicit custom tuning/capo evidence is never downgraded through legacy presentation compatibility.

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

## Sustain / tie / same-voice rule

A true orphan tie stop still fails closed as `INVALID_SUSTAIN_TIE_GRAPH` / `ORPHAN_TIE_STOP`. Representation compatibility does not synthesize a source `tieStart` or alter pitch, timing, voice, or staff.

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE.**

Exact same-voice MusicXML `<chord/>` members form one attack group. Lane occupancy extends to the maximum end of all chord members. A later independent non-chord attack before that maximum end remains fail-closed as `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` / `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`; no implicit voice split is invented.

## GuitarSet v2 / runtime-shadow state

Retained model identity: `GUITARSET-OBSERVED-VOICING-MODEL.v2`.

Controlled offline status: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`.

Historical sealed evidence remains at:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Observed positive GuitarSet gold remains frets 0..19 while the PA-7 candidate domain is 0..20, therefore `fret20QualityAuthority=false`.

Current reviewed runtime-shadow gate: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

Authority boundary:

- runtime shadow connection: internal default-off
- live/user input: false
- candidate generation/mutation/filter/deletion by learned code: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation/refit/retraining: false
- `fret20QualityAuthority=false`
- production: false

The shadow adapter receives only a detached, deeply frozen read-copy of an authentic single-generation PA-7 snapshot. It may produce diagnostic evidence only and cannot replace deterministic selection.

## Non-negotiable rules

1. Source MusicXML bytes and source musical facts are immutable source truth.
2. Parsing/normalization does not choose strings/frets; writers do not rerun optimization or selection.
3. Compatibility normalization removes or interprets only proven representation differences and never guesses missing semantics.
4. Source guitar configuration is explicit authority; compatibility code cannot silently invent, rewrite, or downgrade genuine tuning/capo evidence.
5. Physical validation precedes learned scoring; learned/shadow output is non-authoritative.
6. Candidate order is enumeration, not preference; compatibility changes cannot alter physical rules, solver ranking/cost, or tie-breaks.
7. Fixed processing/resource limits are not raised as corpus-specific fixes.
8. Deadline/cancellation and deep-immutability boundaries remain active.
9. Ambiguous/unsupported semantics are valid fail-closed outcomes.
10. Public monophonic rejection rules may not be weakened merely to expose internal polyphony.
11. Internal `CanonicalTabResult 2.0.0` / `2.1.0` and PA-12 do not create package-root/public v2 authority.
12. Runtime shadow connection does not imply final-selection authority.
13. Renderer output is presentation evidence, not semantic authority.
14. Real corpus is regression/evidence material only; filename/SHA dispatch is forbidden.
15. Production playback/PDF, broader public polyphony, and learned decision authority remain separate consequential gates unless independently verified.

For detailed live contracts read `docs/ARCHITECTURE.md`, `docs/current-status.md`, `docs/musicxml-compatibility.md`, `docs/stage-03-source-guitar-configuration-closeout.md`, `docs/ps-sustain-tie-graph-contract.md`, `docs/pa-8-left-hand-shape-contract.md`, and `docs/pa-12-internal-polyphonic-e2e.md`.
