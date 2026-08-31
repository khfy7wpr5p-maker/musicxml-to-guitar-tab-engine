# Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

This is the live architecture contract for the repository. Historical PA/PS closure records and corpus audits remain evidence, but they do not define current production behavior when they conflict with this document and [`current-status.md`](current-status.md).

## 1. Authority boundaries

The repository has two deliberately different exposure boundaries:

- **package root:** the narrow public monophonic API exposed by `src/index.js`, with `CanonicalTabResult 1.0.0` as package-root TAB authority;
- **application/internal polyphonic runtime:** the bounded POLY_V2 path that can reach `CanonicalTabResult 2.0.0`, sustained selection, and the v2 MusicXML writer without making those PA/PS functions package-root exports.

A renderer is never semantic authority. Writers consume already-selected canonical truth and may not recalculate fingering or solver decisions.

The application score-state contract is also independent from route: `PASS`,
`REVIEW_REQUIRED`, and `BLOCKED` describe processing/review eligibility, while
`MONO_V1`, `POLY_V2`, and `UNRESOLVED` describe dispatch. See
[`reviewable-score-state-contract.md`](reviewable-score-state-contract.md).

## 2. Production pipeline

```text
MusicXML Input
    ↓
XML Safety / Parser
    ↓
Representation Compatibility Normalizers
    ↓
Polyphonic Source Model
    ↓
Temporal / Tie / Sustain Graph
    ↓
Simultaneous / Active Sonority Model
    ↓
Guitar Position Candidates
    ↓
PA-8 Left-Hand Physical Enumeration
    ↓
Sustained Path Solver
    ↓
Canonical Final Selection
    ↓
Canonical TAB Result
    ↓
MusicXML / TAB Writer
```

Representative implementation boundaries:

- parser/safety: `src/parser/parsedMusicXmlDocument.js`, `src/core/processingRuntime.js`;
- representation compatibility: `src/app/runtimeGuitarNotationNormalizer.js`, `src/parser/polyphonicTripletDisplayNormalizer.js`, `src/app/exactTabStaffMirrorNormalizer.js`, `src/parser/polyphonicGraceOrnamentExtractor.js`;
- source model: `src/parser/polyphonicMusicXmlProjector.js`, `src/music/polyphonicSourceModel.js`;
- tie/sustain: `src/music/sustainTieGraph.js`, `src/music/activeSonorityModel.js`;
- sustained physical state: `src/music/sustainedGuitarPositionStateModel.js`, `src/music/sustainedLeftHandPhysicalStateModel.js`;
- sustained selection: `src/music/sustainedCanonicalFinalSelector.js`;
- canonical bridge/result: `src/tab/canonicalTabResultV2.js`;
- writer: `src/writers/canonicalTabMusicXmlWriterV2.js`.

`src/core/internalPolyphonicConversionPipelineV2.js` is the bounded raw-MusicXML → source model → canonical-v2 → writer integration seam. It reuses one `ProcessingRuntime` across the pipeline.

## 3. Cross-cutting invariants

Every stage is constrained by the following invariants:

- immutable source bytes and immutable source musical facts;
- deterministic output for identical input/options;
- bounded work and fixed resource ceilings;
- fail-closed unsupported or ambiguous semantics;
- no semantic guessing;
- processing deadline and cancellation checkpoints;
- deep immutability of authoritative model snapshots;
- package-root API boundary remains explicit;
- candidate enumeration order is not preference ranking;
- compatibility changes may not silently alter physical policy, solver cost/ranking, or tie-breaks.

The engine does **not** silently invent or rewrite:

- pitch or octave;
- onset or duration;
- voice or staff;
- tie facts;
- chord relationship;
- source pitch transformation;
- automatic octave shift, except the separately contracted internal POLY_V2 exact `+12` lower-register arrangement decision;
- implicit voice split;
- ambiguous sustain continuation;
- solver ranking override.

If semantic evidence is insufficient, the path fails closed. Ambiguity is a valid result state rather than permission to guess.

## 4. Representation compatibility layer

Compatibility normalization is a constrained representation layer, not a corpus-specific exception mechanism.

Every production compatibility rule must be:

- independent of filename;
- independent of source SHA;
- driven by exact MusicXML shape/semantics;
- bounded;
- deterministic;
- fail-closed outside the proven shape;
- source-immutable.

Current exact compatibility includes:

1. **Guitar Pro grace compatibility.** The grace extractor accepts the reviewed exact slashed grace profile. Nominal type is preserved as metadata; it does not create numeric performance timing.
2. **Exact `32nd` grace nominal type.** `src/parser/polyphonicGraceOrnamentExtractor.js` admits only exact attribute-free `eighth` or `32nd` nominal types. Unsupported/malformed values remain `UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT`.
3. **Bracketed triplet display.** `src/parser/polyphonicTripletDisplayNormalizer.js` admits the exact Guitar Pro `placement="below" number="1" bracket="yes" type="start|stop"` display profile only when the same note already has validated 3:2 time-modification provenance. Display normalization never changes timing ratio.
4. **Exact TAB mirror collapse.** `src/app/exactTabStaffMirrorNormalizer.js` first proves that staff 2 is TAB from the original MusicXML, then compares normalized staff-1/staff-2 musical facts. Collapse occurs only on exact semantic equality; representation-only TAB technical metadata is not promoted to source musical truth.
5. **Closed sustain representation compatibility.** PS-2 can reconnect only the exact contiguous same-identity closed-stop form documented below.

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

## 5. Sustain / tie architecture

### PS-2 — Sustain Tie Graph

`src/music/sustainTieGraph.js`, contract version `1.2.0`, derives facts-only chains from the source model. Identity is exact `(staff, voice, MIDI pitch, written pitch)`. Ordinary source tie facts are preserved.

For the bounded Guitar Pro closed-stop representation, a new `tieStop` may continue the last closed chain only when:

- the previous segment ended with `tieStop` and not `tieStart`;
- current and previous identities match exactly;
- the segments are temporally contiguous under the ordinary same/cross-measure rule.

The graph does not synthesize `tieStart`, pitch, voice, staff, or timing. A true unmatched stop remains fail-closed as `INVALID_SUSTAIN_TIE_GRAPH` with reason `ORPHAN_TIE_STOP`. Non-contiguous continuation, ambiguous starts, and unterminated chains also remain fail-closed.

### PS-3 — Logical sustain continuity

Downstream continuity follows the sealed PS-2 chain order, not a guessed raw-flag interpretation. Every non-final chain segment keeps the same logical note active until its successor; the final segment releases it.

### PS-4A — Active sonority

Active-sonority state carries attacks, holds, and releases to later sonority points. A sustained note therefore occupies later time points without being re-attacked.

### PS-4C / PA-8 — Sustained left-hand physical enumeration

PS-4C reuses the PA-8 static left-hand enumerator and PA-9 physical validation over each PS-4A sonority point. The fixed PA-8 numerical ceilings are unchanged:

- `MAX_LEFT_HAND_SHAPE_CANDIDATES = 20_000`;
- `MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS = 100_000`.

The authoritative constants are in `src/music/leftHandShapeModel.js`; the sustained reuse and scope reset are in `src/music/sustainedLeftHandPhysicalStateModel.js`.

The enforcement window is **not whole-score aggregate**. In the ordinary PA-8 path it is one independently processed PA-7 source group. In the sustained path it is exactly one PS-4A sonority point across that point's ordered position states. Aggregate counters may be retained for reporting, but an earlier group cannot consume a later group's fixed enforcement budget.

The ceilings are not raised to make corpus data pass. Candidate order, physical rules, solver ranking/cost, and tie-break behavior remain unchanged.

### PA-12 — Sustained canonical final selection

`src/tab/canonicalTabResultV2.js` first attempts the ordinary deterministic polyphonic selector. Only the specifically recognized retained-sustain/tie unsupported reasons route to `src/music/sustainedCanonicalFinalSelector.js`.

The sustained selector requires exact preserved projection and does not authorize octave shifts, pitch rewrites, voice splitting, or ranking override.

## 6. Same-voice chord versus invalid overlap

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE**

An exact MusicXML `<chord/>` member in the same validated staff/voice lane belongs to the preceding attack group. It is not a second independent advancing voice event.

The source-lane occupancy cursor is nevertheless extended to the **maximum end time of every chord member**. Therefore:

- equal-duration chord members remain one attack group;
- an unequal-duration member may keep the lane occupied beyond the anchor note;
- a later independent non-chord note beginning before that maximum end is rejected as `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` with reason `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`;
- no implicit voice split is invented to make the overlap fit.

This distinction is implemented in `src/music/sustainedCanonicalFinalSelector.js` and covered by the PA-12/sustained chord regressions.

## 7. Real corpus / production gate

Real Guitar Pro corpus material is an evidence and regression layer. It does not create corpus-specific runtime branches.

A production corpus gate is expected to verify:

- exact source SHA identity for the intended evidence file;
- source bytes unchanged before/after runtime calls;
- deterministic public result;
- deterministic canonical result when produced;
- deterministic MusicXML output when produced;
- no hidden semantic mutation;
- expected fail-closed behavior for unsupported notation;
- required CI green.

A corpus run may expose the next blocker after a compatibility fix. That observation is evidence for a generic contract review; it is not permission to branch on that filename or SHA.

Current exact Air evidence established POLY_V2 PASS, deterministic canonical/MusicXML fingerprints, and source-byte immutability before the latest chord-occupancy hardening. The latest hardening is a no-op for the exact Air chord set because the source audit found no unequal-duration chord member; protected checks remained green.

## 8. Historical documents

Versioned PA/PS closure files, feature-stage documents, and corpus audits are retained as historical evidence. A document that reports an older branch SHA or older first blocker must be read as an observation at that revision, not as current status. Stale corpus-status documents are explicitly marked `HISTORY / SUPERSEDED` where their headline state can otherwise be mistaken for the live system.

For current state use [`current-status.md`](current-status.md).
