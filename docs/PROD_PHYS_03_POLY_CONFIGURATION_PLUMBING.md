# PROD-PHYS-03 — POLY Configuration Plumbing

This internal slice threads one caller-supplied `guitarOptions` value through the existing POLY physical-selection chain without changing source acceptance or public runtime behavior.

Covered paths:

- PA-7 voicing candidates → PA-8 left-hand shapes → PA-9 physical validation;
- deterministic non-sustained final selection;
- sustained tie/overlap final selection.

The same options are consumed by candidate generation and physical MIDI validation. Tests prove that a capo-aware position selected upstream is validated and preserved downstream on both final-selection routes.

This slice does **not**:

- accept POLY source capo or alternate tuning in the upload runtime;
- change `CanonicalTabResult 2.0.0`;
- change the V2 MusicXML writer;
- expose a new package-root API;
- alter the default standard-guitar result.

Source acceptance remains fail-closed until the V2 result contract and writer serialize the same complete configuration.
