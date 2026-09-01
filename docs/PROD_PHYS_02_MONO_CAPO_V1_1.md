# PROD-PHYS-02 — MONO Source Capo V1.1

`CanonicalTabResult 1.0.0` remains frozen. An explicit nonzero MusicXML `<capo>` on a standard six-string MONO upload produces exact schema version `1.1.0`.

The `guitar` object in `1.1.0` adds the required fields `capoFret` and `fretSemantics: "RELATIVE_FROM_CAPO"`. Every selected and alternative position is validated with `open-string MIDI + capoFret + relative fret`; the MusicXML writer emits the same `<capo>` value under the TAB `staff-details` element.

This slice does not enable alternate tunings, nonstandard fret ranges, or POLY/V2 capo processing. Those inputs remain fail-closed because their complete selection and writer contracts have not been extended.
