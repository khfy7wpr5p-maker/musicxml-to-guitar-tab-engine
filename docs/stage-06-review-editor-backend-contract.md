# Stage 06 — Review Editor Backend / Interaction Contract

Status: Stage 06 internal/application contract. Non-package-root. UI is not part of this stage.

## Goal

Provide one stable backend contract for a `REVIEW_REQUIRED` score before Stage 07 builds the visual editor.

```text
Stage 04 REVIEW_REQUIRED evidence
  → Stage 05 REVIEW_REVISION
  → Stage 06 review editor session
  → trusted editor adapter
  → explicit correction patches
  → undo / redo
  → save Stage 05 TEACHER_CORRECTED_REVISION
  → trusted revalidation
  → Stage 05 REVALIDATED_REVISION
```

Implementation: `src/app/reviewEditorBackend.js`.

The backend does **not** mutate MusicXML in browser code and does not create a second score-editing engine inside the TAB engine.

## Required operations

The Stage 06 API supports the master-program interaction surface:

- load a reviewable score: `createReviewEditorSession()`;
- list issues: `listReviewEditorIssues()`;
- select issue: `selectReviewEditorIssue()`;
- select event/location: `selectReviewEditorEvent()`;
- apply an explicit Stage 05 patch: `applyReviewCorrectionPatch()`;
- add/delete note and rest through capability-gated wrappers;
- change pitch, duration, onset, voice, staff, tie and chord grouping through capability-gated wrappers;
- undo: `undoReviewEditor()`;
- redo: `redoReviewEditor()`;
- save revision: `saveReviewEditorRevision()`;
- revalidate: `revalidateReviewEditorRevision()`.

All functions remain internal and are not exported from the package root.

## Review admission

A session can be created only when both upstream contracts agree:

1. Stage 04 state is exactly `REVIEW_REQUIRED` and `canOpenForReview=true`;
2. Stage 05 input is a valid `REVIEW_REVISION` with `validation_state=REVIEW_REQUIRED`.

Stage 04 issue ids must be unique inside one editor session. Ambiguous issue identity fails closed.

A selected issue supplies its stable Stage 04 event/location evidence when available. The caller may explicitly select a different current event/location, but every patch must exactly match the current selection before any adapter handler is invoked.

## Trusted editor adapter

Stage 06 delegates musical mutation to a trusted backend adapter. A browser renderer, DOM node, SVG coordinate or nearest-note guess cannot be that adapter.

The adapter manifest is explicit and session-bound:

```text
contractVersion
adapterId
capabilities[every Stage 05 edit class]
history.undo
history.redo
revalidate
```

Every edit capability is one of:

- `AVAILABLE`
- `BOUNDED`
- `UNAVAILABLE`

There is no implicit capability default. Every Stage 05 edit class must appear in the manifest.

`BOUNDED` means the trusted adapter has a real primitive but may reject a request when its own structural/timing/notation preconditions are not proven. Stage 06 never converts that rejection into a guessed edit.

`UNAVAILABLE` is checked before the adapter handler is called.

## ST Score Editor Core audit boundary

Fresh-read reference used for this stage: `khfy7wpr5p-maker/st-score-editor-core` main `c6615a314b41bcdded1e968df353070179453d16`.

Current evidence supports the following integration interpretation:

| Edit class | Current Editor Core evidence | Safe Stage 06 interpretation |
|---|---|---|
| pitch | `SET_PITCH` / `SET_NOTE_PITCH` | available |
| duration | `SET_DURATION` / `SET_EVENT_DURATION` | available/bounded |
| onset | guarded `MOVE_EVENT` retiming | bounded |
| voice reassignment | no canonical primitive found | unavailable |
| staff reassignment | cross-staff is display placement and preserves canonical staff identity | unavailable as canonical reassignment |
| note add | rest→note entry and chord-tone add | bounded |
| note delete | chord-tone removal / pitched-event→rest are narrower than arbitrary deletion | bounded only where adapter proves the admitted form |
| rest add/delete | pitched-event↔rest replacement | bounded |
| tie correction | explicit revision-bound note-pair editing | bounded |
| chord grouping | chord-tone add/remove | bounded |

Stage 06 does not hard-code this table as universal runtime authority. The actual trusted host adapter must present an explicit manifest. A future Editor Core release can widen a capability only after a fresh contract review.

## Existing Guitar TAB Workbench boundary

The pre-existing Guitar TAB Workbench and edit runtimes remain separate:

- `processMusicXmlNoteEdit()` — bounded MONO pitch revisions;
- `processMusicXmlPolyphonicNoteEditV2()` — bounded POLY pitch revisions with immutable source replay and group identity checks;
- current Workbench editing requires `status === PASS`.

Stage 06 does not relabel those pitch-only runtimes as a general teacher editor and does not weaken their existing `PASS` gate. Stage 07 may connect the new review backend to a review UI separately.

## Patch execution

Stage 06 first normalizes every correction through the Stage 05 patch contract. Therefore:

- target, `before` and `after` are explicit;
- no-op patches fail;
- missing values are not inferred;
- add/delete semantics remain explicit;
- inverse patch is derived by Stage 05;
- patch ids are unique in the active session.

Only then does Stage 06 check adapter capability and delegate the musical operation.

The trusted adapter receives frozen current session state, the normalized patch, selected issue/location and capability status. It returns a new bounded JSON-like adapter state plus execution evidence. Stage 06 does not inspect renderer geometry or manufacture musical values.

## Undo / redo

Undo/redo are delegated to the trusted adapter's history implementation. Stage 06 keeps only the corresponding Stage 05 patch ledger so the saved correction revision matches the adapter's current state.

- undo removes the last currently applied patch from the pending ledger and moves it to redo;
- redo restores that exact patch;
- a new edit after undo clears stale redo authority;
- history is unavailable when the manifest says so;
- after save, editing/history mutations are closed for that session.

This allows a host adapter backed by ST Score Editor Core to use its existing revision-bound history instead of duplicating score snapshots in the TAB engine.

## Save and revalidate

`saveReviewEditorRevision()` creates a Stage 05 `TEACHER_CORRECTED_REVISION` from the currently applied patch ledger. At least one applied correction is required.

`revalidateReviewEditorRevision()` is allowed only after save and only when the adapter manifest explicitly exposes revalidation. The adapter returns:

```text
validationState = VALID | INVALID
validationEvidence
adapterState
```

Stage 06 records that result through Stage 05 `createRevalidatedRevision()`.

Stage 06 does not approve the canonical score and does not itself authorize TAB production. Final corrected-score revalidation/POLY/TAB flow remains a later Stage 08 gate.

## Safety boundary

Stage 06 does not change:

- original source bytes;
- `processMusicXmlUpload()` behavior;
- existing Workbench PASS-only edit authority;
- MONO/POLY routing;
- solver ranking/cost/tie-break;
- physical feasibility rules;
- PA-6 / PA-8 / PA-9 policy;
- resource ceilings;
- package-root API.

Unsupported capabilities, stale/mismatched targets, ambiguous issue ids, adapter-manifest mismatch, malformed adapter results, unavailable history/revalidation and invalid stage transitions fail closed.
