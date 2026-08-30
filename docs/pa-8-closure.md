# PA-8 Closure — Left-Hand Shape / Finger / Barre Model

PA-8 is closed as an internal deterministic foundation. It does not make polyphonic conversion public and does not authorize PA-9.

## Authoritative runtime merge

- runtime PR: #95 — `feat(PA-8): add deterministic left-hand shape model`
- merge method: rebase
- final pre-merge head: `5a61bc190df7d27b7d54bd4775a9a5605ca28d5e`
- merged `main` SHA: `a009709cd9f9522b1f572846526a7f593bf51717`
- merged tree: `6649ff950e96fe4425518b9338108bd8d641747b`
- runtime changed surface: exactly four new PA-8 files
  - `docs/pa-8-left-hand-shape-contract.md`
  - `src/music/leftHandShapeModel.js`
  - `tests/leftHandShapeModel.test.js`
  - `tests/leftHandShapeModelHardening.test.js`

## Red-first evidence

- red-first head: `04dc6193c0804404a35952614ba8823409642fa0`
- Tests #658: `FAILURE` on Node.js 18/20/22 as expected
- the new PA-8 test imported `../src/music/leftHandShapeModel` before that production module existed
- pre-existing repository tests remained passing in the observed red-first run; the intended new capability was the failing surface

## Final exact-head evidence

At exact PA-8 final head `5a61bc190df7d27b7d54bd4775a9a5605ca28d5e`:

- Tests #660: `SUCCESS`
  - Node.js 18: success
  - Node.js 20: success
  - Node.js 22: success
- MusicXML Compatibility #470: `SUCCESS`
  - complete repository tests + alphaTab import/SVG on Node.js 18/20/22: success
  - browser renderer/cursor workflow job: success
  - alphaTab synthesizer diagnostic workflow job: success at workflow/job level only; this is not production playback-readiness evidence
  - MuseScore CLI availability check: success only; this does not establish MuseScore import, semantic round-trip or PDF support
- independent final review: no remaining P1/P2 blocker found

## Post-merge evidence

At exact merged runtime `main` SHA `a009709cd9f9522b1f572846526a7f593bf51717`:

- Tests #661: `SUCCESS`
- event: `push`
- branch: `main`

No post-merge MusicXML Compatibility run is claimed unless separately observed later.

## Internal contract now present

PA-8 adds internal `LeftHandShapeModel 1.0.0` with policy `ORDERED_FRET_FINGER_BARRE_1.0`.

The model:

- recomputes PA-7 `GuitarVoicingCandidateModel 1.0.0` internally from source truth + arrangement decisions; caller-supplied PA-7 output is not authority
- preserves exact PA-7 voicing candidate identity and source-event / target-MIDI / string / fret facts
- uses finger `0` for open strings
- uses fretting fingers `1..4` for fretted positions
- forbids one finger from spanning different frets
- applies a deterministic ordered-finger policy across different frets
- records explicit `PARTIAL_BARRE` and `FULL_BARRE` structures
- rejects barre assignments that would conflict with an active pitch inside the barre span
- permits zero valid shape candidates rather than mutating or silently dropping notes
- uses deterministic candidate identifiers/order
- has a fixed per-source-group 20,000 shape-candidate ceiling
- has a fixed per-source-group 100,000 complete finger-assignment-attempt ceiling
- reuses the existing optional `ProcessingRuntime` deadline/cancellation boundary
- returns deeply immutable output

## Hardening evidence

Focused PA-8 tests cover:

- hostile source and hostile raw arrangement-decision rejection without executing hostile getters
- open-string finger-zero behavior
- repeated same-fret finger use and barre representation
- five distinct frets producing zero valid structural shape candidates rather than source mutation
- real upstream six-note enumeration reaching the assignment-attempt ceiling fail-closed at 100,001
- real multi-group upstream enumeration reaching the shape-candidate ceiling fail-closed at 20,001
- deadline and cancellation propagation
- deep immutability
- absence of later-gate/final-selection authority fields

## Authority boundary

PA-8 is a structural left-hand candidate model only. It does **not** establish:

- ergonomic comfort
- anatomical reach
- hand-position quality
- difficulty score
- physical-playability approval
- ranking/preference score
- final voicing or fingering selection
- public polyphonic conversion
- writer authority
- `CanonicalTabResult 1.0.0` mutation

Those responsibilities remain outside PA-8. In particular, PA-9 Physical Playability Validator v2 remains a separately approved future gate.

## Public compatibility boundary

PA-8 does not modify the package-root public API, the current public monophonic conversion path, writers, parser rejection rules, deterministic public optimizer, or `CanonicalTabResult 1.0.0`.

The package-root public conversion path remains intentionally fail-closed for unsupported polyphonic structures.

## Real uploaded-file limitation

No previously uploaded real MusicXML file is claimed to have been executed through PA-8 as genuine end-to-end evidence during this closure.

## Closure state

- PA-8 runtime: `MERGED_INTERNAL`
- PA-8 final exact-head CI: `VERIFIED`
- PA-8 post-merge Tests: `VERIFIED`
- public polyphonic API: unchanged / not implemented
- PA-9: `NOT_STARTED`
- branch cleanup: not authorized by PA-8 merge approval
