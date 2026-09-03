# Stage 07 — Review Required Score Editor UI

Status: internal/application UI contract and browser shell. Stage 08 production continuation is not activated here.

## Master-program goal

A `REVIEW_REQUIRED` score must be understandable and correctable by a teacher without locking the whole file. The Stage 07 surface therefore provides:

- an open score workspace for reviewable input;
- visible issue list and synchronized current score target/highlight;
- pitch and duration correction controls;
- capability-gated voice, staff, tie and chord correction controls;
- note/rest add and delete actions;
- undo/redo;
- save revision;
- revalidate;
- explicit PASS continuation control;
- an explicit non-editable reason for hard `BLOCKED` input.

Implementation:

- presentation model: `src/app/reviewEditorUiModel.js`;
- browser shell: `web/review-score-editor/index.html`;
- browser controller: `web/review-score-editor/review-editor.js`;
- mobile layout: `web/review-score-editor/review-editor.css`.

All Stage 07 engine-side modules remain internal and are not exported from the package root.

## Authority chain

```text
Stage 04 OMR review evidence
  → Stage 05 immutable-source correction revision
  → Stage 06 capability-gated review editor backend
  → Stage 07 host-authoritative UI
  → Stage 08 corrected revision revalidation / POLY_V2 / TAB
```

The browser UI is never canonical musical authority. It does not edit raw MusicXML, invent `before` values, convert coordinates into canonical event identity, or apply patches directly.

## UI model

`createReviewEditorUiModel()` accepts one explicit document state:

- `REVIEW_REQUIRED` + a current Stage 06 session;
- `BLOCKED` + an explicit reason and bounded issue list;
- `PASS`.

For `REVIEW_REQUIRED` it derives only presentation state:

- score open/locked state;
- issue list and selected issue;
- selected stable target already owned by Stage 06;
- edit-control availability from the Stage 06 adapter manifest;
- undo/redo/save/revalidate button state;
- revalidation state and Stage 08 readiness.

`AVAILABLE` and `BOUNDED` adapter capabilities may enable a control only while the Stage 06 session is editing and a stable current target exists. `UNAVAILABLE` is always disabled.

A Stage 06 `REVALIDATED_REVISION` with `validation_state=VALID` means the correction is ready to enter the Stage 08 gate. Stage 07 does **not** relabel that state as `PASS`. `Continue to TAB` is enabled only when the host supplies an actual `PASS` state after the later production gate.

## Renderer boundary

Fresh-read rendering reference for this stage:

- repository: `khfy7wpr5p-maker/st-score-rendering-layer`;
- main: `13c32eefccd5bf2c227e815aa27aae4a0583801d`;
- browser runtime contract: `0.2.0`;
- relevant browser host operations: `renderMusicXml`, `moveCursor`, `hitTestNoteDetailed`, `highlight`, `clearHighlights`.

The Stage 07 shell deliberately does not call `hitTestNote*()` itself. Its host owns renderer integration and canonical mapping:

```text
pointer/touch point
  → Rendering Layer exact current-render hit evidence
  → host checks render epoch/current mapping
  → Editor Core / trusted host resolves canonical semantic identity
  → Stage 06 selectReviewEditorEvent()
  → Stage 07 refreshes selected target
  → host.syncScoreSelection()
  → current renderer highlight only
```

A renderer `ScoreNoteRef`, DOM/SVG element, coordinate or nearest-note guess is never passed directly as a Stage 05/06 edit target.

`host.mountScore()` is the application integration boundary for Rendering Layer. `host.selectScorePoint()` must perform the exact renderer-hit → current canonical identity resolution before updating the Stage 06 session.

`host.syncScoreSelection()` performs the reverse presentation-only mapping after each UI refresh: the current Stage 06 canonical target/issue is mapped through the current render manifest to a renderer highlight. It must clear highlight state for `BLOCKED`/non-review presentation and must fail closed on stale, unknown or ambiguous mapping. It cannot mutate the canonical score or semantic selection.

## Editor capability boundary

Fresh-read editor reference for this stage:

- repository: `khfy7wpr5p-maker/st-score-editor-core`;
- main: `a618792e242efc745b6ec8e63380883c8ed85549`.

The current Editor Core continues to provide substantial safe correction/history primitives, but a fresh code search did not find a reviewed canonical `VOICE_REASSIGNMENT` or canonical `STAFF_REASSIGNMENT` primitive. Recent Voice work materializes proven synthetic measure coverage; it does not by itself prove arbitrary imported-score voice reassignment.

Therefore Stage 07 renders voice/staff controls from capability state rather than pretending the primitives exist. A trusted adapter can enable them only after a later fresh review proves the corresponding canonical operation.

Note addition carries the pitch and duration explicitly selected in the UI; rest addition carries the selected duration. The host still validates and converts these requested values through the Stage 06 capability-gated adapter. Delete/tie/chord actions rely only on a current canonical selection and must fail closed if the trusted host cannot derive one unambiguous explicit patch from that state.

## Browser host contract

`ReviewScoreEditor.mount({ root, host })` requires the host to expose:

```text
snapshot()
mountScore(scoreElement, callbacks)
syncScoreSelection({ selectedTarget, selectedIssueId })
selectIssue(issueId)
selectScorePoint({ clientX, clientY })
command({ command, value })
undo()
redo()
save()
revalidate()
```

`continueToTab()` is optional until Stage 08 is connected; the UI will fail explicitly if a caller attempts continuation without that host capability.

`command()` receives a UI intent only. The host must resolve the current canonical selection/current value and delegate to the corresponding Stage 06 capability-gated operation. The browser UI never supplies canonical target identity or Stage 05 `before` evidence. Requested values are still untrusted UI input and must be validated by the host/editor adapter.

## Hard BLOCKED behavior

For `BLOCKED` input:

- the score editor is hidden/locked;
- all edit and revision actions are disabled;
- the hard-block reason is visible;
- issue details may be shown read-only;
- score highlight state is cleared through the host presentation boundary;
- no attempt is made to downgrade safety/parse/resource/structural failures to review state.

## Mobile behavior

The shell includes small-screen layouts at 820 px and 430 px, safe-area padding and touch-sized controls. This is a responsive contract, not a claim of physical iPhone acceptance. Physical iPhone/Safari review remains a host/device acceptance gate.

## Non-changes

Stage 07 does not change:

- original source bytes;
- `processMusicXmlUpload()` behavior;
- MONO/POLY routing;
- existing Guitar TAB Workbench PASS-only edit authority;
- solver ranking/cost/tie-break;
- physical feasibility rules;
- resource ceilings;
- package-root API;
- Stage 08 production authorization.
