# EngineError contract

## Status

Milestone 2D introduces a shared internal error base incrementally. 2D-1 covers the XML safety and parser-facing error boundary. 2D-2 extends the same internal base to guitar, fingering, and canonical TAB result errors without changing the package-root public API.

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

No error code is renamed and no guitar, fingering, optimizer, or canonical TAB error is reclassified by this milestone. Fingering cost calculation, candidate generation, optimizer ordering and tie-breaking, runtime checkpoints, and canonical result generation remain unchanged.

## Compatibility boundary

2D remains intentionally internal:

- `EngineError` is not exported from `src/index.js`.
- Existing package-root exports are unchanged.
- The existing package-root `FretboardError` export remains the same domain class and now also inherits from the internal `EngineError` base.
- Existing domain-specific error classes remain available from their current module paths.
- `ProcessingBudgetConfigurationError.details` remains a frozen copy.
- Other migrated error classes retain their existing direct `details` value behavior.
- No new wrapping, retry, HTTP, UI, OMR, or serialization policy is introduced.

## Follow-up slices

Later 2D slices may migrate canonical music-model, canonical contract, and writer error classes to the same base. Any decision to expose `EngineError` through the package-root public API is a separate compatibility gate and must not be implied by this internal convergence step.
