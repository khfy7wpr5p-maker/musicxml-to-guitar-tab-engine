# UI Stage 1 — Guitar TAB Workbench

Status: product-UI foundation and POLY_V2 selection hardening are active; R8 adds backend-validated exact placement for eligible reduction-unassigned notes.

## Product target

The workbench provides:

1. safe `.musicxml` / `.xml` upload;
2. standard notation above rhythmic guitar TAB;
3. Play / Stop transport;
4. measure and note/beat cursor tracking;
5. a side panel that surfaces structured conversion issues and can focus the affected measure;
6. structured pitch editing followed by deterministic full TAB regeneration.

The browser remains a presentation/controller layer. It never edits raw MusicXML, renderer pitch/fret/string state or CanonicalTabResult data in place.

## Runtime split

Uploads use the bounded application result from `src/app/musicXmlUploadRuntime.js`:

`browser file → bounded application upload endpoint → processMusicXmlUpload → MusicXmlUploadRuntimeResult → alphaTab renderer/player`

MONO_V1 structured edits use:

`clicked renderer note → canonical measure/event identity → /api/edit → processMusicXmlNoteEdit → full canonical rebuild + fingering optimization → new notation+TAB MusicXML → alphaTab reload`

POLY_V2 structured edits use a separate host seam:

`clicked renderer note → fail-closed renderer/source mapping → canonical source-event + simultaneous-group acknowledgement → /api/edit/poly-v2 → processMusicXmlPolyphonicNoteEditV2 → full CanonicalTabResult v2 rebuild + guitar selection → new notation+TAB MusicXML → alphaTab reload`

The package-root API remains unchanged. PA/v2 producers, GuitarSet shadow logic, selector internals and mutation runtimes are not imported into browser code.

## Browser safety rules

- client-side upload mirrors the 5 MiB and `.musicxml` / `.xml` limits; the server/runtime boundary remains authoritative;
- one owned source-byte snapshot is kept in memory only and copied into host callbacks;
- every edit is tied to the exact upload SHA-256 and replays the complete bounded command chain from the immutable source;
- revision history is capped at 128 commands;
- no remote CDN dependency is embedded in source;
- alphaTab assets and soundfont remain same-origin;
- issue/runtime text is inserted only with `textContent`;
- no localStorage, sessionStorage, IndexedDB or cookies are introduced;
- browser code never imports engine internals and never mutates raw MusicXML or alphaTab fret/string/pitch fields;
- failed/BLOCKED uploads do not leave a stale score visible;
- BLOCKED edits preserve the last accepted score and revision history;
- POLY_V2 does not reuse the MONO_V1 edit endpoint.

## Viewer, playback and selection

`web/guitar-tab-workbench/workbench.js` mounts alphaTab with SVG rendering, standard notation + tablature, note bounds, cursor/highlighting and player support.

MONO_V1 selection remains master-bar index + beat/event index checked against the canonical v1 event.

POLY_V2 selection is intentionally conservative. A clicked alphaTab note is accepted only when all of the following hold:

- the renderer exposes a stable measure index;
- its active renderer voice has a deterministic ordinal;
- active renderer and canonical source-track counts agree for the measure;
- the renderer voice maps to the canonical track ordering used by the MusicXML writer (staff, then source voice);
- the pitched-onset ordinal inside that renderer voice maps to the same ordinal in the canonical source track;
- the renderer and canonical chord MIDI multisets at that onset match exactly;
- a duplicate same-MIDI ordinal is used only after voice, onset and chord evidence agree;
- the resulting source event id and source order match exactly;
- the source event resolves to at most one canonical simultaneous group;
- the complete ordered simultaneous-group membership can be acknowledged from `canonicalTabResult.simultaneousGroups`.

UI-07 therefore permits same-pitch notes at one onset only when renderer voice, source track, per-voice onset, chord fingerprint and duplicate ordinal prove one exact source event. Any disagreement remains ambiguous and fails closed with no selected edit target.

## Structured edit contracts

### MONO_V1

The monophonic runtime accepts bounded cumulative pitch revisions with exact `measureIndex`, `eventIndex` and deterministic `eventId`. Valid tie chains may be changed atomically as `REPLACE_TIE_CHAIN_PITCH`; malformed tie topology fails closed. Full fingering optimization and notation+TAB serialization run again after every accepted revision.

### POLY_V2

Before calling `/api/edit/poly-v2`, the runtime host adapter projects every browser command to the bounded `MusicXmlPolyphonicNoteEditRuntimeV2` schema:

- `measureIndex`;
- `sourceOrder`;
- deterministic `sourceEventId`;
- canonical `sourceGroupId` or `null`;
- complete ordered `sourceGroupEventIds` acknowledgement;
- complete ordered `sourceTieEventIds` acknowledgement (the selected event alone when untied);
- requested pitch;
- optional exact `selectedPosition { string, fret }` for an already assigned untied note.

`sourceTieEventIds` is evidence, not browser authority. `processMusicXmlPolyphonicNoteEditV2` rebuilds the authoritative sustain graph from immutable source bytes and requires exact ordered equality. It remains authoritative for source identity, group/tie topology, immutable replay, playability and canonical regeneration.

For a partial-arrangement `REVIEW_REQUIRED` result, the host uses the backend-created `ReviewEditableTabProjection` only as the legacy core's selection model. The authoritative result remains `REVIEW_REQUIRED`; an accepted edit either regenerates another provisional result or reaches an ordinary fully selected result while retaining any outstanding review issues.

Valid retained POLY_V2 ties use the sustained canonical selector. R7 permits pitch replacement only when the complete chain identity is acknowledged, and changes all segments atomically. Tied duration and explicit position edits remain disabled.

Accepted POLY_V2 edits rebuild every PRESERVED source-note disposition, guitar shape/fingering selection and the complete notation+TAB MusicXML document. A requested position filters backend candidates and must round-trip exactly. Silent movement, omission or octave displacement remains forbidden.

R8 adds an “Unassigned notes” list to the existing Fingering panel. Its entries come only from backend-validated `assignmentEligible` projection facts; the browser does not infer eligibility from a missing TAB glyph. Selecting an entry and submitting string/fret adds explicit `ASSIGN_OMITTED` intent. The backend preserves all prior assigned positions, retains the target if the whole shape is physically valid, and regenerates provisional notation+TAB. Semantic omissions, tied groups and grace notes never enter this list.

## Current limits

- structured edits cover pitch replacement, exact string/fret override for an assigned untied POLY_V2 note, explicit placement of an eligible reduction-unassigned note, untied duration, and atomic pitch replacement for a valid tied chain;
- rest targets are rejected;
- unplayable pitches fail closed; there is no automatic octave displacement;
- finger-number editing and assigning a previously omitted note remain unavailable;
- same-pitch POLY_V2 notes remain non-editable whenever voice/onset/chord/duplicate identity evidence is incomplete or inconsistent;
- malformed tie topology and incomplete tie identity remain fail-closed; tied-chain duration and explicit position remain unavailable;
- no production deployment server is introduced by this UI stage.

## CI evidence

Required gates for this line:

- full Node 18/20/22 repository tests;
- static browser contract: local-only assets, no HTML injection APIs, no persistence, no MusicXML/TAB mutation and no browser engine import;
- alphaTab importer/SVG/v2/PA-12 compatibility;
- browser renderer/cursor smoke;
- MONO_V1 Workbench upload/edit/regeneration smoke;
- dedicated atomic MONO_V1 tie-chain browser smoke;
- dedicated POLY_V2 browser smoke proving real PA-12 upload, exact source/group mapping, fail-closed ambiguous mapping, C4→E4 accepted regeneration, zero MONO edit calls, and a later unplayable C7 request preserving the accepted revision;
- UI-07/R7 static and real-Chromium gates proving voice/onset/chord/duplicate identity, distinct same-pitch source-event selection, complete tie identity transport and atomic tied-chain pitch regeneration;
- static GitHub Pages preview build/smoke remains read-only and independent of runtime edit authority;
- alphaTab synthesizer diagnostic remains non-authoritative for runner-specific audio readiness.

## Remaining expansion

The next POLY_V2 capability work may address retained sustained sonorities only through a separately versioned selector and edit contract. Broader chord, articulation or TAB-edit authority remains out of scope. Future work must preserve exact-SHA replay, complete ordered group acknowledgement, fail-closed renderer/source identity and full deterministic regeneration.
