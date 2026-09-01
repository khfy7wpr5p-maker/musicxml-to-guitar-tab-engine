# DIR-REHEARSAL-01 — Exact Display-Only Rehearsal Compatibility

The internal POLY_V2 runtime may ignore a rehearsal label only when it has no
musical, timing, playback, staff, voice, layout or extension semantics.

The accepted source shape is exactly:

```xml
<direction><direction-type><rehearsal>Section A</rehearsal></direction-type></direction>
```

The three elements have no attributes or child elements beyond that shape. The
trimmed rehearsal text must contain 1 through 256 characters. The runtime keeps
the source immutable, removes only that display-only direction from its internal
normalized copy and records `measure:direction:rehearsal` provenance.

Offsets, sounds, staff or voice assignments, placement/layout attributes,
structured rehearsal content and every other direction form remain fail-closed.
