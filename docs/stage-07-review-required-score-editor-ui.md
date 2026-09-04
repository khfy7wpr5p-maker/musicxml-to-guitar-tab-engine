# Stage 07 — Review Required Score Editor UI

Status: Stage 07 closeout candidate. On merge of this integration branch, the internal/application review UI, exact renderer/editor host boundary and mobile interaction contract are complete. Stage 08 production continuation is not activated here.

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
- integrated host: `web/review-score-editor/integrated-host.js`;
- exact Editor Core runtime pin: `web/review-score-editor/editor-core-pin.js`;
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

## Exact reviewed dependency pins

Stage 07 binds only the exact reviewed integration revisions:

- ST Score Rendering Layer repository: `khfy7wpr5p-maker/st-score-rendering-layer`;
- Rendering Layer source revision: `13c32eefccd5bf2c227e815aa27aae4a0583801d`;
- browser runtime contract: `0.2.0`;
- OSMD: `2.1.2`, BSD-3-Clause;
- ST Score Editor Core repository: `khfy7wpr5p-maker/st-score-editor-core`;
- Editor Core source revision: `9429116bd5c92d4db4c4edbb21b307c6c74c2391` (squash merge of PR #108).

`editor-core-pin.js` requires the host caller to present this exact Editor Core source revision and rejects any other revision before `integrated-host.js` is allowed to create the review host. This is dependency provenance only; it grants no new canonical authority.

## Renderer / Editor Core boundary

Relevant Rendering Layer browser host operations are `renderMusicXml`, `moveCursor`, `hitTestNoteDetailed`, `highlight`, `clearHighlights` and `dispose`.

The Stage 07 shell deliberately does not call `hitTestNote*()` itself. Its integrated host owns renderer integration while Editor Core retains canonical selection authority:

```text
pointer/touch point
  → Rendering Layer exact current-render hit evidence
  → host checks renderEpoch + sourceId freshness
  → Editor Core resolves ScoreNoteRef through its current opaque manifest
  → current SemanticAddress selection only
  → Stage 06 selected target
  → Stage 07 refresh
  → exact SemanticAddress → ScoreNoteRef / ScoreMeasureRef presentation mapping
  → current renderer highlight/cursor only
```

A renderer `ScoreNoteRef`, DOM/SVG element, coordinate or nearest-note guess is never passed directly as a Stage 05/06 edit target.

`host.mountScore()` is the application integration boundary for Rendering Layer. It admits the exact renderer manifest/version only, attaches the exact OSMD host profile through Editor Core, renders the current revision, records `renderEpoch`/`sourceId` evidence, and installs the same `pointerup` interaction path used by the reviewed mobile chain.

`host.selectScorePoint()` accepts a renderer hit only when the current render evidence matches. Editor Core's `selectRenderedScoreNoteRef()` resolves the hit to the current canonical selection; the operation is required to leave document revision and history lengths unchanged before Stage 06 receives the selected canonical target.

`host.syncScoreSelection()` performs the reverse presentation-only path. Stage 06 supplies a trusted semantic presentation address; Editor Core PR #108 supplies exact current-revision `SemanticAddressV3 → ScoreNoteRef` and `SemanticAddressV3 → ScoreMeasureRef` mapping; the Rendering Layer receives only the resulting exact visual locator. Unknown, stale, ambiguous or non-note highlight cases clear/abstain instead of guessing.

Resize, orientation and `visualViewport` changes use controlled rerender with OSMD `autoResize=false`. Renderer disposal accepts synchronous or asynchronous host cleanup without changing semantic state.

## Editor capability boundary

The exact pinned Editor Core provides the reviewed reverse presentation locators required by Stage 07, while canonical edit capabilities remain separately gated. The presence of the Stage 07 pin does not imply arbitrary canonical `VOICE_REASSIGNMENT` or `STAFF_REASSIGNMENT` support.

Therefore Stage 07 renders voice/staff controls from capability state rather than pretending the primitives exist. A trusted adapter can enable them only when the selected adapter explicitly exposes a reviewed canonical operation.

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

## Mobile / Safari closeout evidence

The shell includes small-screen layouts at 820 px and 430 px, safe-area padding and touch-sized controls. Stage 07 uses the already reviewed physical-iPhone `pointerup → canonical selection → visible highlight` interaction path and the exact pinned Rendering Layer/Editor Core boundary. Editor Core PR #108 additionally passed its current CI and APP-09B WebKit regression before merge. The engine closeout still requires its own full CI on this exact host/pin branch before merge.

This closeout reuses the reviewed physical-device interaction evidence; it does not claim a new physical device run was executed for this exact engine commit.

## Stage 07 completion gate

Stage 07 is complete only when all of the following are true on the merge candidate:

1. exact Rendering Layer pin is unchanged and admitted;
2. exact Editor Core revision `9429116bd5c92d4db4c4edbb21b307c6c74c2391` is enforced fail-closed;
3. current-render hit → Editor Core canonical selection is exact and selection-only;
4. canonical issue/selection → current renderer highlight/cursor is exact and presentation-only;
5. mobile pointer path and controlled rerender contract remain covered;
6. Stage 06 edit/revision authority remains capability-gated;
7. full engine CI is green;
8. no blocking review thread remains;
9. the integration PR is merged to `main`.

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
