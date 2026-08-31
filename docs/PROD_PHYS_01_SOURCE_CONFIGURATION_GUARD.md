# PROD-PHYS-01 — source guitar configuration guard

The upload runtime currently produces Canonical V2 and MusicXML only for the
fixed Standard, capo-0 guitar profile. A MusicXML `capo` declaration changes
every physical fret calculation; silently solving that source as capo-0 would
make the generated TAB physically misleading.

Before either MONO_V1 or POLY_V2 conversion, the runtime now:

1. detects an explicit source `capo` declaration and parses the existing
   complete source configuration provenance;
2. resolves it through the existing authority contract; and
3. accepts only the Standard/capo-0 profile used by the full production path.

An explicit non-zero capo is blocked with
`UNSUPPORTED_GUITAR_CONFIGURATION_PROFILE`. A `capo` declaration without a
complete, internally consistent six-string profile also remains fail-closed
under the existing provenance errors. Existing capo-absent `staff-tuning`
metadata remains provenance-only for Guitar Pro compatibility; this bounded
slice intentionally does not reinterpret or support custom tuning. Source
`technical/string` and `technical/fret` remain provenance only, never solver
authority.

This is a safety boundary, not custom-tuning or capo support. Enabling either
profile requires one coherent change to the candidate, sustained-path,
Canonical V2, and writer contracts.
