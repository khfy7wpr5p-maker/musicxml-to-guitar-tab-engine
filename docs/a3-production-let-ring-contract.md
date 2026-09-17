# A3 Production Let-Ring Contract

## Scope

This migration preserves MusicXML `let-ring` notation evidence without inventing sustain-tie continuity.

Accepted source form:

```xml
<notations><tied type="let-ring"/></notations>
```

The projected note event may carry the optional additive field:

```text
letRing: true
```

## Semantics

`letRing: true` is notation evidence only.

It does **not**:

- set `tieStart`;
- set `tieStop`;
- extend source duration;
- connect the event to a later source note;
- authorize timing synthesis;
- change guitar string/fret selection;
- change arrangement authority.

A let-ring event therefore remains `tieStart: false` and `tieStop: false` unless independent ordinary MusicXML tie evidence also exists.

## Boundaries

- Direct `<tie type="let-ring"/>` remains invalid. The `<tie>` element continues to represent playback/sound tie continuity and is restricted to the supported ordinary tie types.
- `letRing` is optional on note events and is not required on existing source events.
- Rest events cannot carry `letRing` evidence.
- `PolyphonicSourceModel` contract version remains `1.0.0`; this is an additive optional evidence field, not a reinterpretation of existing required fields.
- `CanonicalTabResultV2` preserves the optional source evidence when present.
- Existing canonical notes without `letRing` retain their prior shape.

## Authority

This migration only preserves source notation evidence through projection and CanonicalTabResultV2. It does not make Guitar Polyphony Lab a production TAB authority and it does not authorize export of review-only transformed arrangements.

The production Engine remains the canonical authority for TAB generation and its existing review/export policy remains unchanged.

## Regression evidence

`tests/a3ProductionLetRingMigration.test.js` locks three behaviors:

1. `<tied type="let-ring">` projects as `letRing: true` without tie continuity.
2. CanonicalTabResultV2 preserves that evidence.
3. Direct `<tie type="let-ring">` still fails closed as `INVALID_MUSICXML`.
