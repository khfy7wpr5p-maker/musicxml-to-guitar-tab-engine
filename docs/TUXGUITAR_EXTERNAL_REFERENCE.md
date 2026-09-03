# TuxGuitar External Taxonomy Reference Contract

**Status:** external taxonomy/capability reference only  
**Approved scope:** guitar-technique taxonomy and capability comparison  
**Upstream repository:** `helge17/tuxguitar`

## Purpose

TuxGuitar may be consulted as an independent external reference when reviewing the engine's guitar-technique capability matrix. Its approved role is to help answer a narrow question:

> Which explicitly represented guitar techniques and related notation/effect categories exist in a mature tablature system, and which corresponding capabilities are supported, partial, fail-closed or absent in MusicXML-to-GuitarTab-Engine?

TuxGuitar is not production semantic authority.

## Approved comparison areas

The capability review may compare explicitly modeled categories such as:

- bend;
- hammer-on / pull-off family;
- slide;
- natural/artificial harmonic families where representation is explicit;
- grace-note guitar transitions;
- trill;
- tremolo picking / tremolo-bar related categories;
- vibrato;
- dead/ghost notes;
- palm mute;
- staccato;
- tapping;
- slapping / popping;
- let-ring;
- accentuation and other explicit guitar-note effects;
- string/fret and tuning concepts only as taxonomy/context, not as solver authority.

The comparison should map each relevant category into the engine capability matrix using the engine's own contracts and statuses. A TuxGuitar category does not become supported merely because TuxGuitar supports it.

## Allowed outputs

Research/documentation work may produce:

- a TuxGuitar-to-engine technique taxonomy table;
- missing-capability candidates;
- representation-difference notes;
- producer/interoperability observations;
- proposed synthetic/real-corpus test categories;
- evidence-backed recommendations for a separately reviewed bounded capability stage.

## Forbidden uses

TuxGuitar must not be used to:

- replace the MusicXML parser;
- replace `PolyphonicSourceModel` or CanonicalTabResult;
- constrain POLY_V2 to TuxGuitar's internal voice model;
- replace guitar-position generation or physical feasibility checks;
- replace PA-7 / PA-8 / PA-9 or sustained physical selection;
- supply solver ranking, cost or tie-break rules;
- act as the production MusicXML writer;
- silently infer or rewrite source pitch, duration, onset, voice, staff, tie, chord or technique semantics;
- become a production runtime dependency;
- justify filename/SHA-specific behavior;
- make a capability production-approved without engine-native tests and generic evidence.

## Polyphony boundary

TuxGuitar's internal beat representation is bounded to two voices. That model must not become the engine's canonical polyphonic representation or limit wider POLY_V2 MusicXML requirements.

`TuxGuitar representation != engine canonical polyphonic authority`.

## Capability-review workflow

```text
TuxGuitar explicit technique/effect taxonomy
  -> taxonomy extraction/review
  -> engine capability-matrix comparison
  -> SUPPORTED / PARTIAL / FAIL_CLOSED / RESEARCH_ONLY / NOT_APPLICABLE
  -> identify evidence gap
  -> synthetic negative/positive evidence and real-corpus evidence where appropriate
  -> separately reviewed bounded production change, if justified
```

The taxonomy comparison itself never changes production behavior.

## Relationship to PyGuitarPro

The approved external-reference roles are intentionally different:

- **TuxGuitar:** guitar-technique taxonomy/capability comparison reference only.
- **PyGuitarPro:** GP3/GP4/GP5 structured reference-evidence extractor for research and corpus validation.

Neither is parser authority, canonical polyphonic authority, physical solver authority or production runtime authority.

## Success criterion

TuxGuitar is useful only when it improves coverage awareness and test planning without introducing source copying, runtime coupling or semantic authority. Production behavior remains deterministic, source-immutable, format-generic and governed solely by engine-native contracts and evidence.