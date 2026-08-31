# DIR-REHEARSAL-1 — exact display-only rehearsal compatibility

## Scope

The internal `POLY_V2` runtime may ignore a rehearsal label only when it has no
musical, timing, playback, staff, voice, layout, or extension semantics.

## Accepted source shape

```xml
<direction>
  <direction-type><rehearsal>non-empty text</rehearsal></direction-type>
</direction>
```

The three elements above must have no attributes or child elements beyond the
shown structure. Rehearsal text is trimmed only for bounded validation (1–256
characters); it is not interpreted, corrected, or written back to the source.

## Runtime effect

The source bytes and parsed source remain immutable. The runtime removes only
the accepted display-only direction from its internal normalized copy and emits
the provenance warning `measure:direction:rehearsal` through the existing
`RUNTIME_GUITAR_NOTATION_NORMALIZED` path.

## Fail-closed boundary

Any additional attribute or child, including `offset`, `sound`, `staff`,
`voice`, layout metadata, playback/navigation commands, or structured rehearsal
content is unsupported as `direction`. Metronome, dynamics, octave shift, words,
pedals, wedges, and every other direction type retain their existing independent
contracts; this contract does not broaden them.
