# PROD-PHYS-04 — Internal POLY Capo Canonical 2.1

`CanonicalTabResult 2.0.0` remains exact and unchanged for the standard-guitar internal POLY path.

An internal producer call with an explicit nonzero `capoFret` emits exact schema version `2.1.0`. Its `guitar` object adds the required fields:

- `capoFret` — integer from 1 through the bounded maximum fret;
- `fretSemantics` — exact value `RELATIVE_FROM_CAPO`.

Every retained `selectedPosition` is generated and validated with:

`open-string MIDI + capoFret + relative fret = target MIDI`

The internal V2 MusicXML writer accepts both exact versions. For `2.1.0`, it emits the same `<capo>` value after the six `staff-tuning` entries in TAB staff `staff-details`. Missing, zero, malformed or semantically inconsistent 2.1 facts fail closed. Existing 2.0 artifacts cannot add the new fields.

This slice covers normal chord selection and the sustained/tie fallback. It remains internal and does not:

- accept a source MusicXML capo on the POLY upload route;
- change the public package-root API;
- reinterpret alternate tuning authority;
- modify `CanonicalTabResult 1.0.0` or MONO `1.1.0`;
- expose PA/PS internals.

Source-level POLY capo acceptance requires a later bounded runtime slice that passes already-resolved source authority into this producer and preserves the existing fail-closed tuning-profile rules.
