# Guitar Pro MusicXML export-profile fixture provenance

This fixture is intentionally synthetic and contains no copied song or proprietary Guitar Pro score bytes.

It models MusicXML structures publicly documented as emitted or handled by Guitar Pro: TAB clef metadata, six-string `staff-tuning`, and per-note `technical/string/fret` provenance. Target TAB positions are deliberately not trusted; the engine must recompute them from explicit pitch.

The fixture intentionally contains one exact 1/4 measure and one E4 quarter note. Its source fingering is deliberately `string 6 / fret 0`, which does not produce E4 on standard tuning. This proves the compatibility layer treats source Guitar Pro fingering as provenance and requires the target guitar realization to be recomputed from explicit pitch.

External evidence reviewed on 2026-08-29:

- MusicXML software registry: Guitar Pro has MusicXML read/write support.
- Arobas Music Guitar Pro release notes: MusicXML fingering/export behavior is actively supported.
- Open literature showing a Guitar Pro 5 MusicXML export profile with TAB clef, staff tuning and technical guitar notation.
- `leocaseiro/notation-converter` (MPL-2.0), pinned repository tree `25a8c140246022f52bd16ceee421c3f5c1c9c7ac`, documents Guitar-Pro-exported MusicXML staff behavior.

Fixture SHA-256:
`e5f8cddbe49f800a9e02c48df7542d68931b8b17cda8079112c8cb1bf72b6413`

Safety boundary: this is a compatibility-profile regression fixture, not a claim that the bytes were directly exported by a specific Guitar Pro version. Unknown pitch/rhythm-changing semantics remain fail-closed.
