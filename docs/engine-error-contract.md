# EngineError contract

## Status

Milestone 2D introduces a shared internal error base incrementally. The first slice, 2D-1, covers the XML safety and parser-facing error boundary without changing the package-root public API.

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

No error code is renamed and no parser or validation error is reclassified by this milestone.

## Compatibility boundary

2D-1 is intentionally internal:

- `EngineError` is not exported from `src/index.js`.
- Existing package-root exports are unchanged.
- Existing domain-specific error classes remain available from their current module paths.
- `ProcessingBudgetConfigurationError.details` remains a frozen copy.
- Other migrated error classes retain their existing direct `details` value behavior.
- No new wrapping, retry, HTTP, UI, OMR, or serialization policy is introduced.

## Follow-up slices

Later 2D slices may migrate guitar, canonical-model, fingering, contract, and writer error classes to the same base. Any decision to expose `EngineError` through the package-root public API is a separate compatibility gate and must not be implied by this internal convergence step.
