# UI-RUNTIME-01 — Secure MusicXML Upload + Automatic MONO/POLY Dispatch

Status: implementation under review. This stage does not change the package-root public API.

## Goal

Create the first product-facing runtime seam for a future upload/viewer/editor application:

`user bytes → exact identity → XML safety → MONO/POLY routing → canonical TAB → renderer MusicXML`

The seam lives at `src/app/musicXmlUploadRuntime.js` and remains an internal application boundary until a later public/application gate approves exposure.

## Upload boundary

Accepted file names end in `.xml` or `.musicxml` (case-insensitive). The boundary accepts bytes only (`Buffer` or `Uint8Array`), records exact byte length and SHA-256 before parsing, rejects path-like file names, and inherits the fixed 5 MiB XML safety ceiling.

Existing XML safety remains authoritative: fatal UTF-8 decoding, entity rejection, trusted MusicXML 4.0.3 DOCTYPE handling, structural budgets, semantic budgets, deadlines and cancellation are not bypassed.

## Dispatch policy

1. Run the existing deterministic monophonic v1 path with the shared `ProcessingRuntime`.
2. If v1 succeeds, emit `MONO_V1` with the exact existing `CanonicalTabResult 1.0.0` and its TAB MusicXML writer output.
3. If v1 is blocked only by a capability boundary, attempt the existing PA-12 polyphonic projection/conversion path.
4. Polyphonic application routing uses an exact-pitch-preserving arrangement policy: source musical notes are `PRESERVED`; automatic octave displacement is forbidden.
5. Notes outside the fixed standard-guitar 0..20-fret register fail closed with source measure/event evidence rather than being silently transposed.
6. The application boundary asserts after v2 conversion that every non-representation source note remains `KEEP`, has zero octave shift, and retains the source MIDI pitch.

## Two-staff notation/TAB mirror rule

The runtime contains a conservative normalization hook for MusicXML where staff 2 is explicitly declared as TAB and is an exact event-for-event mirror of staff 1. Only when both conditions are true may staff-2 note events be classified as duplicate representation and marked `OMITTED` for arrangement purposes. This is not musical-note reduction; the resulting writer recreates standard notation + TAB from one musical event stream.

If exact equality is not proven, the two staves remain independent musical source data. No heuristic fuzzy deduplication is allowed.

The current PA-2 semantic profile is still intentionally narrow; real-world Guitar Pro/MusicXML metadata compatibility is a separate follow-up gate and this stage must report unsupported features rather than weaken the parser.

## Result contract

`MusicXmlUploadRuntimeResult 1.0.0` reports:

- `status`: `PASS` or `BLOCKED`
- `route`: `MONO_V1`, `POLY_V2`, or `UNRESOLVED`
- exact input identity (`fileName`, `byteLength`, `sha256`) for bounded uploads;
- oversized inputs are rejected before copying or hashing and report `sha256: null`;
- structured preflight/issues with measure/event fields when available
- representation-normalization facts
- canonical result on success
- renderer MusicXML on success

## Non-authorities

This stage does not:

- expose PA/v2 functions from `src/index.js`;
- make GuitarSet shadow authoritative;
- permit learned candidate generation/filtering/selection;
- silently omit musical notes;
- silently octave-shift source notes;
- create the alphaTab application viewer;
- create the structured note editor;
- authorize production deployment.

## Acceptance evidence

Required before merge:

- mono route is byte-identity tracked and exactly matches the existing v1 canonical result;
- multi-voice fixture routes through PA-12/v2 with all musical notes kept at zero octave shift;
- unsafe XML and unsupported extensions fail closed;
- out-of-range polyphonic source pitch reports measure/event evidence and is not displaced;
- hostile upload object shapes fail closed without invoking accessors;
- package-root exports remain unchanged;
- complete Node.js 18/20/22 regression suite passes;
- alphaTab MusicXML import/SVG and browser cursor compatibility gates remain green.
