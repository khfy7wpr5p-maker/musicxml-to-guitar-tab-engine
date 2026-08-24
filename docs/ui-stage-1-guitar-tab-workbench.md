# UI Stage 1 — Guitar TAB Workbench

Status: merged product-UI foundation with guarded MONO_V1 structured editing; UI Platform 01–05 extends the presentation and static preview/deployment shell without changing musical authority.

## Product target

The workbench provides:

1. safe `.musicxml` / `.xml` upload;
2. standard notation above rhythmic guitar TAB;
3. Play / Stop transport;
4. measure and note/beat cursor tracking;
5. a side panel that surfaces structured conversion issues and can focus the affected measure;
6. structured note editing followed by deterministic TAB regeneration.

Items 1–6 are merged for ordinary MONO_V1 pitch edits. A rendered note or TAB number is mapped back to a canonical event identity, the requested pitch is submitted as a bounded revision command, and the engine rebuilds the canonical result and renderer MusicXML before the workbench reloads notation and TAB together.

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

## Viewer, playback and selection

`web/guitar-tab-workbench/workbench.js` mounts an alphaTab `AlphaTabApi` with SVG rendering, standard notation + tablature, note bounds, cursor/highlighting and synthesizer playback. The default runtime product configuration uses the pinned same-origin soundfont path. A player-mode injection seam exists so compatibility and static-preview CI can exercise render/cursor behavior deterministically without granting audio authority.

Player position events update a visible measure/tick status. For a current PASS renderer document, the workbench can focus a structured issue location by `measureIndex` or visible measure number and moves alphaTab's tick cursor to the first musical beat of that measure.

alphaTab `noteMouseDown` is enabled through note bounds. On the supported MONO_V1 route, the clicked renderer note is resolved by master-bar index plus beat index and checked against the current canonical measure/event. Pitch controls are populated only from the canonical event, never from renderer pitch/fret/string data.

## Structured edit contract

The edit runtime accepts bounded cumulative pitch-replacement commands with matching `measureIndex`, `eventIndex` and deterministic `eventId`. It validates the immutable input SHA, reparses the original source, replays each accepted command, recreates the canonical music document, reruns guitar candidate generation and fingering optimization, serializes a fresh notation+TAB MusicXML document and returns that complete result.

Ordinary notes produce `REPLACE_PITCH` revisions.

Valid MONO_V1 tie chains are now a separately guarded extension:

- a tied target must resolve to an immediately adjacent, pitch-identical, timing-contiguous chain;
- tie-start/tie-stop markers must be internally consistent across the complete chain;
- the requested pitch is applied atomically to every member of the validated chain as `REPLACE_TIE_CHAIN_PITCH`;
- malformed, non-contiguous, asymmetric or pitch-mismatched chains fail closed with `INVALID_TIE_CHAIN` before any accepted renderer state is replaced;
- after full TAB regeneration, every member of the tie chain must retain the same selected guitar string and fret, otherwise the revision fails closed with `TIE_CHAIN_FINGERING_INCONSISTENT`.

The browser does not attempt to validate tie topology itself. It enables Apply for a selected tied note and delegates authority to `processMusicXmlNoteEdit`; a BLOCKED response preserves the last accepted score and command history.

Current deliberate limits:

- MONO_V1 browser write authority only;
- pitch replacement only;
- rest targets rejected;
- out-of-range guitar pitches fail closed; no automatic octave displacement;
- no independent TAB editing;
- POLY_V2 browser structured editing remains a separate authority gate even when internal application-runtime work exists.

## CI evidence

Required gates for the Workbench and UI Platform line:

- complete Node 18/20/22 repository tests, including structured-edit and tie-chain runtime tests;
- static workbench contract proving required controls, local-only assets, no HTML injection APIs, no browser persistence, no browser MusicXML mutation and no internal-engine browser import;
- existing alphaTab importer/SVG/v2/PA-12 compatibility gates;
- existing browser renderer/cursor smoke;
- Guitar TAB Workbench browser smoke proving real upload through `processMusicXmlUpload`, one guitar track/two staves, visible standard notation + TAB, standard tuning and SVG render;
- ordinary edit browser evidence selects a real alphaTab note, changes D#4 to G4 through `processMusicXmlNoteEdit`, verifies the revision and regenerated fingering, and proves a subsequent unplayable C7 edit is blocked without replacing the accepted score;
- a dedicated tie-chain browser smoke loads a valid two-measure tied C4, selects the rendered tied note, applies D4 through the same browser edit path, verifies both canonical tie members become D4, verifies `REPLACE_TIE_CHAIN_PITCH`, verifies two affected events, verifies one identical regenerated string/fret across the chain, and verifies the rebuilt notation+TAB renders;
- a separate static Pages browser smoke proves PREVIEW/PASS/MONO_V1, one track/two staves, SVG output, hidden runtime upload, disabled edit authority and zero `/api/` requests;
- alphaTab synthesizer diagnostic remains visible and non-authoritative for runner-specific audio readiness.

## Remaining edit expansion

POLY_V2 browser structured editing remains a separate authority boundary. It must preserve source-event identity across voices/chords, avoid partial chord mutation, rebuild the complete canonical polyphonic result and TAB after every accepted revision, and retain the same fail-closed source-SHA and immutable-replay model. No polyphonic browser write path should be enabled before that contract and its tests are green.
