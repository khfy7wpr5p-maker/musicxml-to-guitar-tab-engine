# Current Implementation Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-01 -->

This file is the live convergence view. Historical closure/audit documents retain the exact state they measured, but do not override this status.

## Production architecture status

| Area | Status |
|---|---|
| Core parser / normalization architecture | ✅ STABLE |
| Package-root deterministic monophonic API | ✅ PUBLIC / VERIFIED |
| `CanonicalTabResult 1.0.0` package-root authority | ✅ ACTIVE |
| MONO source capo extension: `CanonicalTabResult 1.1.0` | ✅ ACTIVE — explicit nonzero Standard-tuned source capo |
| Internal/application POLY_V2 path | ✅ IMPLEMENTED / BOUNDED / NON-PACKAGE-ROOT |
| `CanonicalTabResult 2.0.0` runtime/validator/writer | ✅ INTERNAL/APPLICATION |
| Internal POLY capo/configuration extension: `CanonicalTabResult 2.1.0` | ✅ INTERNAL/APPLICATION |
| Explicit complete MusicXML six-string tuning provenance | ✅ ACTIVE / BOUNDED — application upload boundary |
| Explicit MusicXML capo provenance | ✅ ACTIVE / BOUNDED — configuration validated before solve scope |
| Capo-only later `staff-details` restatement | ✅ ACTIVE / BOUNDED — prior complete same-part/same-staff configuration required |
| Genuine tuning/capo change after solve start | 🔒 FAIL-CLOSED |
| Legacy TAB presentation-only tuning fallback | ✅ ACTIVE / STRICTLY BOUNDED — Standard fallback only before solve start |
| Guitar Pro grace compatibility | ✅ ACTIVE |
| Exact grace nominal type `32nd` | ✅ ACTIVE |
| Exact grace accidental display compatibility | ✅ ACTIVE / BOUNDED |
| Exact Guitar Pro bracketed triplet display compatibility | ✅ ACTIVE |
| Exact normalized TAB staff mirror collapse | ✅ ACTIVE |
| Exact display-only rehearsal direction compatibility | ✅ ACTIVE |
| Sustain / tie compatibility | ✅ MATERIALLY STRENGTHENED |
| PA-6 target MIDI in sustained physical selection | ✅ ACTIVE / INTERNAL |
| PA-8 false aggregate exhaustion | ✅ CORRECTED WITHOUT RAISING FIXED CEILINGS |
| Same-voice chord false-positive overlap | ✅ CORRECTED |
| Unequal-duration same-voice chord occupancy | ✅ MAX-MEMBER END PRESERVED |
| Stage 04 OMR review evidence → `REVIEW_REQUIRED` | ✅ INTERNAL / ALLOW-LISTED / FAIL-CLOSED |
| Stage 05 teacher correction revision ledger | ✅ INTERNAL / IMMUTABLE-SOURCE / REVERSIBLE |
| Stage 06 review editor backend contract | ✅ INTERNAL / CAPABILITY-GATED / NON-UI |
| Stage 07 review editor UI + exact host/pins | ✅ COMPLETE / INTERNAL — Editor Core `9429116…`, Rendering `13c32eef…` |
| Stage 08 correction revalidation → production TAB | ✅ COMPLETE / INTERNAL — merged PR #314 at `051aae293244ead108079b4756810558e0a44891` |
| Stage 09 real OMR/MusicXML product gate | ⚠️ IN PROGRESS / EVIDENCE GAP — 9/20 unique real MusicXML, 0/3 real teacher corrections |
| Determinism | ✅ HARD INVARIANT |
| Source byte / semantic immutability | ✅ HARD INVARIANT |
| Wider real-corpus production hardening | ⚠️ CONTINUES |
| Partial usable-result policy beyond review-state evidence | ⚠️ LATER GATE |
| Public PA-13 polyphonic package API | 🔒 NOT IMPLEMENTED |

Package metadata remains version `0.1.0`, `private: true`, Node.js >=18.

## Stage 04–09 review, correction and production continuation boundary

Stage 04 adds a concrete internal OMR evidence producer on top of the Stage 01 score-state model. Only explicitly allow-listed, evidence-backed OMR uncertainty may become `REVIEW_REQUIRED`; unknown, parser/safety/structural or otherwise unclassified failures remain fail-closed. `sourceReviewAvailability` must be explicitly safe, stable review location evidence is required, and missing musical values remain missing instead of being guessed.

Stage 05 keeps the original source identity immutable and records teacher correction as a separate revision chain:

```text
ORIGINAL_SOURCE
  → REVIEW_REVISION
  → TEACHER_CORRECTED_REVISION
  → REVALIDATED_REVISION
  → APPROVED_CANONICAL_SCORE
```

Teacher patches carry explicit `before` / `after`, target identity, provenance and a derived inverse patch. The ledger can represent the master correction classes, but representability does not imply that an editor currently has a safe executable primitive for every class.

Stage 06 adds the internal review-editor backend contract. It loads only Stage 04/05 reviewable state, exposes stable issue/event selection, delegates musical mutation and undo/redo to a trusted capability-declaring editor adapter, saves the currently applied Stage 05 patch ledger, and records trusted revalidation evidence. No capability is implicit. Canonical voice reassignment and canonical staff reassignment remain unavailable when the selected adapter does not expose reviewed primitives; cross-staff display placement is not canonical staff reassignment.

Stage 07 is complete. It provides the internal presentation model, responsive browser shell and exact host boundary on top of Stage 06. The host keeps the browser presentation-only, rejects stale renderer evidence, resolves renderer hits through Editor Core canonical selection, preserves the exact reviewed Editor Core revision `9429116bd5c92d4db4c4edbb21b307c6c74c2391`, Rendering Layer revision `13c32eefccd5bf2c227e815aa27aae4a0583801d`, Rendering contract `0.2.0` and OSMD `2.1.2`, and leaves production continuation disabled unless a trusted Stage 08 port is supplied. Stage 07 `readyForStage08` is eligibility evidence only, not canonical approval.

Stage 08 is complete on protected `main` at `051aae293244ead108079b4756810558e0a44891`, merged through PR #314. It introduces a trusted corrected-score materializer boundary tied to the exact immutable source, saved/revalidated revision and patch ledger; re-enters corrected MusicXML through the existing application parser/routing/physical/canonical/writer chain; forbids polyphonic `MONO_V1` degradation; and withholds canonical output/approval on failed re-entry. Production approval additionally requires `Stage08RevalidationTabEvidence` proving exact source/revision identity, `PASS` production re-entry, canonical TAB authority and non-empty writer output. The production review port enables `Continue to TAB` only for the exact current `REVALIDATED/VALID` session and rejects stale session/source/revision identity before or during continuation. Pre-merge protected checks passed on exact head `e613d1793e626ae67115a8fccfeb21f1a7b383af`; merge SHA fresh-read and post-merge Node.js 18/20/22 tests also passed. See [`stage-08-revalidation-to-tab.md`](stage-08-revalidation-to-tab.md).

Stage 09 now has a dedicated evidence gate. It deliberately separates authentic product evidence from unit-test fixtures. The existing historical real MusicXML manifest provides nine unique SHA identities and the Stage 03 reviewed audit verifies those same identities; the audit is not counted as a second corpus. No authentic OMR-to-teacher-correction package is currently pinned, so synthetic Stage 08 fixtures do not satisfy Tier B. The product gate remains `HOLD_EVIDENCE_GAP` until at least 20 unique authentic MusicXML cases, at least three authentic teacher-correction cases, all `PASS` / `REVIEW_REQUIRED` / `BLOCKED` outcomes and the required representation coverage are demonstrated. See [`stage-09-real-corpus-product-gate.md`](stage-09-real-corpus-product-gate.md).

The existing Guitar TAB Workbench and pitch edit runtimes remain separate and retain their existing `PASS`-only authority. Stage 08 does not silently turn those pitch-only paths into the teacher editor and Stage 09 does not widen the package-root API.

## Current production/application path

```text
MusicXML
  → XML safety + bounded parser
  → source guitar configuration provenance / authority
  → representation compatibility normalizers
  → PolyphonicSourceModel
  → tie/sustain + active sonority
  → guitar positions using resolved configuration
  → PA-8 / PA-9 physical candidates
  → sustained path solver when required
  → deterministic canonical final selection
  → CanonicalTabResult 2.0.0 / 2.1.0
  → internal/application MusicXML writer
```

For teacher-corrected review state, Stage 08 does not bypass this path. It materializes the exact corrected revision through a trusted adapter, reruns the corrected bytes through the same application production route, and only after full `PASS` creates evidence-bound approved-canonical state.

The package root remains narrower and does not export PA/PS internals, the POLY_V2 conversion pipeline, or the Stage 04–09 review/correction/UI/continuation/evidence contracts.

## Stage 03 source guitar configuration boundary

`src/parser/musicXmlGuitarConfigurationProvenance.js` now admits executable source configuration only from bounded, validated MusicXML evidence. A complete tuning requires exactly six lines, valid scalar pitch facts, physically consistent six-string ordering and a representable immutable guitar configuration. At most one capo is accepted per declaration.

The first executable configuration must be established before immutable solve scope begins. In the current provenance contract, solve scope is considered started when the first configuration appears after measure index 0 or after a `note`, `backup`, or `forward` already occurred earlier in measure 0.

Later identical declarations are restatements, not new authority. A capo-only restatement may inherit only a prior complete configuration from the same part/staff. A genuine later tuning/capo change fails closed as an unsupported configuration change.

### Legacy TAB presentation-only fallback

Historical producer exports may carry `staff-tuning` that is presentation provenance rather than executable physical string authority. The application runtime preserves only a narrow compatibility case:

- exact partial legacy TAB tuning with no capo; or
- exact complete physically reversed legacy TAB presentation order;
- exact parser-error location in measure 0;
- exact matching TAB staff/clef and admitted shape;
- no preceding `note`, `backup`, or `forward`;
- exactly one compatible presentation block in the document;
- no conflicting executable configuration/capo authority.

When this proof succeeds, the block is classified `TAB_PRESENTATION_PROVENANCE_ONLY` and the runtime uses `STANDARD_DEFAULT`. The legacy metadata is not converted into source tuning authority.

PR #303 closed the post-merge P1 from PR #299 by rejecting a lone legacy declaration that first appears after solve start. See [`stage-03-source-guitar-configuration-closeout.md`](stage-03-source-guitar-configuration-closeout.md).

## Compatibility now active

Production code contains generic, bounded contracts for:

- validated explicit source tuning/capo configuration at the application boundary;
- exact pre-solve legacy TAB presentation-only tuning compatibility described above;
- exact reviewed Guitar Pro grace representation;
- exact grace nominal types `eighth` and `32nd`;
- exact matching grace accidental display metadata;
- exact bracketed-below Guitar Pro 3:2 triplet display metadata backed by validated timing semantics;
- exact two-staff notation/TAB mirror collapse after original staff-2 TAB evidence and normalized semantic equality are proven;
- exact display-only rehearsal direction provenance;
- exact contiguous closed sustain-stop continuation under PS-2 v1.2.0;
- bounded capo-only restatement using only prior complete same-staff configuration.

These rules are MusicXML-shape/semantic contracts. They do not dispatch on filename or SHA.

## Sustain / tie / same-voice state

PS-2 `SustainTieGraph` v1.2.0 preserves exact source tie facts and can reconnect only the bounded contiguous closed-stop representation. True orphan stops, identity mismatch, non-contiguous continuation, ambiguous starts and unterminated chains remain fail-closed.

PS-3 carries logical sustain continuity through sealed chain order. PS-4A carries active notes into later sonority points. PS-4C reuses PA-8/PA-9 physical enumeration per sonority point, and PA-12 can use sustained canonical final selection for specifically recognized retained-sustain/tie cases.

For retained PA-6 octave-displacement decisions, the original `PolyphonicSourceModel`, source pitch, timing, voice/staff and tie graph remain authoritative and unchanged. Only the bounded target-MIDI physical-selection seam consumes the arrangement target.

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE.**

Exact same-voice `<chord/>` members are one attack group. Occupancy extends to the longest member end. A later independent non-chord event that starts before that end remains fail-closed with `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`; the engine does not invent a voice split.

## PA-8 resource limits

Authoritative constants in `src/music/leftHandShapeModel.js` remain:

- 20,000 left-hand shape candidates per independently processed source group;
- 100,000 complete finger-assignment attempts per independently processed source group.

In the sustained PS-4C path, the enforcement window resets once per PS-4A sonority point. This corrects false whole-score/earlier-point aggregate exhaustion while preserving numerical ceilings, candidate traversal order, physical rules, solver ranking/cost and tie-break behavior.

## Real-corpus evidence

### Historical Guitar Pro manifest corpus

`verification/guitar-tech-real-corpus-manifest.json` remains the currently pinned nine-file historical Guitar Pro evidence corpus. Historical audit/state files remain evidence for the exact revisions they measured.

### Stage 03 reviewed audit

The committed Stage 03 reviewed audit contains the same nine file names and SHA-256 identities as the historical manifest. It verifies identity, determinism and source immutability for those cases, but Stage 09 intentionally deduplicates by exact source SHA and therefore counts **9 unique real MusicXML cases, not 18**.

The reviewed audit still exposes many `BLOCKED` outcomes. That is a current product limitation, not an ingestion failure and not a reason to weaken tuning/capo, physical or resource safety opportunistically. Stage 04 supplies the generic evidence contract for repairable/local OMR uncertainty to become `REVIEW_REQUIRED`; Stage 08 supplies the bounded corrected-revision return path.

### Stage 09 evidence gap

`verification/stage09-real-teacher-correction-corpus.json` is currently empty by design because no authentic teacher-correction package has been verified. Synthetic tests must remain synthetic. Stage 09 completion therefore requires new external evidence rather than relabeling existing fixtures.

## Real-corpus gate contract

Real corpus is used to verify generic behavior:

- expected source SHA identity;
- source byte immutability;
- deterministic runtime result;
- deterministic canonical/MusicXML fingerprints when available;
- no hidden semantic mutation;
- expected fail-closed behavior;
- no true-polyphony downgrade to `MONO_V1`;
- evidence-bound Stage 08 approval for correction-path `PASS`;
- no canonical/writer output for `REVIEW_REQUIRED` or `BLOCKED`;
- required CI green.

A newly exposed blocker must be classified on its semantics. Production code must never branch on corpus filename or SHA.

## Safety boundary

The engine does not silently infer or rewrite pitch, octave, onset, duration, voice, staff, tie, chord relationship, source guitar configuration, source pitch transformation, implicit voice split, ambiguous sustain continuation or solver ranking.

Physical impossibility must not be bypassed by changing solver ranking/cost/tie-break or inventing string assignments. Genuine tuning/capo changes must not be downgraded to presentation compatibility. Fixed resource ceilings must not be raised as a corpus workaround. Unsupported musical semantics must not be guessed from notation shape alone.

Renderer output is presentation only. Writers serialize canonical truth. Compatibility normalizers remove or reinterpret only proven representation-level differences. Candidate order, physical policy, ranking/cost and tie-breaks are not compatibility levers.

## Open architecture gates

1. Stage 09 evidence acquisition: add at least 11 additional unique authentic MusicXML cases and at least 3 authentic teacher-correction cases with required status/representation coverage.
2. Partial usable-output policy for cases that are not covered by the explicit Stage 04 OMR review evidence contract.
3. Wider producer-realistic real-corpus coverage and hardening.
4. Any broader public/package-root polyphonic API remains separately gated.
5. Unsupported or ambiguous notation classes remain fail-closed until a generic evidence-backed contract is reviewed.
6. Learned/runtime-shadow authority, hosting, authentication, persistence, PDF/playback and release/product gates remain separate from deterministic core semantics.
