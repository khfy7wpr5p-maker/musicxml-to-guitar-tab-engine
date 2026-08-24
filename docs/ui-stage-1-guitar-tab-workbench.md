# UI Stage 1 — Guitar TAB Workbench

Status: merged product-UI foundation built on `UI-RUNTIME-01`; UI Platform 01–05 extends its presentation and preview/deployment shell without changing musical authority.

## Product target

The first workbench is deliberately narrow:

1. safe `.musicxml` / `.xml` upload;
2. standard notation above rhythmic guitar TAB;
3. Play / Stop transport;
4. measure and note/beat cursor tracking;
5. a side panel that surfaces structured conversion issues and can focus the affected measure;
6. structured note editing followed by deterministic TAB regeneration.

Items 1–6 are merged for the guarded monophonic v1 route. A rendered note or TAB number is mapped back to a canonical event identity, the requested pitch is submitted as a bounded revision command, and the engine rebuilds the canonical result and renderer MusicXML before the workbench reloads notation and TAB together.

## Runtime split

The browser layer does not import internal engine modules. Uploads use the bounded application result from `src/app/musicXmlUploadRuntime.js`:

`browser file → bounded application upload endpoint → processMusicXmlUpload → MusicXmlUploadRuntimeResult → alphaTab renderer/player`

Structured edits use a separate host seam and internal application runtime:

`clicked renderer note → canonical measure/event identity → bounded edit request → processMusicXmlNoteEdit → full canonical rebuild + fingering optimization → new notation+TAB MusicXML → alphaTab reload`

The package-root API remains unchanged. PA/v2, GuitarSet shadow, deterministic selector internals and canonical producers are not exposed to the browser.

The runtime page targets same-origin `/api/upload` and `/api/edit` host seams rather than embedding the engine in browser JavaScript. The edit host contract sends the immutable source bytes, the exact source SHA-256 and the cumulative structured command list.

UI Platform 01–05 adds host adapters and controller facades around this verified browser core. Runtime mode keeps the same host seams. GitHub Pages preview mode is a separate read-only adapter that accepts only a CI-generated PASS result and performs no browser conversion or edit request. See `docs/ui-platform-github-pages-preview.md`.

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
- a BLOCKED edit does not replace the current valid score or revision history; it surfaces the structured issue and keeps the last accepted renderer document visible;
- Pages preview is visibly labeled, hides runtime upload, has a read-only edit adapter and is generated from a fixed repository fixture in CI.

## Viewer and playback

`web/guitar-tab-workbench/workbench.js` mounts an alphaTab `AlphaTabApi` with SVG rendering, standard notation + tablature, note bounds, cursor/highlighting and synthesizer playback. The default runtime product configuration uses the pinned same-origin soundfont path. A player-mode injection seam exists so compatibility and static-preview CI can exercise render/cursor behavior deterministically without granting audio authority.

Play and Stop call alphaTab's player API. Existing alphaTab synth diagnostics remain separate browser-audio compatibility evidence.

## Cursor, selection and issue panel

Player position events update a visible measure/tick status. For a current PASS renderer document, the workbench can focus a structured issue location by `measureIndex` or visible measure number and moves alphaTab's tick cursor to the first musical beat of that measure.

alphaTab `noteMouseDown` is enabled through note bounds. On the supported MONO_V1 route, the clicked renderer note is resolved by master-bar index plus beat index and then checked against the current canonical measure/event. Pitch controls are populated only from the canonical event, not from the renderer model. The current browser editor keeps tied notes selectable for diagnosis but disables Apply for them; the internal note-edit runtime may support a broader guarded atomic tie-chain operation without that capability automatically becoming browser/UI authority.

The issue panel consumes only structured runtime issues. A blocked conversion or edit does not invent or repair notes.

## Structured edit contract

The edit runtime accepts bounded cumulative pitch-revision commands with matching `measureIndex`, `eventIndex` and deterministic `eventId`. It validates the immutable input SHA, reparses the original source, replays each accepted command, recreates the canonical music document, reruns guitar candidate generation and fingering optimization, serializes a fresh notation+TAB MusicXML document and returns that complete result. Runtime v1.1 can apply a validated adjacent tie chain atomically and verifies one regenerated string/fret position across the chain; this does not by itself enable tied-note Apply in the browser Workbench.

Current browser/UI limits:

- MONO_V1 only;
- pitch replacement only;
- rest targets rejected;
- direct tied-note Apply remains disabled in the current Workbench UI even though the guarded runtime supports atomic validated tie-chain revisions;
- out-of-range guitar pitches fail closed; no automatic octave displacement;
- no independent TAB editing.

## CI evidence

Required gates for the Workbench and UI Platform line:

- complete Node 18/20/22 repository tests, including structured-edit runtime and UI/Pages contract tests;
- static workbench contract proving required controls, local-only assets, no HTML injection APIs, no browser persistence, no browser MusicXML mutation and no internal-engine browser import;
- existing alphaTab importer/SVG/v2/PA-12 compatibility gates;
- existing browser renderer/cursor smoke;
- Guitar TAB Workbench browser smoke proving real upload through `processMusicXmlUpload`, one guitar track/two staves, visible standard notation + TAB, standard tuning and SVG render;
- the same runtime browser smoke proves accepted deterministic note revision/TAB regeneration and blocked-edit score preservation;
- a separate static Pages browser smoke proves PREVIEW/PASS/MONO_V1, one track/two staves, SVG output, hidden runtime upload, disabled edit authority and zero `/api/` requests;
- alphaTab synthesizer diagnostic remains visible and non-authoritative for runner-specific audio readiness.

## Remaining edit expansion

A future browser/UI capability gate may expose the already-guarded runtime tie-chain operation, and a separately reviewed polyphonic edit contract may follow later. Neither expansion may weaken source identity, fail-closed behavior or the rule that TAB is regenerated from musical source rather than patched independently.
