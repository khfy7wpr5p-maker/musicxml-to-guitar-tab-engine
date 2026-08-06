# Milestone 2C-2 — XML structural resource-limit enforcement

## Status

This document describes the implementation boundary for Milestone 2C-2. The capability is branch evidence until its pull request is reviewed and merged into `main`.

## Scope

The existing internal `ProcessingBudget 1.0.0` contract is now consumed by the single `SaxesParser` pass in `parseParsedMusicXmlDocument()`.

The following static limits are enforced during parsing:

| ProcessingBudget field | Enforcement point | Stable error code |
|---|---|---|
| `maxDepth` | Before an opened element is pushed onto the parser stack | `XML_DEPTH_LIMIT_EXCEEDED` |
| `maxElements` | Before an opened element is accepted | `XML_ELEMENT_LIMIT_EXCEEDED` |
| `maxAttributes` | Before the cumulative attributes of an opened element are accepted | `XML_ATTRIBUTE_LIMIT_EXCEEDED` |
| `maxTextBytes` | Before a text or CDATA chunk is appended | `XML_TEXT_LIMIT_EXCEEDED` |

A value exactly equal to its configured limit is accepted. Parsing stops only when the observed value is greater than the limit.

## Counting semantics

- Depth is the number of currently open XML elements, including the root element.
- Element count is cumulative across the complete document.
- Attribute count is cumulative across the complete document and includes attributes exposed by the namespace-aware SAX parser.
- Text size is cumulative UTF-8 byte length for normal text and CDATA chunks. Formatting whitespace is included because it is parser-produced character data.
- The existing `maxBytes` input limit remains enforced before SAX parsing.

## Error contract

Resource-limit failures use `XmlSafetyError` so preflight keeps the existing safety classification.

Each structural limit error provides immutable details:

```text
{
  field,
  limit,
  observed
}
```

Invalid processing-budget configuration is mapped to the existing XML boundary code `INVALID_CONFIGURATION`.

A limit failure never returns a partial `ParsedMusicXmlDocument`, canonical music document, or canonical TAB result.

## Preserved invariants

This milestone does not change:

- the single-SAX-pass architecture;
- package-root exports;
- canonical schemas or canonical result fields;
- supported MusicXML musical features;
- candidate generation, cost calculation, or fingering selection;
- JSON, TAB MusicXML, or ASCII TAB writers;
- measure and event enforcement;
- deadline, clock, `AbortSignal`, or cancellation behavior.

## Deferred work

- Milestone 2C-3: `maxMeasures` and `maxEvents` enforcement.
- Milestone 2C-4: `maxProcessingMilliseconds`, deadline calculation, and cancellation.
- Milestone 2C-5: expanded hostile-input and boundary regression corpus.
- Milestone 2D: common public `EngineError` envelope.
