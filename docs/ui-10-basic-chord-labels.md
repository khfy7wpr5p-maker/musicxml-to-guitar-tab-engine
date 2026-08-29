# UI-10 Basic Chord Labels

The Workbench derives a bounded, deterministic harmony sidecar from exact simultaneous pitched
source events. It recognizes only major, minor, diminished and augmented triads plus dominant,
major, minor, half-diminished and diminished sevenths. Root spelling comes from MusicXML pitch
spelling, octave doublings collapse by pitch class, and a unique lowest non-root pitch becomes a
slash bass.

Supported explicit MusicXML `harmony` values take precedence at the same onset. Unsupported
degrees, extensions, offsets, staffs or malformed harmony structures fail closed. Incomplete,
extra-tone or enharmonically conflicting sets remain unlabeled; the layer does not rank guesses or
use learned authority.

The sidecar is internal: it does not change CanonicalTabResult v1/v2 or package-root exports. The
v2 MusicXML writer emits one staff-1 harmony timing lane, after which alphaTab imports the symbol
and renders the same notation/TAB score. POLY_V2 edit/regenerate rebuilds derived labels from the
revised immutable source while preserving supported explicit harmony.
