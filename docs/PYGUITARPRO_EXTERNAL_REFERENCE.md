# PyGuitarPro External Reference Contract

**Status:** external reference / corpus evidence only  
**Approved scope:** GP3 / GP4 / GP5 reference extraction  
**Repository:** `Perlence/PyGuitarPro`  
**Observed upstream revision:** `b0a74102cf25a316f2c4ae3d03ffec3c03521358`  

## Purpose

PyGuitarPro may be used as an independent external reference when validating Guitar Pro-derived evidence against MusicXML-to-GuitarTab-Engine behavior. It is not part of production conversion authority.

The useful boundary is intentionally narrow:

- parse GP3 / GP4 / GP5 files outside the production runtime;
- extract structured reference evidence such as track, measure, beat, voice, string, fret, tuning, duration, tie and guitar-technique fields;
- compare those facts with independently produced MusicXML/POLY_V2/CanonicalTabResult evidence;
- use mismatches to identify capability gaps, representation differences or corpus-review targets;
- retain source identity, provenance and deterministic extraction metadata in research/test artifacts where rights permit.

## Allowed evidence fields

When available and unambiguous in the GP source, reference extraction may record:

- track and measure identity;
- beat/onset position as represented by the source format;
- voice index as represented by Guitar Pro;
- string number;
- fret value;
- string tuning/open-string pitch;
- duration and tuplet representation;
- tie state/relationship evidence;
- bend;
- hammer-on / pull-off representation where supported by the format/library model;
- slides;
- harmonics;
- grace notes;
- trill;
- vibrato;
- staccato;
- fingering fields;
- other explicitly represented Guitar Pro technique metadata.

These fields are evidence only. They do not override MusicXML source semantics or engine canonical truth.

## Forbidden uses

PyGuitarPro must not be used to:

- replace the MusicXML parser;
- replace or constrain `PolyphonicSourceModel`;
- replace POLY_V2 routing or status logic;
- replace guitar-position generation;
- replace PA-7 / PA-8 / PA-9 or sustained physical selection;
- supply solver ranking, cost or tie-break policy;
- silently assign strings/frets when source evidence is absent or ambiguous;
- mutate original MusicXML/OMR source facts;
- become a runtime dependency of the production conversion path;
- make a GP-derived answer authoritative merely because PyGuitarPro produced it.

## Polyphony limitation

PyGuitarPro's current `Measure` model exposes `maxVoices = 2`. Therefore its internal object model is not a valid canonical representation for the engine's wider POLY_V2 requirements, including producer-realistic MusicXML cases that may require more general voice/staff/sustain handling.

Any PyGuitarPro comparison must preserve this distinction:

`GP-format reference representation != engine canonical polyphonic authority`.

## Recommended corpus workflow

```text
GP3 / GP4 / GP5 source
  -> PyGuitarPro external extraction
  -> normalized reference-evidence artifact

independent MusicXML source/export
  -> production MusicXML parser
  -> POLY_V2
  -> physical selection
  -> CanonicalTabResult

reference evidence <-> engine result
  -> compare only explicitly defined fields
  -> classify mismatch
  -> no filename/SHA-specific production behavior
```

A comparison may establish agreement or expose a gap, but must not automatically rewrite production behavior.

## Mismatch classification

Each material mismatch should be classified before any implementation change:

- `SOURCE_FORMAT_DIFFERENCE`
- `REPRESENTATION_DIFFERENCE`
- `ENGINE_CAPABILITY_GAP`
- `REFERENCE_LIMITATION`
- `AMBIGUOUS_SOURCE_EVIDENCE`
- `EXPECTED_PHYSICAL_REVOICING`
- `UNRESOLVED`

Only a generic, evidence-backed capability gap may justify a bounded production change. Corpus filename, piece title, composer, local path, source SHA or PyGuitarPro object identity must never become a production dispatch key.

## Relationship to TuxGuitar reference work

The two external references have different approved roles:

- **TuxGuitar:** guitar-technique taxonomy/capability comparison reference only.
- **PyGuitarPro:** GP3/GP4/GP5 structured reference-evidence extractor for research and corpus validation.

Neither is production semantic authority, canonical polyphonic authority or solver authority.

## License boundary

PyGuitarPro identifies its package license as `LGPL-3.0-only`. This contract does not require vendoring, copying or modifying PyGuitarPro source code. The preferred use is an external research/test tool with provenance recorded in generated evidence.

## Success criterion

PyGuitarPro is useful when it improves independent evidence about Guitar Pro files without changing the engine's authority boundaries. The integration is successful only if production remains deterministic, source-immutable, format-generic and independent of PyGuitarPro at runtime.
