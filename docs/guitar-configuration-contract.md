# GuitarConfiguration 1.0

## Status

This document defines the internal `GuitarConfiguration` contract used by the deterministic guitar candidate layer.

- Contract version: `1.0.0`
- Implementation module: `src/guitar/tuning.js`
- Public package-root constructor/export: not part of this milestone
- CanonicalTabResult schema version: unchanged (`1.0.0`)

## Purpose

`GuitarConfiguration` centralizes the physical six-string instrument assumptions consumed by fretboard candidate generation. It does not select fingering, change MusicXML, or authorize learned components to create strings or frets.

## Contract fields

The runtime configuration data shape remains backward compatible:

- `tuning`: exactly six open-string definitions
- `minimumFret`: non-negative integer
- `maximumFret`: non-negative integer greater than or equal to `minimumFret`

Each tuning entry contains:

- `number`: unique integer from 1 through 6
- `midi`: integer from 0 through 127
- `pitch`: scientific pitch name or `null`

The normalized tuning is ordered by ascending string number and the returned configuration graph is immutable.

## Version identity

`src/guitar/tuning.js` exports the internal constant:

- `GUITAR_CONFIGURATION_VERSION = '1.0.0'`

The version identifies the validation and normalization contract. It is intentionally not added to the package-root public API in this milestone. Public integration/version-reference policy belongs to the separately approved `Integration Contract v1` gate.

## Physical consistency rules

1. Exactly six strings are required.
2. String numbers must be unique and within 1–6.
3. MIDI values must be integers within 0–127.
4. Fret limits must be non-negative integers and `minimumFret <= maximumFret`.
5. When a textual open-string pitch is supplied, it must be a valid scientific pitch name.
6. When both pitch and MIDI are supplied, they must describe the same sounding pitch.
7. MIDI-only custom tunings remain supported; normalized `pitch` is then `null`.

Pitch/MIDI disagreement fails closed with `INVALID_GUITAR_CONFIGURATION`.

## Standard tuning

The default six-string tuning remains unchanged:

| String | Pitch | MIDI |
|---:|---|---:|
| 6 | E2 | 40 |
| 5 | A2 | 45 |
| 4 | D3 | 50 |
| 3 | G3 | 55 |
| 2 | B3 | 59 |
| 1 | E4 | 64 |

Default fret range remains 0–20.

## Compatibility boundary

This milestone deliberately does **not**:

- add fields to `CanonicalTabResult.guitar`,
- change `CanonicalTabResult 1.0.0` or its JSON Schema,
- expose `GuitarConfigurationError` publicly,
- expose a public configuration constructor,
- alter candidate generation or optimizer ranking,
- add alternative-tuning presets beyond the existing custom tuning input,
- add chord, barre, left-hand finger, UI, HTTP, OMR, or SesliTab behavior.

The existing canonical guitar metadata remains `tuning`, `minimumFret`, and `maximumFret` only.

## Future integration rule

`Integration Contract v1` may reference this contract version, but must not infer authority to mutate canonical music, physical validators, candidate membership, or deterministic optimizer rules.
