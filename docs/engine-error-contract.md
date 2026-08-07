# EngineError contract

## Status

The repository's current domain error classes converge on the shared internal `EngineError 1.0.0` base. Milestones 2D-1 through 2D-4 completed that internal convergence without changing domain error names, codes, details, wrapping behavior, or the MusicXML adapter `phase` field.

PEB-1 adds a deliberately narrow public detection boundary without making the base class or internal domain subclasses public.

## Contract version

`ENGINE_ERROR_CONTRACT_VERSION = '1.0.0'`.

`EngineError` is defined in `src/errors/engineError.js` and extends native JavaScript `Error`. The common fields are:

- `message`
- `name`
- `code`
- `details`

Domain subclasses retain their existing constructor behavior. `ProcessingBudgetConfigurationError.details` remains a frozen copy; other migrated classes retain their existing detail-reference behavior. `MusicXmlDocumentAdapterError.phase` remains `content` by default and may be `structure` for parser routing.

## Internal base

The `EngineError` class itself remains internal and is **not** exported from `src/index.js`.

This avoids making the internal constructor signature and inheritance hierarchy a long-term package-root compatibility promise.

## PEB-1 public detection boundary

PEB-1 exposes exactly two error-contract symbols through the package root:

- `ENGINE_ERROR_CONTRACT_VERSION`
- `isEngineError(value)`

`isEngineError(value)` is nominal: it returns `true` only for values that inherit from this package's internal `EngineError` base. A native `Error` or a plain object that merely contains `name`, `code`, `details`, and `message` is not treated as an engine error.

This detector is intended for errors caught directly from package calls. It is not a serialized-error detector and does not convert arbitrary external objects into trusted engine errors.

## Public field policy

For a caught value where `isEngineError(error) === true`, consumers may inspect:

- `error.name`
- `error.code`
- `error.details`
- `error.message`

Programmatic branching should prefer stable `code` values. Human-readable `message` text must not be treated as the primary machine contract.

PEB-1 does not rename, reclassify, wrap, retry, or translate existing errors.

## Existing public compatibility

`FretboardError` remains public because it was already part of the package-root API before PEB-1. It also satisfies `isEngineError(error) === true`.

The following remain internal package implementation classes:

- `EngineError`
- `GuitarConfigurationError`
- `CanonicalTabResultError`
- `CanonicalTabJsonWriterError`
- `CanonicalTabAsciiWriterError`
- `CanonicalTabMusicXmlWriterError`
- parser, validation, optimizer, fingering, canonical-model, and other domain error subclasses

## Safety boundary

PEB-1 changes detection only. It does not change:

- MusicXML parsing or preflight classification,
- conversion option validation,
- candidate generation or physical validation,
- deterministic cost calculation or optimizer behavior,
- `CanonicalTabResult`,
- writer options or output,
- error codes, details, or writer adaptation rules,
- schemas, dependencies, workflows, HTTP/UI/OMR boundaries, or learned-ranking policy.

Any future public error envelope, recoverability metadata, cause policy, domain-error export, or `EngineError` class export requires a separate compatibility gate.
