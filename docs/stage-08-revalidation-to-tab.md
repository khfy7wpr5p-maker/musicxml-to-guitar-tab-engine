# Stage 08 — Correction Revalidation → Production TAB

Status: ✅ COMPLETE on protected `main` at merge SHA `051aae293244ead108079b4756810558e0a44891`, merged through PR #314.

## Goal

Safely return a teacher-corrected score to the existing production chain without treating editor validity, UI state, or browser events as canonical authority.

```text
REVIEW_REQUIRED
  → teacher edits
  → TEACHER_CORRECTED_REVISION
  → REVALIDATED_REVISION / VALID
  → trusted corrected-score materialization
  → XML safety + parse
  → deterministic route detection
  → existing MONO_V1 or POLY_V2 production path
  → existing physical feasibility / solver rules
  → validated CanonicalTabResult
  → existing writer/output
  → Stage08RevalidationTabEvidence
  → evidence-bound APPROVED_CANONICAL_SCORE
```

A real polyphonic corrected score must remain on `POLY_V2`. `REVALIDATED_REVISION + VALID` is eligibility to enter Stage 08, not approval.

## Implementation boundaries

### `src/app/stage08RevalidationTabContinuation.js`

The raw Stage 08 execution seam accepts only the exact current Stage 06 `REVALIDATED` session whose `revalidated_revision` is a Stage 05 `REVALIDATED_REVISION` with `validation_state=VALID`.

Before conversion it verifies:

- saved teacher-corrected revision identity;
- parent/revalidated revision identity;
- original `source_id`, SHA-256 and byte length;
- exact saved/revalidated patch-ledger equality;
- bounded, non-empty patch ledger;
- trusted materializer manifest and exact materialization evidence;
- corrected output SHA-256 and byte length;
- source bytes remain unchanged even if a materializer attempts mutation.

The materializer is deliberately a trusted adapter boundary. Stage 08 does not interpret a teacher patch by guessing how an arbitrary MusicXML producer encoded the target event. The adapter must materialize the corrected MusicXML and provide evidence binding that output to the exact source/revision/patch identities.

The corrected bytes then re-enter the existing application production path through `processMusicXmlUpload()`. Stage 08 does not duplicate parser, routing, guitar configuration, compatibility, physical feasibility, canonical selection or writer rules.

### `src/app/stage08ApprovedCanonicalRevision.js`

This is the production approval gate. A Stage 05 `VALID` revision is not sufficient here. Approval requires exact `Stage08RevalidationTabEvidence 1.0.0` proving:

- exact source/revalidated revision identity;
- trusted materializer identity and corrected-source fingerprint;
- production re-entry status `PASS`;
- admitted route (`MONO_V1` or `POLY_V2`);
- `CanonicalTabResult` authority and contract version;
- non-empty deterministic writer output fingerprint.

The older Stage 05 `createApprovedCanonicalRevision()` remains an internal revision constructor used beneath this gate; it is not the Stage 08 production authorization boundary. The evidence-bound Stage 08 result records `stage08_evidence` on the approved revision.

### `src/app/stage08ProductionContinuation.js`

This is the trusted production continuation. It runs the raw Stage 08 execution seam and, only for a full `PASS`, replaces constructor-only approval with the evidence-bound Stage 08 approval gate.

A `BLOCKED` or future evidence-backed `REVIEW_REQUIRED` re-entry returns no canonical TAB, writer output or approved revision.

### `src/app/stage08ReviewPort.js` and `src/app/stage08ProductionReviewPort.js`

The Stage 07 browser host already delegates to `reviewPort.continueToTab()` only when such a trusted port exists. Stage 08 supplies that port without granting semantic authority to the browser.

The production review port:

- keeps ordinary Stage 06 review operations delegated unchanged;
- enables the presentation `continueToTab` action only when the exact current session is `REVALIDATED` and `VALID` and the UI model already reports `readyForStage08=true`;
- captures session/source/saved/revalidated identity before request construction;
- rejects a stale identity before conversion;
- rejects a session that changes while conversion is running;
- routes continuation only to the evidence-bound Stage 08 production continuation.

The legacy `stage07:continue-to-tab` browser event remains presentation/event evidence only and cannot satisfy these gates.

## Preserved invariants

Stage 08 does not change:

- original OMR/MusicXML bytes;
- package-root exports;
- MONO/POLY route semantics;
- POLY_V2 compatibility rules;
- PA-8/PA-9 physical feasibility;
- solver ranking, cost or tie-break;
- resource ceilings;
- writer authority;
- Stage 07 Editor Core pin `9429116bd5c92d4db4c4edbb21b307c6c74c2391`;
- Rendering Layer source pin `13c32eefccd5bf2c227e815aa27aae4a0583801d`, contract `0.2.0`, OSMD `2.1.2`.

No filename, composer, corpus id, local path or source SHA is used as a production dispatch key.

## Failure semantics

Stage 08 is fail-closed.

- non-REVALIDATED / non-VALID → reject before materialization;
- stale source/revision/patch identity → reject;
- source byte mismatch/mutation → reject;
- malformed or identity-mismatched materialization evidence → reject;
- corrected source parse/safety/capability/physical failure → `BLOCKED`, no canonical result/output/approval;
- future evidence-backed reviewable re-entry → `REVIEW_REQUIRED`, no canonical result/output/approval;
- polyphonic corrected source attempting `MONO_V1` → reject `POLY_ROUTE_DOWNGRADE`;
- missing canonical result or writer output after claimed `PASS` → reject;
- approval evidence not proving exact `PASS` canonical writer chain → reject.

Stage 08 does not invent missing pitch, duration, onset, voice, staff, tie or chord semantics to convert a failure into success.

## Test coverage

Stage 08 adds focused regressions for:

- full teacher-corrected polyphonic re-entry to `POLY_V2`;
- deterministic repeated conversion;
- non-REVALIDATED and INVALID rejection;
- stale parent revision rejection;
- original source identity mismatch;
- materializer source-mutation detection;
- materialization patch-ledger mismatch;
- polyphonic route non-degradation;
- semantic/physical failure withholding canonical output and approval;
- Stage 08 materializer requirement;
- evidence-bound approval requirement;
- approval identity/status/canonical/writer evidence failures;
- trusted review-port continuation availability;
- stale session before and during continuation;
- browser event/non-ready session cannot activate trusted continuation;
- package-root API remains unchanged.

## Closeout evidence

PR #314 was verified on exact head `e613d1793e626ae67115a8fccfeb21f1a7b383af` before merge.

Protected required contexts all passed:

1. `Node.js 18` — SUCCESS;
2. `Node.js 20` — SUCCESS;
3. `Node.js 22` — SUCCESS;
4. `Tests, alphaTab import and SVG render / Node.js 18` — SUCCESS;
5. `Tests, alphaTab import and SVG render / Node.js 20` — SUCCESS;
6. `Tests, alphaTab import and SVG render / Node.js 22` — SUCCESS;
7. `alphaTab browser renderer and cursor; synth diagnostic / Node.js 22` — SUCCESS.

Additional closeout facts:

- `Runtime staging browser E2E / Node.js 22` also passed as the separate Stage 08 runtime-host verification workflow;
- unresolved PR review threads: `0`;
- package-root API changed files: `0`;
- exact Stage 07 dependency pins remained unchanged;
- PR #314 merged without bypassing branch protection;
- merge SHA: `051aae293244ead108079b4756810558e0a44891`;
- merge commit is GitHub-verified;
- protected `main` fresh-read resolved to the exact merge SHA;
- protected `main` still requires the same seven status contexts;
- post-merge `Tests` push workflow run `1333` passed on Node.js 18, 20 and 22.

Stage 08 is therefore closed. The next architecture gate is Stage 09 end-to-end real OMR/MusicXML corpus and product validation; Stage 08 semantics must not be widened opportunistically during that work.
