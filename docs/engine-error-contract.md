# EngineError contract

## Status

Milestone 2D introduces a shared internal error base incrementally. 2D-1 covers the XML safety and parser-facing error boundary. 2D-2 extends the same internal base to guitar, fingering, and canonical TAB result errors. 2D-3 extends it to the canonical music model, canonical TAB contract validation, and the three canonical TAB writers without changing the package-root public API.

## Contract version

`EngineError` contract version: `1.0.0`.

The internal base class is defined in `src/errors/engineError.js` and preserves the common error fields already used by the engine:

- `message`
- `name`
- `code`
- `details`

`EngineError` extends the native JavaScript `Error` class. Domain-specific subclasses continue to keep their existing constructor signatures, names, codes, detail shapes, and wrapping behavior.

## 2D-1 migrated errors

The following classes inherit from `EngineError` in 2D-1:

- `ProcessingBudgetConfigurationError`
- `XmlSafetyError`
- `ParsedMusicXmlDocumentError`
- `MusicXmlValidationError`
- `MusicXmlNoteParserError`

## 2D-2 migrated errors

The following classes inherit from `EngineError` in 2D-2:

- `GuitarConfigurationError`
- `FretboardError`
- `PlayabilityError`
- `FingeringCostError`
- `FingeringOptimizerError`
- `CandidateLayerBuilderError`
- `CanonicalFingeringPipelineError`
- `CanonicalTabResultError`

No error code is renamed and no guitar, fingering, optimizer, or canonical TAB result error is reclassified by 2D-2. Fingering cost calculation, candidate generation, optimizer ordering and tie-breaking, runtime checkpoints, and canonical result generation remain unchanged.

## 2D-3 migrated errors

The following classes inherit from `EngineError` in 2D-3:

- `PitchError`
- `CanonicalMusicDocumentError`
- `CanonicalTabContractError`
- `CanonicalTabAsciiWriterError`
- `CanonicalTabJsonWriterError`
- `CanonicalTabMusicXmlWriterError`

No error code is renamed and no canonical music validation, contract validation, writer adaptation, JSON serialization, ASCII rendering, or MusicXML rendering behavior is reclassified by 2D-3. Existing writer-specific conversion of `CanonicalTabContractError` into writer-domain errors remains unchanged.

## Compatibility boundary

2D remains intentionally internal:

- `EngineError` is not exported from `src/index.js`.
- Existing package-root exports are unchanged.
- The existing package-root `FretboardError` export remains the same domain class and now also inherits from the internal `EngineError` base.
- Existing domain-specific error classes remain available from their current module paths.
- `ProcessingBudgetConfigurationError.details` remains a frozen copy.
- Other migrated error classes retain their existing direct `details` value behavior.
- Canonical schemas, contract versions, writer output formats, writer options, and serialization policies are unchanged.
- No new wrapping, retry, HTTP, UI, OMR, or external-service policy is introduced.

## Follow-up slices

Remaining internal error classes outside this slice, including parser adapter, preflight, semantic resource-limit, and processing-runtime boundaries, may be evaluated separately before declaring 2D convergence complete. Any decision to expose `EngineError` through the package-root public API is a separate compatibility gate and must not be implied by this internal convergence work.
