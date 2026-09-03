# Stage 05 — Teacher Correction Revision Model

Status: Stage 05 internal/application contract. Non-package-root.

## Goal

Preserve the original OMR/MusicXML source as immutable identity while teacher corrections live in a separate, reversible and revalidatable revision chain.

Target flow:

```text
ORIGINAL_SOURCE
  → REVIEW_REVISION
  → TEACHER_CORRECTED_REVISION
  → REVALIDATED_REVISION
  → APPROVED_CANONICAL_SCORE
```

The implementation is `src/app/teacherCorrectionRevision.js`.

This is a **revision/patch authority contract**, not a browser editor and not an unrestricted score mutation engine.

## Original source identity

`createOriginalSourceSnapshot()` records only bounded identity/provenance facts:

- `source_id`
- `byte_length`
- lowercase SHA-256 digest
- `media_type`
- provenance

The source bytes are not rewritten or replaced by this contract. Every later revision carries the same frozen original-source snapshot.

## Required revision metadata

Each revision transition records:

- `actor`
- canonical UTC `timestamp`
- `reason`
- `provenance`
- revision id and parent revision id
- validation state

Teacher correction revisions additionally carry explicit correction patches. Revalidation revisions carry explicit validation evidence.

## Reversible patch shape

A teacher patch contains:

```text
patch_id
edit_class
target_event
before
after
inverse_patch     (derived by Stage 05)
```

`inverse_patch` is derived from the explicit `before` / `after` values; the caller does not provide a second independent inverse that could disagree with the forward patch.

Add/delete reversals are semantic counterparts:

- `NOTE_ADD` ↔ `NOTE_DELETE`
- `REST_ADD` ↔ `REST_DELETE`

Update/correction classes reverse by swapping their explicit before/after values.

## Representable edit classes

The Stage 05 revision ledger can represent all target classes from the master program:

- `PITCH_UPDATE`
- `DURATION_UPDATE`
- `ONSET_TIMELINE_CORRECTION`
- `VOICE_REASSIGNMENT`
- `STAFF_REASSIGNMENT`
- `NOTE_ADD`
- `NOTE_DELETE`
- `REST_ADD`
- `REST_DELETE`
- `TIE_CORRECTION`
- `CHORD_GROUPING_CORRECTION`

**Representable does not mean executable.** Stage 05 records an already-explicit teacher decision. Stage 06 must prove that its selected editor adapter has a safe primitive for the requested class before it may execute the correction.

## No semantic guessing

Stage 05 never invents a missing correction value.

- add requires `before=null` and explicit `after`;
- delete requires explicit `before` and `after=null`;
- update/reassignment/correction requires explicit non-null `before` and `after`;
- no-op patches are rejected;
- duplicate patch ids are rejected;
- unknown edit classes are rejected.

Pitch, duration, onset, voice, staff, tie endpoints, chord membership and note/rest content therefore come from an explicit correction decision, not from this ledger.

## Stage 04 handoff

`createReviewRevision()` requires evidence that explicitly proves:

```text
status = REVIEW_REQUIRED
canOpenForReview = true
```

A Stage 04 hard block cannot be converted into a review revision by this contract.

## Validation gate

A teacher correction starts as `PENDING_REVALIDATION`.

Revalidation may resolve only to:

- `VALID`
- `INVALID`

`APPROVED_CANONICAL_SCORE` is admitted only from a `VALID` revalidated revision. Stage 05 does not itself claim that full MusicXML/POLY/TAB revalidation has happened; the supplied validation evidence must come from the later revalidation integration/gate.

## ST Score Editor Core capability audit

Fresh read reference: `khfy7wpr5p-maker/st-score-editor-core` main `c6615a314b41bcdded1e968df353070179453d16`.

Current relevant capabilities found there:

| Master edit target | Editor Core current evidence | Stage 05/06 interpretation |
|---|---|---|
| pitch update | `SET_PITCH` / `SET_NOTE_PITCH` | executable primitive exists |
| duration update | `SET_DURATION` / `SET_EVENT_DURATION` | executable primitive exists |
| onset/timeline | `editor-event-retiming` `MOVE_EVENT` with measure/timing guards | bounded executable primitive exists |
| voice reassignment | no canonical reassignment primitive found in fresh search | revision is representable; Stage 06 must remain unavailable until a safe primitive exists |
| staff reassignment | cross-staff authoring exists, but preserves canonical source staff/event identity | cross-staff display is not canonical staff reassignment; Stage 06 must not treat it as one |
| note add | bounded rest→note entry and chord-tone add exist | only admitted bounded forms may execute |
| note delete | chord-tone removal and pitched-event→rest exist | not equivalent to unrestricted arbitrary event deletion |
| rest add/delete | pitched-event↔rest replacement exists | bounded forms may execute |
| tie correction | advanced keypad uses explicit revision-bound note-pair endpoints | executable primitive exists under its guards |
| chord grouping | chord tone add/remove exists | bounded executable primitive exists |

The repositories remain independent. This audit does not create a runtime package dependency from the TAB engine to Editor Core and does not grant Editor Core authority over source truth, solver policy or TAB final selection.

## Safety boundary

Stage 05 does not change:

- `processMusicXmlUpload()` behavior;
- solver ranking/cost/tie-break;
- PA-6 / PA-8 / PA-9 physical policy;
- resource ceilings;
- MusicXML compatibility rules;
- package-root API.

Unknown data, malformed patch shapes, accessors/proxies, invalid state transitions, backwards revision chronology, unvalidated approval and semantic guesses fail closed.
