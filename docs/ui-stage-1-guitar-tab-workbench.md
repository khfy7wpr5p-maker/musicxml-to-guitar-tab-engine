# UI Stage 1 — Guitar TAB Workbench

Status: active product-UI line built on `UI-RUNTIME-01`.

## Product target

The first workbench is deliberately narrow:

1. safe `.musicxml` / `.xml` upload;
2. standard notation above rhythmic guitar TAB;
3. Play / Stop transport;
4. measure and note/beat cursor tracking;
5. a side panel that surfaces structured conversion issues and can focus the affected measure;
6. structured note editing followed by deterministic TAB regeneration.

Items 1–5 are merged. Item 6 is implemented on the structured-edit stage branch for the monophonic v1 route: a rendered note or TAB number is mapped back to a canonical event identity, the requested pitch is submitted as a bounded revision command, and the engine rebuilds the canonical result and renderer MusicXML before the workbench reloads notation and TAB together.

## Runtime split

The browser layer does not import internal engine modules. Uploads use the bounded application result from `src/app/musicXmlUploadRuntime.js`:

`browser file → bounded application upload endpoint → processMusicXmlUpload → MusicXmlUploadRuntimeResult → alphaTab renderer/player`

Structured edits use a separate host seam and internal application runtime:

`clicked renderer note → canonical measure/event identity → bounded edit request → processMusicXmlNoteEdit → full canonical rebuild + fingering optimization → new notation+TAB MusicXML → alphaTab reload`

The package-root API remains unchanged. PA/v2, GuitarSet shadow, deterministic selector internals and canonical producers are not exposed to the browser.

The page intentionally targets same-origin `/api/upload` and `/api/edit` host seams rather than embedding the engine in browser JavaScript. The edit host contract sends the immutable source bytes, the exact source SHA-256 and the cumulative structured command list. This stage does not authorize a production deployment server or change the production dependency graph.

## Browser safety rules

- client-side upload gate mirrors the existing 5 MiB ceiling and `.musicxml` / `.xml` extension boundary, but the server/runtime gate remains authoritative;
- the browser keeps one private owned source-byte snapshot in memory only and passes a copy to host callbacks;
- every edit is tied to the exact upload SHA-256 and replays the complete bounded revision chain from the immutable source;
- revision history is capped at 128 commands;
- no remote CDN dependency is embedded in the workbench source;
- alphaTab assets and soundfont are expected from a same-origin application asset route;
- issue text is rendered only through `textContent`; no runtime issue or MusicXML field is inserted as HTML;
- no browser persistence, cookies, localStorage, sessionStorage or IndexedDB are introduced;
- no engine, learning or canonical internal module is imported into browser code;
- browser code never edits raw MusicXML and never mutates alphaTab fret/string/pitch data;
- renderer/player errors surface in the issue panel rather than silently changing the score;
- starting a new upload hides the previous rendered score and disables transport; a BLOCKED or failed upload keeps it hidden so stale notation cannot be mistaken for the current document;
- a BLOCKED edit does not replace the current valid score or revision history; it surfaces the structured issue and keeps the last accepted renderer document visible.

## Viewer and playback

`web/guitar-tab-workbench/workbench.js` mounts an alphaTab `AlphaTabApi` with SVG rendering, standard notation + tablature, note bounds, cursor/highlighting and synthesizer playback. The default product configuration uses the pinned same-origin soundfont path. A player-mode injection seam exists only so compatibility CI can exercise render/cursor behavior deterministically without depending on runner audio.

Play and Stop call alphaTab's player API. Existing alphaTab synth diagnostics remain the separate browser-audio compatibility evidence.

## Cursor, selection and issue panel

Player position events update a visible measure/tick status. For a current PASS renderer document, the workbench can focus a structured issue location by `measureIndex` or visible measure number and moves alphaTab's tick cursor to the first musical beat of that measure.

alphaTab `noteMouseDown` is enabled through note bounds. On the supported MONO_V1 route, the clicked renderer note is resolved by master-bar index plus beat index and then checked against the current canonical measure/event. Pitch controls are populated only from the canonical event, not from the renderer model. Tied notes remain selectable for diagnosis but their Apply action is disabled until coordinated tie-chain editing exists.

The issue panel consumes only structured runtime issues. A blocked conversion or edit does not invent or repair notes.

## Structured edit contract

The edit runtime accepts only bounded cumulative `REPLACE_PITCH` commands with matching `measureIndex`, `eventIndex` and deterministic `eventId`. It validates the immutable input SHA, reparses the original source, replays each accepted command, recreates the canonical music document, reruns guitar candidate generation and fingering optimization, serializes a fresh notation+TAB MusicXML document and returns that complete result.

Current deliberate limits:

- MONO_V1 only;
- pitch replacement only;
- rest targets rejected;
- tied-note targets rejected until tie-chain revisions are available;
- out-of-range guitar pitches fail closed; no automatic octave displacement;
- no independent TAB editing.

## CI evidence

Required gates for this stage:

- complete Node 18/20/22 repository tests, including structured-edit runtime tests;
- static workbench contract proving required controls, local-only assets, no HTML injection APIs, no browser persistence, no browser MusicXML mutation and no internal-engine browser import;
- existing alphaTab importer/SVG/v2/PA-12 compatibility gates;
- existing browser renderer/cursor smoke;
- Guitar TAB Workbench browser smoke proving real upload through `processMusicXmlUpload`, one guitar track/two staves, visible standard notation + TAB, standard tuning and SVG render;
- the same browser smoke selects a real alphaTab note model, maps it to canonical `m1-e1`, changes D#4 to G4 through `processMusicXmlNoteEdit`, verifies revision 1, verifies the canonical fingering position changed and verifies the rebuilt notation+TAB document renders;
- the browser smoke then requests an unplayable C7 edit and proves it is BLOCKED without changing revision 1 or hiding/replacing the accepted G4 score;
- tied-note selection is proven non-applicable;
- alphaTab synthesizer diagnostic remains visible and non-authoritative for runner-specific audio readiness.

## Remaining edit expansion

After this monophonic structured-edit gate is merged, later capability stages may add coordinated tie-chain edits and a separately reviewed polyphonic edit contract. Neither expansion may weaken source identity, fail-closed behavior or the rule that TAB is regenerated from musical source rather than patched independently.
