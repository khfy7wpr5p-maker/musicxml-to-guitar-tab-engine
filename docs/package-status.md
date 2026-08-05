# Package and Verification Status

This document records the package surface and the strongest available test evidence for capabilities on the authoritative `main` branch. It does not promote draft pull-request behavior to a released or merged capability.

## Snapshot

- Status date: 2026-08-05
- Verified `main` commit: `3f864d7e822e2025d723ab50dca2838e522b1363`
- Latest runtime-changing merged baseline: `460658ac6d8a0dce82882e5d1668bea8a4f9e050`
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private
- License metadata: `UNLICENSED`

The difference from the runtime baseline to the verified snapshot is documentation-only canonical-contract audit work. No source, dependency, package entry point, or test behavior changed in that commit.

## Verification labels

| Label | Meaning |
|---|---|
| `VERIFIED_ON_MAIN` | Present on `main` and exercised by a successful current `main` test run |
| `VERIFIED_ON_MERGED_RUNTIME_BASE` | Present on `main`; strongest compatibility evidence comes from the merged runtime-changing pull request or its tested head |
| `IMPLEMENTED_NOT_PUBLIC` | Merged and tested internally, but not exported through the package root |
| `DRAFT_VERIFIED` | Branch or pull-request implementation has successful evidence but is not merged into `main` |
| `NOT_IMPLEMENTED` | No merged implementation exists |
| `EVIDENCE_LIMITED` | Implementation exists, but a named verification layer was unavailable or incomplete |

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

This status document is not a fresh vulnerability audit. Dependency security must be rechecked separately when dependencies or lockfiles change and before a release decision.

## Current CI evidence

### Current `main` test matrix

GitHub Actions Tests run #166 completed successfully for commit `3f864d7e822e2025d723ab50dca2838e522b1363`.

| Runtime | Result |
|---|---|
| Node.js 18 | Passed |
| Node.js 20 | Passed |
| Node.js 22 | Passed |

The workflow installs with `npm ci --ignore-scripts` and runs the complete `npm test` command.

### Merged runtime and compatibility baseline

The latest runtime-changing merged public-API work was validated before merge with:

- Tests #158 on Node.js 18, 20, and 22
- MusicXML Compatibility #49
- alphaTab importer checks
- alphaTab SVG rendering
- alphaTab browser rendering and cursor checks

The TAB MusicXML writer milestone also recorded real MuseScore Studio 4.7.4 import, round-trip, and rendering evidence, together with alphaTab compatibility evidence.

The compatibility workflow does not run on every `main` documentation push. Therefore this document does not claim a new compatibility execution for the documentation-only snapshot. It carries forward the merged runtime baseline because the intervening `main` change did not modify runtime files.

## Package-root public API

The current `src/index.js` exports exactly the following package-root symbols:

| Export | Status | Purpose |
|---|---|---|
| `convertMusicXmlToCanonicalTab` | `VERIFIED_ON_MAIN` | Runs controlled preflight and canonical TAB conversion |
| `preflightMusicXml` | `VERIFIED_ON_MAIN` | Classifies supported input as `PASS`, `WARNING`, or `BLOCKED` |
| `PREFLIGHT_STATUS` | `VERIFIED_ON_MAIN` | Public status constants for preflight reports |
| `getPositionCandidates` | `VERIFIED_ON_MAIN` | Returns valid standard-guitar positions for a MIDI pitch and configuration |
| `positionToMidi` | `VERIFIED_ON_MAIN` | Converts a validated string/fret position to MIDI |
| `validateMidi` | `VERIFIED_ON_MAIN` | Validates MIDI input for fretboard operations |
| `FretboardError` | `VERIFIED_ON_MAIN` | Existing fretboard error class preserved for compatibility |

No writer is currently exported through the package root.

## Internal module and capability status

| Capability or package area | Status | Evidence boundary |
|---|---|---|
| XML safety | `VERIFIED_ON_MAIN` | Unit/security tests in the full Node.js matrix |
| MusicXML structural validation | `VERIFIED_ON_MAIN` | Validation and malformed-input tests |
| MusicXML preflight | `VERIFIED_ON_MAIN` | `PASS`, `WARNING`, and `BLOCKED` contract tests |
| Monophonic MusicXML parser | `VERIFIED_ON_MAIN` | Parser, rhythm, unsupported-feature, and regression tests |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` | Invariant, immutability, ordering, and duration tests |
| Guitar tuning/fretboard/playability | `VERIFIED_ON_MAIN` | Candidate, MIDI, fret-limit, and unplayable-note tests |
| Candidate-layer builder | `VERIFIED_ON_MAIN` | Candidate membership/order and canonical traversal tests |
| Fingering cost model | `VERIFIED_ON_MAIN` | Cost breakdown, invalid profile, movement-limit, and overflow tests |
| Fingering optimizer | `VERIFIED_ON_MAIN` | Determinism, stable tie-breaking, path reconstruction, and long-path regression tests |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` | Golden result, invariants, immutability, warnings, and selected/alternative position tests |
| Conversion pipeline | `VERIFIED_ON_MAIN` | Public conversion behavior after preflight |
| JSON writer module | `IMPLEMENTED_NOT_PUBLIC` | Merged deterministic serialization, round-trip, safety, and immutability tests; not exported by `src/index.js` |
| TAB MusicXML writer module | `IMPLEMENTED_NOT_PUBLIC` | Merged deterministic writer tests plus MuseScore and alphaTab evidence; not exported by `src/index.js` |
| ASCII TAB writer | `DRAFT_VERIFIED` | Draft pull request #16 reports successful Node.js and compatibility checks; not present on `main` |
| Shared canonical schema and validator | `NOT_IMPLEMENTED` | Contract audit exists, but central machine-verifiable enforcement has not been merged |
| Unified public engine error model | `NOT_IMPLEMENTED` | Low-level error contracts remain distributed by layer |
| Single-pass shared parser representation | `NOT_IMPLEMENTED` | Current successful conversion still requires architectural consolidation |
| Learned candidate scorer | `NOT_IMPLEMENTED` | Future extension only |
| Teacher-feedback event package | `NOT_IMPLEMENTED` | Future contract only |
| Training pipeline/model registry | `NOT_IMPLEMENTED` | Future extension only |
| HTTP service | `NOT_IMPLEMENTED` | Outside current package boundary |
| UI/mobile package | `NOT_IMPLEMENTED` | Outside current package boundary |
| PDF/OMR/Audiveris package | `NOT_IMPLEMENTED` | Outside current package boundary |
| SesliTab adapter | `NOT_IMPLEMENTED` | Outside current package boundary |

## Output status

| Output | Implementation | Package-root availability | Strongest evidence |
|---|---|---|---|
| Canonical JavaScript object | Merged | Public through conversion API | Main test matrix |
| JSON text | Merged internal writer | Not public | Deterministic golden and round-trip tests |
| TAB MusicXML | Merged internal writer | Not public | Writer tests, MuseScore 4.7.4, alphaTab importer/SVG/browser evidence |
| ASCII TAB | Draft pull request | Not public and not merged | Draft PR #16 CI only |
| PDF | Not implemented | Not available | None |

## Dependency status

| Dependency | Version | Role | Current handling |
|---|---|---|---|
| `saxes` | `6.0.0` | Streaming SAX XML parser | Pinned runtime dependency in package and lockfile |

Development-only compatibility tools such as alphaTab, Puppeteer, browser executables, and MuseScore are used in isolated verification workflows or recorded compatibility exercises. They are not production dependencies of this package unless package metadata later changes.

## Evidence limitations

- A passing unit test does not prove compatibility with every MusicXML producer.
- Compatibility evidence is tied to named versions and fixtures.
- The recorded MuseScore and alphaTab evidence applies to the merged writer baseline and tested fixtures, not to unsupported chords, polyphony, tuplets, grace notes, multipart, or multistaff scores.
- The alphaTab synthesizer diagnostic has previously shown a headless-runtime limitation; importer and rendering evidence remain separate from audio-synthesis readiness.
- No release package has been published because the package is private and marked `UNLICENSED`.

## Status governance

Use these rules when updating this file:

1. Only merged `main` behavior may be marked `VERIFIED_ON_MAIN` or `IMPLEMENTED_NOT_PUBLIC`.
2. Successful pull-request CI may be recorded as `DRAFT_VERIFIED` but must not promote the capability to current package status.
3. Record the exact commit or workflow evidence for material runtime claims.
4. Re-run the Node.js 18, 20, and 22 matrix when runtime behavior, dependencies, package entry points, or tests change.
5. Re-run compatibility checks when parser, canonical contracts, selected-position semantics, tuning, rhythm handling, or writers change.
6. Update this file when `package.json`, `package-lock.json`, `src/index.js`, workflows, canonical schema, dependencies, or output availability changes.
7. Do not describe a missing test as passed; use `EVIDENCE_LIMITED` and name the gap.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

These commands reproduce the repository test suite. External MuseScore and browser compatibility checks require the dedicated workflow or documented compatibility environment.