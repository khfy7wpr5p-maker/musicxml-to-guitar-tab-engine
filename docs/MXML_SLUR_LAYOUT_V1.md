# MXML_SLUR_LAYOUT_V1

Status: `SUPPORTED` for the bounded V1 slur semantic and presentation shapes below.

Base main SHA before implementation: `80c2700aeb5f1503618901e91e552d5c078982ed`.

## Purpose

`CAP_SLUR_LAYOUT_SEPARATION_V1` separates MusicXML slur semantics from engraving/layout metadata without granting slurs musical-duration or guitar-solver authority.

A source slur is preserved as articulation provenance with exact source-event endpoints when its start/stop/continue markers can be paired deterministically. Engraving fields are preserved as presentation metadata only.

The capability does **not** interpret a slur as a tie, sustain instruction, hammer-on, pull-off, slide, legato technique, fingering constraint, string/fret constraint, or solver preference.

## Semantic fields

The bounded V1 semantic identity is:

- `type`: `start`, `stop`, or `continue`
- `number`: explicit `1..16`, or MusicXML default identity `1` when omitted
- source part
- explicit source voice
- explicit source staff
- exact source-event identity after projection

Pairing key:

`part + voice + staff + number`

The implementation does not search for a nearest plausible endpoint across another voice or staff.

## Presentation-only fields

The following source attributes may be preserved when bounded and valid:

- `bezier-x`, `bezier-y`, `bezier-x2`, `bezier-y2`
- `bezier-offset`, `bezier-offset2`
- `default-x`, `default-y`
- `relative-x`, `relative-y`
- `placement`
- `orientation`
- `line-type`
- `dash-length`, `space-length`
- `color`
- `font-family`, `font-style`, `font-size`, `font-weight`

These values are provenance/presentation facts only. They cannot change:

- pitch
- onset
- duration
- tie/sustain state
- voice/staff authority
- chord membership
- guitar string/fret candidates
- left-hand fingering
- solver ranking, cost, or tie-break

## Canonical slur provenance

`PolyphonicSlurProvenance` contains:

- the original bounded slur records
- exact bound `sourceEventId` values
- deterministic slur spans
- presentation metadata
- located pairing issues

Each completed span explicitly declares:

- `authority = ARTICULATION_METADATA_ONLY`
- `affectsDuration = false`
- `createsTie = false`
- `createsGuitarTechnique = false`
- `solverAuthority = false`

## Pairing and review behavior

The runtime pairs only explicitly compatible endpoints.

The following become located `REVIEW_REQUIRED` issues rather than guessed semantics:

- orphan stop
- orphan start
- orphan continue
- duplicate start with the same number/context before closure
- crossing endpoints in one voice/staff context
- missing explicit voice/staff context

A start on one staff and a stop on another staff are not paired merely because their numbers match.

## Fail-closed boundary

The V1 parser is not a wildcard `<slur>` bypass. A slur remains `BLOCKED` through the existing unsupported-feature path when it contains an unapproved shape, including:

- unknown attributes
- duplicate attributes
- foreign-namespace attributes
- child elements
- non-whitespace text
- invalid type/number
- invalid or unbounded presentation values

Only the explicitly validated slur node is removed from the compatibility projection after its evidence has been captured.

## Runtime boundary

Slur provenance is extracted from the runtime-owned parsed-document snapshot inside the existing production compatibility pass. There is no second parse of caller bytes and no source mutation.

A synchronous stack-scoped diagnostics collector carries pairing issues through the same public upload call. Pairing issues may therefore convert an otherwise safe `POLY_V2` result to `REVIEW_REQUIRED` without fabricating a slur interpretation.

## Mudarra corpus evidence

The external development corpus identified Alonso Mudarra — *Conde Claros* slur start/stop markers with Bezier/engraving attributes as the relevant real-world blocker for this capability.

The real source file is not committed by this capability because corpus storage is subject to provenance/licensing policy. CI uses a rights-safe synthetic regression representing the observed slur shape. Production behavior never depends on filename, path, work title, or source hash.

## Verification

`tests/polyphonicSlurLayoutSeparationV1.test.js` covers:

- simple numbered start/stop pairing
- bounded Bezier/layout preservation
- unchanged source musical facts and final guitar selection
- no tie, duration extension, or guitar-technique inference
- independent same-number slurs in simultaneous voices
- orphan endpoint review
- duplicate-start review
- cross-staff non-pairing
- unknown-shape fail-closed behavior
- rights-safe Mudarra-observed Bezier shape regression
- deterministic output, one runtime pass, and source-byte immutability

## Non-goals

V1 does not:

- infer guitar articulation from generic slur notation
- convert slurs to ties
- change playback duration
- rank or prune guitar candidates
- repair malformed slur numbering
- guess endpoints across voices/staves
- modify source MusicXML bytes
