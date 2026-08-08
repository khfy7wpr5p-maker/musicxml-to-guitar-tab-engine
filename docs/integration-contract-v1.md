# Integration Contract v1

## Status

This document defines the stable integration boundary around the deterministic MusicXML-to-GuitarTab core.

- Contract version: `1.0.0`
- Metadata module: `src/contracts/integrationContractMetadata.js`
- Public package-root API: unchanged in this milestone
- HTTP/UI/OMR/SesliTab implementation: outside this repository boundary

## Purpose

`Integration Contract v1` tells external applications what they may rely on when calling the engine and what they are never authorized to override.

It is a boundary contract, not a transport protocol and not an application framework.

## Supported integration entry points

External callers use the existing package-root API:

- `preflightMusicXml(input, options)`
- `convertMusicXmlToCanonicalTab(input, options)`
- `serializeCanonicalTabResult(result)`
- `serializeCanonicalTabResultToAscii(result)`
- `serializeCanonicalTabResultToMusicXml(result)`
- `isEngineError(error)`
- `ENGINE_ERROR_CONTRACT_VERSION`

Existing public fretboard helpers remain supported for their current scope.

## Supported input boundary

Current supported input remains MusicXML `score-partwise` through `.musicxml` or `.xml` content within the engine's documented monophonic scope.

External systems must not treat unsupported MusicXML structures as silently convertible. Preflight/validation remains authoritative.

## Supported output boundary

The deterministic core may produce:

1. immutable `CanonicalTabResult 1.0.0`,
2. deterministic canonical JSON text,
3. deterministic ASCII TAB text,
4. deterministic TAB MusicXML text.

Writers consume the authoritative `CanonicalTabResult`; they do not regenerate fingering candidates or rerun optimization.

## Contract references

Integration Contract v1 is aligned with:

- `CanonicalTabResult 1.0.0`
- internal `GuitarConfiguration 1.0.0`
- internal/public-detection `EngineError 1.0.0` boundary
- existing processing-budget/deadline/cancellation safety rules

A future change to one of these contracts must not be assumed compatible merely because package versioning remains unchanged.

## Error boundary

External callers should:

1. catch errors from public engine calls,
2. use `isEngineError(error)` for errors received directly from the installed package,
3. branch on stable `error.code` rather than message text,
4. treat `message` as explanatory text rather than a programmatic identifier.

`isEngineError` is nominal (`instanceof` based). It is not a detector for serialized errors or arbitrary lookalike objects received over HTTP, queues, storage, or IPC.

Integrations that cross a process/network boundary require a separately approved error-envelope design; they must not deserialize arbitrary objects and trust them as engine errors.

## Guitar configuration reference

The deterministic candidate layer uses internal `GuitarConfiguration 1.0.0`.

Integrations may provide the currently supported guitar options through existing conversion options, but they do not gain authority to:

- create string numbers outside the six-string contract,
- use invalid pitch/MIDI combinations,
- create physically invalid positions,
- bypass playability validation.

Public exposure of the configuration-version constant or a public configuration constructor is intentionally deferred.

## Integration non-authorities

No external application, adapter, AI component, OMR system, UI, transport layer, or learned ranker may use this contract as authority to:

- modify the musical meaning of validated MusicXML,
- bypass parser/preflight/resource limits,
- invent physically invalid string/fret candidates,
- bypass physical playability validation,
- replace deterministic optimizer authority without a separately approved architecture change,
- mutate `CanonicalTabResult` after creation,
- cause writers to regenerate or reinterpret selected positions,
- trust spoofed/serialized lookalike objects as native engine errors.

## Application boundary

This repository remains a deterministic core engine. The following belong outside the core unless separately approved:

- HTTP servers and REST endpoints,
- browser/mobile UI,
- authentication/session logic,
- file-upload orchestration,
- PDF/OMR/Audiveris/ST-OMR logic,
- SesliTab application behavior,
- persistence/database layers,
- cloud job queues and provider adapters.

External systems may call this package, but they must preserve its input validation, physical rules, canonical authority, and deterministic output contracts.

## Compatibility policy

A consuming integration should pin and record at minimum:

- package version,
- `CanonicalTabResult.schemaVersion`,
- `ENGINE_ERROR_CONTRACT_VERSION` when relying on public error behavior,
- relevant internal contract version only when the integration boundary explicitly exposes or persists that reference in a separately approved layer.

Consumers must fail closed on unsupported canonical schema versions rather than guessing compatibility.

## Teacher/AI authority boundary

Teacher review may approve or reject resulting pedagogical choices in an application workflow, but it does not retroactively change parser truth or physical guitar validity.

Future learned ranking may only rank deterministic, physically valid candidates after its own approved contracts are implemented. Integration Contract v1 does not grant AI authority to alter MusicXML, candidate membership, physical validation, or canonical output directly.

## Explicitly not added by v1

Integration Contract v1 does not add:

- new package-root exports,
- HTTP endpoints,
- serialized error envelopes,
- public GuitarConfiguration constructor/version export,
- plugin/provider interfaces,
- OMR adapters,
- AI ranking interfaces,
- chord/barre/polyphonic support.

Those require separate milestones and review gates.
