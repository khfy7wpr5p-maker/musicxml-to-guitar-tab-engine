# PA-12 Internal Polyphonic End-to-End Gate

## Scope

PA-12 is the internal integration gate from raw bounded MusicXML through the already approved deterministic polyphonic guitar stack to exact `CanonicalTabResult 2.0.0` and internal TAB MusicXML serialization.

It does not expose polyphonic conversion through the package root. PA-13 remains separately gated.

## Exact internal path

```text
raw MusicXML bytes/string
  -> shared ProcessingRuntime 1.0.0
  -> ParsedMusicXmlDocument 1.0.0
  -> bounded PolyphonicSourceModel 1.0.0 projection
  -> explicit caller-supplied PA-4 arrangement decisions
  -> deterministic PA-6 reduction
  -> single-generation PA-7 candidate handoff
  -> PA-8 left-hand candidates
  -> PA-9 conservative physical validation
  -> deterministic non-ML final selector
  -> CanonicalTabResult 2.0.0 producer + validator
  -> internal CanonicalTabResult v2 MusicXML writer
  -> MusicXML 4.0 standard-notation + TAB output
```

One caller-supplied `ProcessingRuntime` is reused across the parse, projection, canonical production and final-selection stages so deadline/cancellation accounting cannot be reset between internal stages.

## Arrangement authority

PA-12 does not invent arrangement decisions. The caller must supply explicit arrangement decisions accepted by the existing PA-4 contract.

Therefore this gate does not authorize:

- AI/shadow selection;
- automatic teacher-policy inference;
- benchmark/gold feedback into runtime selection;
- `REVOICED`, `VOICE_REDISTRIBUTED` or `ARPEGGIATED` semantics beyond their separately implemented contracts;
- candidate deletion/reordering by learned scores.

## Sustained-sonority boundary

The current deterministic final selector remains fail-closed for retained ties and retained-note overlap into a later retained attack when complete sustained-hand occupancy is not modeled. PA-12 preserves that boundary rather than approximating it.

## Output boundary

Successful PA-12 conversion returns an internal immutable envelope containing:

- the validated polyphonic source model;
- the exact validated `CanonicalTabResult 2.0.0`;
- internal MusicXML TAB output.

The MusicXML output is capped by a fixed internal byte boundary. Writers consume selected canonical truth and never rerun final selection.

## Required verification

PA-12 may close only when one exact PR head proves all of the following:

1. raw multi-voice MusicXML reaches `CanonicalTabResult 2.0.0` deterministically;
2. equal-onset notes from different voices remain simultaneous selection groups;
3. every retained note has exact selected string/fret truth;
4. selected multi-note shapes remain PA-9 `PLAYABLE_WITHIN_POLICY`;
5. repeated execution produces identical canonical and MusicXML values;
6. one shared ProcessingRuntime spans the complete internal path;
7. retained sustained overlap fails closed;
8. the public monophonic conversion result is unchanged before/after internal PA-12 execution;
9. package-root exports are byte-for-byte/semantically unchanged as an API set and expose no PA-12/v2 function;
10. alphaTab 1.8.4 imports the raw-PA-12-derived MusicXML on Node.js 18/20/22;
11. alphaTab observes the canonical selected TAB positions and synchronized simultaneous attacks;
12. alphaTab SVG rendering succeeds;
13. the existing v1 compatibility suite remains green;
14. protected exact-head Node.js 18/20/22 tests and MusicXML Compatibility checks are green;
15. no unresolved review blocker remains.

## Non-authority statement

PA-12 completion means the polyphonic engine path is internally integrated and regression-tested. It does **not** mean:

- public polyphonic API availability;
- live learned authority;
- tied/sustained-overlap support beyond the fail-closed boundary;
- all deferred arrangement types are implemented;
- product UI, playback, PDF or persistence are production-ready;
- PA-13 is authorized.
