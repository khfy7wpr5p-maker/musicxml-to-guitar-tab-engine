# PROD-PHYS-01 — source guitar configuration guard

The upload runtime accepts only the fixed Standard six-string guitar profile.
A MusicXML `capo` declaration changes every physical fret calculation;
silently solving that source as capo-0 would make the generated TAB physically
misleading.

Before either MONO_V1 or POLY_V2 conversion, the runtime now:

1. detects an explicit source `capo` declaration and parses the existing
   complete source configuration provenance;
2. resolves it through the existing authority contract; and
3. accepts the Standard profile with a bounded capo value, and rejects any
   source tuning or fretboard-profile change.

An explicit non-zero Standard-tuned capo is carried through the MONO 1.1 and
internal/application POLY 2.1 production paths. A `capo` declaration without a
complete, internally consistent six-string profile remains fail-closed under
the existing provenance errors. Existing capo-absent `staff-tuning` metadata
remains provenance-only for Guitar Pro compatibility; this bounded behavior
does not reinterpret or support custom tuning. Source `technical/string` and
`technical/fret` remain provenance only, never solver authority.

This remains a safety boundary, not custom-tuning support. Any alternate
tuning or source fretboard-profile support requires one coherent change to the
candidate, sustained-path, Canonical V2, and writer contracts.
