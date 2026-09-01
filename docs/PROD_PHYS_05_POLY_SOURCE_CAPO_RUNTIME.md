# PROD-PHYS-05 — POLY Source Capo Runtime

An explicit, complete Standard six-string MusicXML configuration with a nonzero bounded `<capo>` now passes through the production POLY upload route.
The runtime carries the resolved configuration to the internal POLY 2.1 producer, selector, sustained path, grace physical-transition model, validator and MusicXML writer.

The resulting internal/application `CanonicalTabResult 2.1.0` records `guitar.capoFret` and `guitar.fretSemantics: "RELATIVE_FROM_CAPO"`. The writer emits the same `<capo>` in the TAB staff details. Both ordinary POLY and grace POLY paths are covered.

The package-root API does not change. Alternate source tunings, nonstandard fretboard profiles, incomplete guitar configuration provenance and malformed capo facts remain fail-closed.
