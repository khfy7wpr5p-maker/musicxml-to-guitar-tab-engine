# UI-RUNTIME-01 — Secure MusicXML Upload + Automatic MONO/POLY Dispatch

Status: active internal application seam. This stage does not change the package-root public API.

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
4. Polyphonic application routing uses the explicit lower-register arrangement policy in `poly-upload-low-register-octave-displacement-contract.md`: only a source below E2 that reaches the fixed standard-guitar register with exactly `+12` semitones may be `OCTAVE_DISPLACED`.
5. High notes and notes that still fall below E2 after exactly one octave fail closed with source measure/event evidence.
6. The application boundary asserts after v2 conversion that every non-representation source note is either preserved exactly or has the authorized exact `+12` lower-register target MIDI; all other musical changes fail closed.

## Two-staff notation/TAB mirror rule

Before the restricted PA-2 projector runs on the original document, the runtime can derive two independently projected single-staff views when staff 2 has an explicit TAB clef. The views are admitted only for the bounded writer-shaped layout and only when pitch, onset, duration, rest/note identity, chord relation and ties match exactly after the declared zero-chromatic guitar octave transposition is applied. The staff-separating `backup` must also prove an exact cursor reset.

When that proof succeeds, staff 2 is classified as duplicate representation before projection and the notation view becomes the single musical source stream; the writer then recreates standard notation + rhythmic TAB. Unknown techniques, malformed presentation metadata, interleaved staff streams, partial cursor resets and near-mirror pitch/rhythm changes all fail closed. No heuristic fuzzy deduplication is allowed.

If exact equality is not proven, the runtime does not discard either staff. The ordinary restricted projector decides whether the unnormalized document is currently supported and otherwise returns a structured capability error.

The current PA-2 semantic profile is still intentionally narrow; real-world Guitar Pro/MusicXML metadata compatibility is a separate follow-up gate and this stage must report unsupported features rather than weaken the parser.

## Result contract

`MusicXmlUploadRuntimeResult 1.0.0` currently reports:

- `status`: `PASS` or `BLOCKED`
- `route`: `MONO_V1`, `POLY_V2`, or `UNRESOLVED`
- exact input identity (`fileName`, `byteLength`, `sha256`) for bounded uploads;
- oversized inputs are rejected before copying or hashing and report `sha256: null`;
- structured preflight/issues with measure/event fields when available
- representation-normalization facts
- canonical result on success
- renderer MusicXML on success

Stage 01 separately establishes the application score-state contract in
[`reviewable-score-state-contract.md`](reviewable-score-state-contract.md). It adds
`REVIEW_REQUIRED` as a state independent of route, without retroactively relabeling
current upload failures. A later OMR evidence producer is required before upload
results may emit that state.

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
- generated notation + TAB MusicXML round-trips through pre-projection exact-mirror normalization;
- near mirrors, partial staff resets and unsupported TAB techniques fail closed without note loss;
- unsafe XML and unsupported extensions fail closed;
- high-register and more-than-one-octave-low polyphonic source pitch report measure/event evidence and are not displaced;
- hostile upload object shapes fail closed without invoking accessors;
- package-root exports remain unchanged;
- complete Node.js 18/20/22 regression suite passes;
- alphaTab MusicXML import/SVG and browser cursor compatibility gates remain green.
