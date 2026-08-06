# Package and Verification Status

This document records the package surface and strongest available verification evidence for the authoritative runtime baseline. It does not promote unmerged behavior to a current capability.

## Snapshot

- Status date: 2026-08-06
- Verified `main` runtime baseline: `7ec42c86ce7a0957a5f79ab3a4e3d2c71475183c`
- Tested Milestone 2B head: `291d185ffcc9b96675b6d3f956fe2073bb9fed55`
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private
- License metadata: `UNLICENSED`
- Node.js support: 18, 20, and 22 in CI; package engine `>=18`

## Verification labels

| Label | Meaning |
|---|---|
| `VERIFIED_ON_MAIN` | Present on the verified runtime baseline and exercised by successful merged or pre-merge evidence for the same tree |
| `IMPLEMENTED_NOT_PUBLIC` | Merged and tested internally, but not exported through the package root |
| `PARTIAL` | Some enforcement exists, but the named package-level capability is incomplete |
| `NOT_IMPLEMENTED` | No merged implementation exists |
| `EVIDENCE_LIMITED` | Implementation exists, but a named verification layer is unavailable or incomplete |

## Package metadata

| Field | Current value |
|---|---|
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` |
| `description` | Convert MusicXML scores into playable six-string guitar tablature |
| `main` | `src/index.js` |
| `test` | `node --test` |
| Node.js engine | `>=18` |
| Runtime dependency | `saxes@6.0.0` |
| License | `UNLICENSED` |

This document is not a fresh vulnerability audit. Dependency security must be checked again when dependencies or lockfiles change and before any release decision.

## Current CI and compatibility evidence

Milestone 2B head `291d185ffcc9b96675b6d3f956fe2073bb9fed55` was merged as runtime commit `7ec42c86ce7a0957a5f79ab3a4e3d2c71475183c` after successful checks.

### Tests #194

| Runtime | Result |
|---|---|
| Node.js 18 | Passed |
| Node.js 20 | Passed |
| Node.js 22 | Passed |

The workflow installs with `npm ci --ignore-scripts` and runs the complete `npm test` suite.

### MusicXML Compatibility #79

The compatibility workflow reported success for:

- complete repository tests,
- alphaTab MusicXML import,
- alphaTab SVG rendering,
- browser rendering and cursor behavior,
- synthesizer diagnostic,
- MuseScore CLI availability check.

Earlier writer milestones also recorded real MuseScore Studio 4.7.4 import, round-trip, and rendering evidence for the supported monophonic TAB MusicXML fixture set.

## Package-root public API

The current `src/index.js` exports exactly these symbols:

| Export | Status | Purpose |
|---|---|---|
| `convertMusicXmlToCanonicalTab` | `VERIFIED_ON_MAIN` | Validates options, performs one shared MusicXML inspection, returns preflight plus canonical TAB result or `null` when blocked |
| `preflightMusicXml` | `VERIFIED_ON_MAIN` | Classifies supported input as `PASS`, `WARNING`, or `BLOCKED` |
| `PREFLIGHT_STATUS` | `VERIFIED_ON_MAIN` | Public preflight status constants |
| `getPositionCandidates` | `VERIFIED_ON_MAIN` | Returns physically valid string/fret positions for a MIDI pitch and configuration |
| `positionToMidi` | `VERIFIED_ON_MAIN` | Converts a validated string/fret position to MIDI |
| `validateMidi` | `VERIFIED_ON_MAIN` | Validates MIDI input for fretboard operations |
| `FretboardError` | `VERIFIED_ON_MAIN` | Existing fretboard error class preserved for compatibility |

No writer, shared canonical validator, parsed-document adapter, or internal inspection helper is exported through the package root.

## Internal module and capability status

| Capability or package area | Status | Evidence boundary |
|---|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` | Byte, encoding, null-byte, entity, DOCTYPE, malformed XML, and unsafe-input tests |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` | One-pass parsing, immutability, namespaced attribute isolation, and deep-tree regression tests |
| MusicXML structural validation | `VERIFIED_ON_MAIN` | Supported root/part checks and malformed/unsupported structure tests |
| Monophonic MusicXML parser | `VERIFIED_ON_MAIN` | Notes, rests, rhythm, ties, beams, pickups, unsupported-feature, and source-location tests |
| Shared public conversion parse | `VERIFIED_ON_MAIN` | PASS, WARNING, and BLOCKED use one SAX construction; invalid options use zero |
| MusicXML preflight | `VERIFIED_ON_MAIN` | Frozen `PASS`, `WARNING`, and `BLOCKED` reports and issue classification |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` | Invariants, immutability, ordering, source preservation, and duration tests |
| Guitar tuning/fretboard/playability | `VERIFIED_ON_MAIN` | Candidate, MIDI, fret-limit, and unplayable-note tests |
| Candidate-layer builder | `VERIFIED_ON_MAIN` | Candidate membership, ordering, and canonical traversal tests |
| Fingering cost model | `VERIFIED_ON_MAIN` | Cost breakdown, invalid profile, movement limit, and overflow tests |
| Fingering optimizer | `VERIFIED_ON_MAIN` | Determinism, stable tie-breaking, path reconstruction, and long-path regression tests |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` | Result invariants, immutability, warnings, costs, and selected/alternative positions |
| Canonical JSON Schema | `VERIFIED_ON_MAIN` | `schemas/canonical-tab-result.v1.schema.json` and schema-reference tests |
| Shared canonical validator | `VERIFIED_ON_MAIN` | Exact-field, JSON-safety, musical, physical, cost, and warning-index validation |
| JSON writer | `IMPLEMENTED_NOT_PUBLIC` | Deterministic golden output, round-trip, safety, immutability, and shared-contract tests |
| TAB MusicXML writer | `IMPLEMENTED_NOT_PUBLIC` | Deterministic writer tests plus MuseScore and alphaTab evidence |
| ASCII TAB writer | `IMPLEMENTED_NOT_PUBLIC` | Six-string rendering, rests, measures, fret alignment, determinism, immutability, and shared-contract tests |
| Complete central resource limits | `PARTIAL` | Byte/XML safety exists; central depth, element, attribute, text, measure, event, deadline, and cancellation enforcement remains Milestone 2C |
| Unified public engine error model | `NOT_IMPLEMENTED` | Layer-specific errors remain distributed; Milestone 2D is pending |
| Learned candidate scorer | `NOT_IMPLEMENTED` | Future extension only |
| Teacher-feedback event package | `NOT_IMPLEMENTED` | Future contract only |
| Training pipeline/model registry | `NOT_IMPLEMENTED` | Future extension only |
| HTTP service | `NOT_IMPLEMENTED` | Outside the current package boundary |
| UI/mobile package | `NOT_IMPLEMENTED` | Outside the current package boundary |
| PDF/OMR/Audiveris package | `NOT_IMPLEMENTED` | Outside the current package boundary |
| SesliTab adapter | `NOT_IMPLEMENTED` | Outside the current package boundary |

## Output status

| Output | Implementation | Package-root availability | Strongest evidence |
|---|---|---|---|
| Canonical JavaScript object | Merged | Public through conversion API | Tests #194 and full repository suite |
| JSON text | Merged internal writer | Not public | Golden, round-trip, shared-contract, and full-suite tests |
| TAB MusicXML | Merged internal writer | Not public | Writer tests, MuseScore evidence, alphaTab import/SVG/browser checks |
| ASCII TAB | Merged internal writer | Not public | Deterministic six-string writer and full-suite tests |
| PDF | Not implemented | Not available | None |

## Dependency status

| Dependency | Version | Role | Current handling |
|---|---|---|---|
| `saxes` | `6.0.0` | Streaming SAX XML parser | Pinned runtime dependency in package and lockfile |

Development-only compatibility tools such as alphaTab, Puppeteer, browser executables, and MuseScore are used in isolated verification workflows or recorded compatibility environments. They are not production dependencies of this package.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- Compatibility evidence is tied to named versions and fixtures.
- MuseScore and alphaTab evidence does not cover unsupported chords, polyphony, tuplets, grace notes, multipart, or multistaff scores.
- No package release has been published because the package is private and `UNLICENSED`.
- Branch protection and required status checks are not package behavior and must be assessed separately as repository governance.

## Status governance

1. Only merged behavior may be marked `VERIFIED_ON_MAIN` or `IMPLEMENTED_NOT_PUBLIC`.
2. Record exact commits and workflow runs for material runtime claims.
3. Re-run Node.js 18, 20, and 22 when runtime behavior, dependencies, entry points, or tests change.
4. Re-run MusicXML compatibility checks when parser, canonical contracts, tuning, rhythm, selected-position, or writer behavior changes.
5. Update this file when `package.json`, `package-lock.json`, `src/index.js`, schemas, dependencies, outputs, or CI evidence changes.
6. Do not describe unavailable evidence as passed.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External MuseScore and browser compatibility checks require the dedicated workflow or documented compatibility environment.