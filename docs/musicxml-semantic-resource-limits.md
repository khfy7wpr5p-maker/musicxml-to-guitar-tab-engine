# MusicXML semantic resource limits

Milestone 2C-3 applies the `ProcessingBudget 1.0.0` measure and event limits before semantic MusicXML adaptation.

## Enforcement boundary

```text
MusicXML input
  ↓
XML normalization and one SAX parse
  ↓
ParsedMusicXmlDocument 1.0.0
  ↓
structural MusicXML validation
  ↓
semantic resource guard
  ├─ maxMeasures
  └─ maxEvents
  ↓
monophonic MusicXML adapter
```

The low-level XML parser remains responsible only for byte, depth, element, attribute, and text limits. It does not gain MusicXML-specific measure or note knowledge.

`parseMusicXmlNotes()` normalizes the processing budget before parsing, passes the normalized limits into the XML parser, and then applies the same budget value at the semantic guard before the adapter runs.

## Limits and stable errors

| Budget field | Meaning | Stable error code |
|---|---|---|
| `maxMeasures` | Number of direct `measure` children in the validated single `part` | `MUSICXML_MEASURE_LIMIT_EXCEEDED` |
| `maxEvents` | Cumulative direct `note` elements under those measures | `MUSICXML_EVENT_LIMIT_EXCEEDED` |

The configured boundary is inclusive. A document equal to the limit is accepted; the first observed value greater than the limit is rejected.

Measure-limit details are immutable:

```text
{ field, limit, observed }
```

Event-limit details are immutable and include the location of the first rejected event:

```text
{ field, limit, observed, measure, eventIndex }
```

`eventIndex` is zero-based within the current measure. `observed` is the cumulative score-wide event count.

Both pitched notes and rests are represented by MusicXML `note` elements and therefore consume the same event budget. Unsupported note content still consumes the budget because the guard bounds semantic work before detailed note adaptation.

## Failure behavior

Limit failures use `XmlSafetyError`. Preflight classifies them as `BLOCKED` safety issues. Public conversion returns `canonicalTabResult: null`; no partial canonical music or TAB result is produced.

Invalid processing-budget options continue to use the existing XML boundary code `INVALID_CONFIGURATION`.

## Preserved behavior

Milestone 2C-3 does not change:

- the single-SAX-pass invariant;
- package-root exports;
- `CanonicalMusicDocument` or `CanonicalTabResult` schemas;
- supported MusicXML musical features;
- guitar candidate generation, cost model, optimizer, or writers;
- `maxProcessingMilliseconds`, deadline, clock, timeout, `AbortSignal`, or cancellation behavior.

`validateMusicXml()` remains a structural-only internal validator. Semantic measure/event enforcement applies to `parseMusicXmlNotes()` and the preflight, conversion, and canonical-result paths that depend on it.

## Remaining Milestone 2C work

- 2C-4: runtime deadline, clock, and cancellation controls;
- 2C-5: hostile-input and boundary regression corpus.
