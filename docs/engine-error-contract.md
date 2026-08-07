# EngineError contract

## Status

Milestone 2D introduces a shared internal error base incrementally. 2D-1 covers the XML safety and parser-facing error boundary. 2D-2 extends the same internal base to guitar, fingering, and canonical TAB result errors. 2D-3 extends it to the canonical music model, canonical TAB contract validation, and the three canonical TAB writers. 2D-4 completes the internal convergence by moving the remaining MusicXML document-adapter error class onto the same base without changing the package-root public API.

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

## 2D-4 final convergence

The remaining direct domain error class migrated in 2D-4 is:

- `MusicXmlDocumentAdapterError`

Its existing constructor signature, `name`, `code`, `details`, and `phase` metadata are preserved. The `phase` field remains `content` by default and continues to support the explicit `structure` value used by `MusicXmlNoteParser` to distinguish structural validation failures from note-content failures.

The preflight, semantic resource-limit, and processing-runtime boundaries do not define additional direct `Error` subclasses that require migration. They already report failures through the migrated `XmlSafetyError`, `MusicXmlValidationError`, `MusicXmlNoteParserError`, or `ProcessingBudgetConfigurationError` contracts.

## Compatibility boundary

2D remains intentionally internal:

- `EngineError` is not exported from `src/index.js`.
- Existing package-root exports are unchanged.
- The existing package-root `FretboardError` export remains the same domain class and now also inherits from the internal `EngineError` base.
- Existing domain-specific error classes remain available from their current module paths.
- `ProcessingBudgetConfigurationError.details` remains a frozen copy.
- Other migrated error classes retain their existing direct `details` value behavior.
- `MusicXmlDocumentAdapterError.phase` behavior is unchanged.
- Canonical schemas, contract versions, writer output formats, writer options, and serialization policies are unchanged.
- No new wrapping, retry, HTTP, UI, OMR, or external-service policy is introduced.

## Convergence status

With 2D-4, the repository's current internal domain error classes are converged on `EngineError 1.0.0`. This does not make `EngineError` part of the package-root public API and does not authorize a future public export automatically.

Any decision to expose `EngineError` through `src/index.js`, change error codes, alter wrapping behavior, or introduce a new external error policy is a separate compatibility gate.
