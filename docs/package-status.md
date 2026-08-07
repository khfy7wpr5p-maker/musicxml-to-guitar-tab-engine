# Package and Verification Status

This document records the package surface and strongest available verification evidence for the authoritative runtime baseline, plus the active Milestone 3 package-surface proposal. It does not promote unmerged behavior to a current `main` capability.

## Snapshot

- Status date: 2026-08-07
- Verified pre-Milestone-3 `main` runtime baseline: `73b04a9f18f6fbb3c3a2e2e584d09d25fc66f099`
- Baseline change: documentation convergence after Milestones 2C and 2D (PR #35)
- Active Milestone 3 branch: `feature/public-writer-api-m3`
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private
- License metadata: `UNLICENSED`
- Node.js support: 18, 20, and 22 in CI; package engine `>=18`
- Runtime dependency: `saxes@6.0.0`

## Verification labels

| Label | Meaning |
|---|---|
| `VERIFIED_ON_MAIN` | Present on the verified runtime baseline and backed by merged code plus relevant successful test evidence |
| `IMPLEMENTED_NOT_PUBLIC` | Merged and tested internally, but not exported through the verified `main` package root |
| `BRANCH_ONLY` | Implemented on the active milestone branch but not authoritative until merge |
| `PARTIAL` | Some foundation exists, but the named package-level capability remains incomplete |
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

Milestone 3 does not change `package.json`, `package-lock.json`, package version, dependency set, Node.js engine, or license metadata.

This document is not a fresh dependency-vulnerability audit. Dependency security must be checked again when dependencies or lockfiles change and before any release decision.

## Strongest verified baseline evidence

The documentation-convergence branch head `b8f2cb2bba8c5eb543766ca825d23c0391bebaf9` completed the following pull-request workflows successfully before squash merge as `73b04a9f18f6fbb3c3a2e2e584d09d25fc66f099`:

### Tests #226

| Runtime | Result |
|---|---|
| Node.js 18 | Passed |
| Node.js 20 | Passed |
| Node.js 22 | Passed |

### MusicXML Compatibility #96

Successful jobs included:

- complete repository tests plus alphaTab import and SVG render on Node.js 18,
- the same compatibility path on Node.js 20,
- the same compatibility path on Node.js 22,
- alphaTab browser renderer, cursor, and synthesizer diagnostic on Node.js 22,
- MuseScore CLI availability diagnostic.

Earlier writer milestones separately recorded deterministic golden-output, MuseScore, and alphaTab evidence for the supported monophonic writer implementations.

Milestone 3 requires fresh pull-request CI on its exact final head because changing `src/index.js` changes the package-root contract even though writer implementations themselves are unchanged.

## Verified pre-Milestone-3 package-root public API

The verified baseline `src/index.js` exports exactly these symbols:

| Export | Status | Purpose |
|---|---|---|
| `convertMusicXmlToCanonicalTab` | `VERIFIED_ON_MAIN` | Validates options, performs shared MusicXML inspection, returns preflight plus canonical TAB result or `null` when blocked |
| `preflightMusicXml` | `VERIFIED_ON_MAIN` | Classifies supported input as `PASS`, `WARNING`, or `BLOCKED` |
| `PREFLIGHT_STATUS` | `VERIFIED_ON_MAIN` | Public preflight status constants |
| `getPositionCandidates` | `VERIFIED_ON_MAIN` | Returns physically valid string/fret positions for a MIDI pitch and configuration |
| `positionToMidi` | `VERIFIED_ON_MAIN` | Converts a validated string/fret position to MIDI |
| `validateMidi` | `VERIFIED_ON_MAIN` | Validates MIDI input for fretboard operations |
| `FretboardError` | `VERIFIED_ON_MAIN` | Existing public fretboard error class preserved for compatibility; internally inherits from `EngineError` |

No writer serializer, shared canonical validator, parsed-document adapter, internal inspection helper, `GuitarConfiguration`, writer error class, or `EngineError` is exported through the verified pre-Milestone-3 package root.

## Milestone 3 target package-root additions

The active branch adds only these three function exports:

| Export | Branch status | Internal source |
|---|---|---|
| `serializeCanonicalTabResult` | `BRANCH_ONLY` | `src/writers/canonicalTabJsonWriter.js` |
| `serializeCanonicalTabResultToAscii` | `BRANCH_ONLY` | `src/writers/canonicalTabAsciiWriter.js` |
| `serializeCanonicalTabResultToMusicXml` | `BRANCH_ONLY` | `src/writers/canonicalTabMusicXmlWriter.js` |

Each package-root export is the same function reference as the existing internal serializer. Milestone 3 does not add a wrapper, change options, reinterpret results, rerun optimization, or change writer errors.

The package-root regression test locks the complete Milestone 3 target surface and explicitly verifies that these remain unexported:

- `CanonicalTabJsonWriterError`
- `CanonicalTabAsciiWriterError`
- `CanonicalTabMusicXmlWriterError`
- `EngineError`

## Internal module and capability status

| Capability or package area | Status | Evidence boundary |
|---|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` | Byte, encoding, null-byte, entity, DOCTYPE, malformed XML, and unsafe-input tests |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` | Central immutable limits for XML structure, measures, events, and processing duration |
| XML structural ceilings | `VERIFIED_ON_MAIN` | Depth, element, attribute, and UTF-8 text-byte limits enforced during the single SAX pass |
| Semantic resource ceilings | `VERIFIED_ON_MAIN` | Measure and event limits enforced before semantic adaptation |
| Runtime deadline/cancellation | `VERIFIED_ON_MAIN` | Monotonic clock validation, deadline checks, `AbortSignal`, and checkpoints through candidate/optimizer loops |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` | Boundary and fail-closed regression coverage |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` | One-pass parsing, immutability, namespaced attribute isolation, and deep-tree regression tests |
| MusicXML structural validation | `VERIFIED_ON_MAIN` | Supported root/part checks and malformed/unsupported structure tests |
| Monophonic MusicXML parser | `VERIFIED_ON_MAIN` | Notes, rests, rhythm, ties, beams, pickups, unsupported-feature, and source-location tests |
| Shared public conversion parse | `VERIFIED_ON_MAIN` | PASS, WARNING, and BLOCKED share one semantic parse; invalid options parse zero times |
| MusicXML preflight | `VERIFIED_ON_MAIN` | Frozen `PASS`, `WARNING`, and `BLOCKED` reports and issue classification |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` | Invariants, immutability, ordering, source preservation, and duration tests |
| Guitar tuning/configuration foundation | `VERIFIED_ON_MAIN` | Six-string tuning validation, MIDI range, unique string numbers, fret limits, and immutable configuration creation |
| Fretboard/playability | `VERIFIED_ON_MAIN` | Candidate, MIDI, fret-limit, and unplayable-note tests |
| Candidate-layer builder | `VERIFIED_ON_MAIN` | Candidate membership, ordering, canonical traversal, and runtime checkpoints |
| Fingering cost model | `VERIFIED_ON_MAIN` | Deterministic movement/preference cost breakdown and profile validation |
| Fingering optimizer | `VERIFIED_ON_MAIN` | Determinism, stable tie-breaking, path reconstruction, long-path regression, and cooperative runtime checkpoints |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` | Result invariants, immutability, warnings, costs, and selected/alternative positions |
| Canonical JSON Schema | `VERIFIED_ON_MAIN` | `schemas/canonical-tab-result.v1.schema.json` and schema-reference tests |
| Shared canonical validator | `VERIFIED_ON_MAIN` | Exact-field, JSON-safety, musical, physical, cost, and warning-index validation |
| JSON writer implementation | `IMPLEMENTED_NOT_PUBLIC` on verified base | Deterministic golden output, round-trip, safety, immutability, and shared-contract tests |
| TAB MusicXML writer implementation | `IMPLEMENTED_NOT_PUBLIC` on verified base | Deterministic writer tests plus MuseScore and alphaTab evidence |
| ASCII TAB writer implementation | `IMPLEMENTED_NOT_PUBLIC` on verified base | Six-string rendering, rests, measures, fret alignment, determinism, immutability, and shared-contract tests |
| Milestone 3 public serializer surface | `BRANCH_ONLY` | Direct package-root references to the three existing serializer functions plus export-boundary regression tests |
| Internal `EngineError 1.0.0` | `IMPLEMENTED_NOT_PUBLIC` | Current domain errors converge on the shared internal base while preserving existing domain metadata |
| Public engine-error boundary | `NOT_IMPLEMENTED` | No package-root `EngineError` or writer-error export and no separately versioned external error envelope exists |
| Versioned `GuitarConfiguration 1.0` | `PARTIAL` | Internal configuration foundation exists; stable public/versioned identity and stronger pitch/MIDI consistency remain future work |
| Optimizer observation contract | `NOT_IMPLEMENTED` | Future immutable diagnostic/learning boundary only |
| Pedagogical feature vector | `NOT_IMPLEMENTED` | Deterministic cost components exist but no versioned feature contract exists |
| Teacher-feedback event package | `NOT_IMPLEMENTED` | Future contract only |
| Fixed teacher benchmark | `NOT_IMPLEMENTED` | No versioned teacher-verified evaluation dataset exists in this repository |
| Learned candidate scorer | `NOT_IMPLEMENTED` | Future shadow-mode research only after prerequisite contracts and benchmark |
| Training pipeline/model registry | `NOT_IMPLEMENTED` | Future extension only |
| HTTP service | `NOT_IMPLEMENTED` | Outside the current package boundary |
| UI/mobile package | `NOT_IMPLEMENTED` | Outside the current package boundary |
| PDF/OMR/Audiveris package | `NOT_IMPLEMENTED` | Outside the current package boundary |
| SesliTab adapter | `NOT_IMPLEMENTED` | Outside the current package boundary |

## Output status

| Output | Implementation | Verified base package-root availability | Milestone 3 target |
|---|---|---|---|
| Canonical JavaScript object | Merged | Public through conversion API | unchanged |
| JSON text | Merged writer | Not public | `serializeCanonicalTabResult` |
| TAB MusicXML | Merged writer | Not public | `serializeCanonicalTabResultToMusicXml` |
| ASCII TAB | Merged writer | Not public | `serializeCanonicalTabResultToAscii` |
| PDF | Not implemented | Not available | unchanged |

## Writer public-boundary constraints

Milestone 3 is export-only. It must preserve all existing writer behavior:

- `CanonicalTabResult` remains authoritative.
- Writers validate the shared canonical contract.
- Writers use `selectedPosition` only for rendered fingering.
- Writers do not generate candidates or invoke the optimizer.
- Existing option names and defaults remain unchanged.
- Existing writer error names, codes, and details remain unchanged internally.
- Public error-class decisions are deferred.

## Error-contract status

`src/errors/engineError.js` defines internal `EngineError 1.0.0`. Milestones 2D-1 through 2D-4 converged the repository's current domain error classes on that base without making `EngineError` a package-root API.

Milestone 3 does not change this decision. A future public error-boundary audit must separately evaluate exported classes, compatibility, external field guarantees, wrapping, causes, recoverability, and versioning.

## Guitar-configuration status

The current internal configuration supports six strings, standard tuning by default, validated custom open-string MIDI values, and configurable fret range. It is already consumed by candidate generation and copied into canonical TAB results.

A future `GuitarConfiguration 1.0` milestone should strengthen and version this existing boundary rather than create a competing configuration model. Alternative tunings must remain physically validated before optimizer or learned-ranking use.

## CI supply-chain status

Repository workflow action references were pinned to immutable full commit SHAs in SEC-CI-1. Workflow permissions and runtime matrices were preserved during that change. Any future action update must be reviewed as a dependency/supply-chain change rather than silently returning to mutable tags.

## Repository governance status

- `main` is reported as protected with seven required checks.
- Required-check enforcement remains `non_admins`; administrator-bypass hardening is still open.
- The latest read-only inspection returned no repository rulesets.
- Historical Draft PR #24 was closed without merge after its 2C-2 work was verified as superseded on `main`.

These are repository-governance facts, not package capabilities.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- Compatibility evidence is tied to named versions, fixtures, and workflow environments.
- MuseScore and alphaTab evidence does not cover unsupported chords, polyphony, tuplets, grace notes, multipart, or multistaff scores.
- No package release has been published because the package is private and `UNLICENSED`.
- Pull-request CI validates the tested branch tree; merged `main` remains the authority for implemented behavior.
- Milestone 3 must not be marked `VERIFIED_ON_MAIN` until its exact head passes required CI and the PR is separately approved and merged.

## Status governance

1. Only merged behavior may be marked `VERIFIED_ON_MAIN` or `IMPLEMENTED_NOT_PUBLIC`.
2. Use `BRANCH_ONLY` for Milestone 3 until merge.
3. Record exact commits and workflow runs for material runtime claims.
4. Re-run Node.js 18, 20, and 22 when runtime behavior, dependencies, entry points, or tests change.
5. Re-run MusicXML compatibility checks when parser, canonical contracts, tuning, rhythm, selected-position, writer behavior, or writer package exposure changes.
6. Update this file when `package.json`, `package-lock.json`, `src/index.js`, schemas, dependencies, outputs, error surface, or CI evidence changes.
7. Do not describe unavailable evidence as passed.
8. Do not expose `EngineError` or writer error classes merely because their implementations are stable; those package-root changes require the separate public error-boundary gate.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External MuseScore and browser compatibility checks require the dedicated workflow or documented compatibility environment.
