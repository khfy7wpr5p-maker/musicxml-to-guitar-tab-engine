# Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-01 -->

This is the live architecture contract for the repository. Historical PA/PS closure records and corpus audits remain evidence, but they do not define current production behavior when they conflict with this document and [`current-status.md`](current-status.md).

## 1. Authority boundaries

The repository has two deliberately different exposure boundaries:

- **package root:** the narrow public monophonic API exposed by `src/index.js`, with `CanonicalTabResult 1.0.0` as package-root TAB authority plus the bounded Standard-tuning capo extension;
- **application/internal polyphonic runtime:** the bounded POLY_V2 path that can reach configuration-aware conversion, `CanonicalTabResult 2.0.0` / `2.1.0`, sustained selection and the v2 MusicXML writer without making those PA/PS functions package-root exports.

A renderer is never semantic authority. Writers consume already-selected canonical truth and may not recalculate fingering or solver decisions.

The application score-state contract is also independent from route: `PASS`, `REVIEW_REQUIRED`, and `BLOCKED` describe processing/review eligibility, while `MONO_V1`, `POLY_V2`, and `UNRESOLVED` describe dispatch. See [`reviewable-score-state-contract.md`](reviewable-score-state-contract.md). The early routing rules are defined in [`poly-v2-routing-contract.md`](poly-v2-routing-contract.md).

## 2. Production pipeline

```text
MusicXML Input
    ↓
XML Safety / Parser
    ↓
Source Guitar Configuration Provenance / Authority
    ↓
Representation Compatibility Normalizers
    ↓
Polyphonic Source Model
    ↓
Temporal / Tie / Sustain Graph
    ↓
Simultaneous / Active Sonority Model
    ↓
Guitar Position Candidates using resolved configuration
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
- guitar configuration provenance: `src/parser/musicXmlGuitarConfigurationProvenance.js`, `src/app/musicXmlUploadRuntime.js`;
- representation compatibility: `src/app/runtimeGuitarNotationNormalizer.js`, `src/parser/polyphonicTripletDisplayNormalizer.js`, `src/app/exactTabStaffMirrorNormalizer.js`, `src/parser/polyphonicGraceOrnamentExtractor.js`;
- source model: `src/parser/polyphonicMusicXmlProjector.js`, `src/music/polyphonicSourceModel.js`;
- tie/sustain: `src/music/sustainTieGraph.js`, `src/music/activeSonorityModel.js`;
- sustained physical state: `src/music/sustainedGuitarPositionStateModel.js`, `src/music/sustainedLeftHandPhysicalStateModel.js`;
- sustained selection: `src/music/sustainedCanonicalFinalSelector.js`;
- canonical bridge/result: `src/tab/canonicalTabResultV2.js`;
- writer: `src/writers/canonicalTabMusicXmlWriterV2.js`.

`src/core/internalPolyphonicConversionPipelineV2.js` is the bounded raw-MusicXML → source model → canonical-v2 → writer integration seam. It reuses one `ProcessingRuntime` across the pipeline and receives only already-resolved immutable guitar configuration options from an owning caller.

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
- compatibility changes may not silently alter guitar configuration, physical policy, solver cost/ranking, or tie-breaks.

The engine does **not** silently invent or rewrite:

- pitch or octave;
- onset or duration;
- voice or staff;
- tie facts;
- chord relationship;
- executable source tuning/capo configuration;
- source pitch transformation;
- automatic octave shift, except the separately contracted internal POLY_V2 exact `+12` lower-register arrangement decision;
- implicit voice split;
- ambiguous sustain continuation;
- solver ranking override.

If semantic evidence is insufficient, the path fails closed. Ambiguity is a valid result state rather than permission to guess.

## 4. Source guitar configuration authority

`src/parser/musicXmlGuitarConfigurationProvenance.js` extracts explicit MusicXML source guitar configuration evidence. This is configuration provenance, not source TAB fingering authority.

A complete executable tuning declaration requires:

- exactly six `staff-tuning` elements;
- lines 1..6 present exactly once;
- validated step, optional alter and octave scalar values;
- six-string physical ordering within the fixed adjacent-open-string interval bound;
- at most one capo;
- successful construction of an immutable guitar configuration.

The application upload runtime may thread this validated configuration through the bounded internal conversion path. Package-root exposure is not expanded by this admission.

### Immutable solve scope

The first executable configuration must be established before immutable solve scope begins. Current provenance extraction records `afterSolveStart` when either:

- the declaration occurs after measure index 0; or
- a `note`, `backup`, or `forward` has already been encountered earlier in measure 0.

If the first configuration is already after solve start, the score fails closed. Multiple declarations are permitted only when they resolve to one identical configuration fingerprint. A genuine later tuning/capo change fails closed as `UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE`.

A capo-only declaration is allowed only with a previously complete configuration on the same part/staff. It inherits that exact tuning and creates a new configuration using the explicit capo; if this changes the effective configuration after solve start, it is rejected as a genuine configuration change.

### Legacy TAB presentation-only boundary

Some historical producer exports encode `staff-tuning` as TAB presentation provenance. This metadata must not be promoted to executable tuning authority merely because it is present.

`src/app/musicXmlUploadRuntime.js` contains one bounded fallback for exact reviewed parser-error shapes:

- a well-formed partial legacy TAB tuning with no capo; or
- a well-formed complete tuning whose TAB-line order is the reviewed physically reversed presentation order.

The fallback requires the exact parser error location in measure 0, matching TAB staff/clef, the exact admitted legacy shape, no earlier `note`/`backup`/`forward`, exactly one compatible presentation block in the entire document, and no conflicting executable configuration/capo authority.

When admitted, authority is `STANDARD_DEFAULT` and `sourceStatus` is `TAB_PRESENTATION_PROVENANCE_ONLY`. The legacy block remains non-executable presentation evidence.

A lone legacy declaration after solve start remains fail-closed. PR #303 added this exact scope guard after the P1 review on PR #299. See [`stage-03-source-guitar-configuration-closeout.md`](stage-03-source-guitar-configuration-closeout.md).

## 5. Representation compatibility layer

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

1. **Legacy TAB presentation tuning compatibility.** Only the bounded non-executable pre-solve shapes described above may fall back to Standard. Valid explicit custom tuning/capo evidence is never downgraded through this compatibility path.
2. **Guitar Pro grace compatibility.** The grace extractor accepts the reviewed exact slashed grace profile. Nominal type is preserved as metadata; it does not create numeric performance timing.
3. **Exact `32nd` grace nominal type.** `src/parser/polyphonicGraceOrnamentExtractor.js` admits only exact attribute-free `eighth` or `32nd` nominal types. Unsupported/malformed values remain `UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT`.
4. **Bracketed triplet display.** `src/parser/polyphonicTripletDisplayNormalizer.js` admits the exact Guitar Pro `placement="below" number="1" bracket="yes" type="start|stop"` display profile only when the same note already has validated 3:2 time-modification provenance. Display normalization never changes timing ratio.
5. **Exact TAB mirror collapse.** `src/app/exactTabStaffMirrorNormalizer.js` first proves that staff 2 is TAB from the original MusicXML, then compares normalized staff-1/staff-2 musical facts. Collapse occurs only on exact semantic equality; representation-only TAB technical metadata is not promoted to source musical truth.
6. **Closed sustain representation compatibility.** PS-2 can reconnect only the exact contiguous same-identity closed-stop form documented below.
7. **Deterministic technique provenance pairing.** Verified hammer-on and slide START/STOP pairs may receive source-tree-identity metadata only. They do not create physical technique authority; ambiguous reused-number chains remain unpaired. See [`PROD_TECH_03_HAMMER_ON_PAIRING.md`](PROD_TECH_03_HAMMER_ON_PAIRING.md) and [`PROD_TECH_04_SLIDE_PAIRING.md`](PROD_TECH_04_SLIDE_PAIRING.md).

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

## 6. Sustain / tie architecture

### PS-2 — Sustain Tie Graph

`src/music/sustainTieGraph.js`, contract version `1.2.0`, derives facts-only chains from the source model. Identity is exact `(staff, voice, MIDI pitch, written pitch)`. Ordinary source tie facts are preserved.

For the bounded Guitar Pro closed-stop representation, a new `tieStop` may continue the last closed chain only when:

- the previous segment ended with `tieStop` and not `tieStart`;
- current and previous identities match exactly;
- the segments are temporally contiguous under the ordinary same/cross-measure rule.

The graph does not synthesize `tieStart`, pitch, voice, staff or timing. A true unmatched stop remains fail-closed as `INVALID_SUSTAIN_TIE_GRAPH` with reason `ORPHAN_TIE_STOP`. Non-contiguous continuation, ambiguous starts and unterminated chains also remain fail-closed.

### PS-3 — Logical sustain continuity

Downstream continuity follows the sealed PS-2 chain order, not a guessed raw-flag interpretation. Every non-final chain segment keeps the same logical note active until its successor; the final segment releases it.

### PS-4A — Active sonority

Active-sonority state carries attacks, holds and releases to later sonority points. A sustained note therefore occupies later time points without being re-attacked.

### PS-4C / PA-8 — Sustained left-hand physical enumeration

PS-4C reuses the PA-8 static left-hand enumerator and PA-9 physical validation over each PS-4A sonority point. The fixed PA-8 numerical ceilings are unchanged:

- `MAX_LEFT_HAND_SHAPE_CANDIDATES = 20_000`;
- `MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS = 100_000`.

The enforcement window is **not whole-score aggregate**. In the ordinary PA-8 path it is one independently processed PA-7 source group. In the sustained path it is exactly one PS-4A sonority point across that point's ordered position states. Aggregate counters may be retained for reporting, but an earlier group cannot consume a later group's fixed enforcement budget.

The ceilings are not raised to make corpus data pass. Candidate order, physical rules, solver ranking/cost and tie-break behavior remain unchanged.

### PA-12 — Sustained canonical final selection

`src/tab/canonicalTabResultV2.js` first attempts the ordinary deterministic polyphonic selector. Only the specifically recognized retained-sustain/tie unsupported reasons route to `src/music/sustainedCanonicalFinalSelector.js`.

The sustained selector requires exact preserved projection and does not authorize arbitrary octave shifts, pitch rewrites, voice splitting or ranking override. Configuration-derived arrangement register/fretboard facts are supplied through the owning bounded pipeline rather than reconstructed from presentation metadata.

## 7. Same-voice chord versus invalid overlap

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE**

An exact MusicXML `<chord/>` member in the same validated staff/voice lane belongs to the preceding attack group. It is not a second independent advancing voice event.

The source-lane occupancy cursor is nevertheless extended to the **maximum end time of every chord member**. Therefore:

- equal-duration chord members remain one attack group;
- an unequal-duration member may keep the lane occupied beyond the anchor note;
- a later independent non-chord note beginning before that maximum end is rejected as `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` with reason `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`;
- no implicit voice split is invented to make the overlap fit.

## 8. Real corpus / production gate

Real producer corpus material is an evidence and regression layer. It does not create corpus-specific runtime branches.

A production corpus gate is expected to verify:

- exact source SHA identity for the intended evidence file;
- source bytes unchanged before/after runtime calls;
- deterministic public result;
- deterministic canonical result when produced;
- deterministic MusicXML output when produced;
- no hidden semantic mutation;
- expected fail-closed behavior for unsupported notation;
- required CI green.

The repository currently has more than one evidence set. `verification/guitar-tech-real-corpus-manifest.json` pins the historical Guitar Pro corpus. Stage 03 additionally used a separate exact nine-file SHA-selected AnimeTAB audit pinned to source commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a`. That audit verified 9/9 identity, determinism and source immutability and `PRESERVED_CLASSIFICATIONS=9/9` from pre-fix main to the audited candidate. These evidence sets must not be silently substituted for one another.

A corpus run may expose the next blocker after a compatibility fix. That observation is evidence for a generic contract review; it is not permission to branch on that filename or SHA or to weaken solver/physical/resource rules opportunistically.

## 9. Historical documents

Versioned PA/PS closure files, feature-stage documents and corpus audits are retained as historical evidence. A document that reports an older branch SHA or older first blocker must be read as an observation at that revision, not as current status. Stale corpus-status documents are historical evidence unless explicitly refreshed.

For current state use [`current-status.md`](current-status.md) and [`stage-03-source-guitar-configuration-closeout.md`](stage-03-source-guitar-configuration-closeout.md).
