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
| Determinism | ✅ HARD INVARIANT |
| Source byte / semantic immutability | ✅ HARD INVARIANT |
| Wider real-corpus production hardening | ⚠️ CONTINUES |
| Partial usable-result policy beyond review-state evidence | ⚠️ LATER GATE |
| Stage 07 review editor UI | 🔒 NOT IMPLEMENTED |
| Public PA-13 polyphonic package API | 🔒 NOT IMPLEMENTED |

Package metadata remains version `0.1.0`, `private: true`, Node.js >=18.

## Stage 04–06 review and correction boundary

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

The existing Guitar TAB Workbench and pitch edit runtimes remain separate and retain their existing `PASS`-only authority. Stage 06 does not silently turn those pitch-only paths into a general teacher editor. Stage 07 must connect presentation/interaction to the new review backend separately.

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

The package root remains narrower and does not export PA/PS internals, the POLY_V2 conversion pipeline, or the Stage 04–06 review/correction contracts.

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
- exact attribute-free grace nominal types `eighth` and `32nd`;
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

`verification/guitar-tech-real-corpus-manifest.json` remains a separate nine-file historical Guitar Pro evidence corpus. Its identity must not be silently replaced by newer Stage 03 verification material. Historical audit/state files remain evidence for the exact revisions they measured.

### Stage 03 exact nine-file audit

Stage 03 additionally audited nine exact SHA-selected files from `amamiya-yuuko/AnimeTAB` pinned at source commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a`.

For the audited candidate tree:

- 9/9 source SHA identities verified;
- 9/9 deterministic repeated processing;
- 9/9 source-byte immutability;
- duplicate audit reports byte-identical;
- direct pre-fix production main versus candidate comparison: `PRESERVED_CLASSIFICATIONS=9/9`.

The audited candidate `8e2bf4114ed092b8877a2139c2695b956471e866` and production squash merge `62b14efc1e9a56d35fa3bccc34400213c5e68f23` have the same tree SHA `03e0de47aa4ca444bb412e832b7bb231a9a8dd9b`. Therefore the production Stage 03 behavior is the exact audited tree.

The Stage 03 audit still exposes many `BLOCKED` outcomes. That is a current product limitation, not an ingestion failure and not a reason to weaken tuning/capo, physical or resource safety opportunistically. Stage 04 now supplies the generic evidence contract for repairable/local OMR uncertainty to become `REVIEW_REQUIRED`, while partial usable output for broader non-OMR blockers remains separately gated.

## Real-corpus gate contract

Real corpus is used to verify generic behavior:

- expected source SHA identity;
- source byte immutability;
- deterministic runtime result;
- deterministic canonical/MusicXML fingerprints when available;
- no hidden semantic mutation;
- expected fail-closed behavior;
- required CI green.

A newly exposed blocker must be classified on its semantics. Production code must never branch on corpus filename or SHA.

## Safety boundary

The engine does not silently infer or rewrite pitch, octave, onset, duration, voice, staff, tie, chord relationship, source guitar configuration, source pitch transformation, implicit voice split, ambiguous sustain continuation or solver ranking.

Physical impossibility must not be bypassed by changing solver ranking/cost/tie-break or inventing string assignments. Genuine tuning/capo changes must not be downgraded to presentation compatibility. Fixed resource ceilings must not be raised as a corpus workaround. Unsupported musical semantics must not be guessed from notation shape alone.

Renderer output is presentation only. Writers serialize canonical truth. Compatibility normalizers remove or reinterpret only proven representation-level differences. Candidate order, physical policy, ranking/cost and tie-breaks are not compatibility levers.

## Open architecture gates

1. Stage 07 review editor UI and renderer/host interaction integration on top of the Stage 06 backend contract.
2. Stage 08 corrected-revision revalidation → POLY_V2 → physical feasibility → TAB/product continuation.
3. Partial usable-output policy for cases that are not covered by the explicit Stage 04 OMR review evidence contract.
4. Wider producer-realistic real-corpus coverage and hardening.
5. Any broader public/package-root polyphonic API remains separately gated.
6. Unsupported or ambiguous notation classes remain fail-closed until a generic evidence-backed contract is reviewed.
7. Learned/runtime-shadow authority, hosting, authentication, persistence, PDF/playback and release/product gates remain separate from deterministic core semantics.
