# UI-09 Document Transposition

The Workbench offers bounded whole-document `-1` and `+1` semitone controls, a standard major/minor
target-key selector, and an explicit sharp/flat spelling preference for semitone moves. The browser
never edits MusicXML: it sends the immutable source bytes and SHA-256 identity to the same-origin
runtime host, which parses, transforms and reconverts the score before alphaTab reloads notation and
TAB.

The transformation updates pitched notes, existing visible accidental elements, key signatures and
supported basic MusicXML harmony roots/basses. Rhythm, measures, voices, simultaneous onset topology,
tie markup and standard-guitar `octave-change=-1` semantics are preserved. Each successful operation
adopts the returned transformed source snapshot, clears cumulative note-edit commands and regenerates
deterministic TAB from that source.

The runtime fails closed for stale source identities, malformed request objects, unsupported MusicXML
structures, unsafe target keys and results that cannot be converted into the supported guitar result.
It is internal Workbench/runtime authority and does not add a package-root API.
