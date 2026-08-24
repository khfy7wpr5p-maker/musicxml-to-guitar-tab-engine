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

Items 1–5 are implemented by this stage slice. Item 6 remains a separate structured-edit gate because changing musical source data is an authoritative mutation boundary and must not be implemented as ad-hoc DOM or raw-XML string editing.

## Runtime split

The browser layer does not import internal engine modules. It receives only the bounded application result from `src/app/musicXmlUploadRuntime.js`:

`browser file → bounded application upload endpoint → processMusicXmlUpload → MusicXmlUploadRuntimeResult → alphaTab renderer/player`

The package-root API remains unchanged. PA/v2, GuitarSet shadow, deterministic selector internals and canonical producers are not exposed to the browser.

## Browser safety rules

- client-side upload gate mirrors the existing 5 MiB ceiling and `.musicxml` / `.xml` extension boundary, but the server/runtime gate remains authoritative;
- no remote CDN dependency is embedded in the workbench source;
- alphaTab assets and soundfont are expected from a same-origin application asset route;
- issue text is rendered only through `textContent`; no runtime issue or MusicXML field is inserted as HTML;
- no browser persistence, cookies, localStorage, sessionStorage or IndexedDB are introduced;
- no engine, learning or canonical internal module is imported into browser code;
- renderer/player errors surface in the issue panel rather than silently changing the score.

## Viewer and playback

`web/guitar-tab-workbench/workbench.js` mounts an alphaTab `AlphaTabApi` with SVG rendering, standard notation + tablature, note bounds, cursor/highlighting and synthesizer playback. The default product configuration uses the pinned same-origin soundfont path. A player-mode injection seam exists only so compatibility CI can exercise render/cursor behavior deterministically without depending on runner audio.

Play and Stop call alphaTab's player API. Existing alphaTab synth diagnostics remain the separate browser-audio compatibility evidence.

## Cursor and issue panel

Player position events update a visible measure/tick status. The workbench can focus a structured issue location by `measureIndex` or measure number and moves alphaTab's tick cursor to the first musical beat of that measure.

The side panel consumes only `preflight.issues`. A blocked conversion does not invent or repair notes; it displays the runtime's structured error and leaves musical authority with the engine.

## CI evidence

Required gates for this slice:

- complete Node 18/20/22 repository tests;
- static workbench contract test proving required controls, local-only assets, no HTML injection APIs, no browser persistence and no internal-engine browser import;
- existing alphaTab importer/SVG/v2/PA-12 compatibility gates;
- existing browser renderer/cursor smoke;
- new Guitar TAB Workbench browser smoke proving actual upload through `processMusicXmlUpload`, 1 track / 2 staves / 5 measures, visible standard notation + TAB, standard tuning, SVG render, measure focus and structured issue-panel behavior;
- alphaTab synthesizer diagnostic remains visible and non-authoritative for runner-specific audio readiness.

## Structured edit gate — next

UI Stage 1 item 6 must use a separately reviewed edit contract:

`selected source event → validated edit command → immutable revised musical source → full deterministic reconversion → new CanonicalTabResult → new notation+TAB MusicXML → renderer reload`

The editor must preserve source-event identity/provenance, reject unsupported edits fail-closed, never patch TAB independently, and never let learned/shadow scores become edit authority. Raw string replacement inside MusicXML and direct mutation of alphaTab's render model are explicitly forbidden.
