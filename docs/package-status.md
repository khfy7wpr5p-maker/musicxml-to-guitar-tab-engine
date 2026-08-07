# Package and Verification Status

This document records the package surface represented by this repository tree. The authoritative baseline immediately before PEB-1 is `24b92e26b5f9c84451caa2a8ef2432ffbd79e711`, the squash merge of PR #36 (Milestone 3 public writer API). If this file is viewed on an unmerged branch, new exports in that branch are not authoritative until merged into `main`.

## Package metadata

| Field | Value |
|---|---|
| name | `musicxml-to-guitar-tab-engine` |
| version | `0.1.0` |
| private | `true` |
| main | `src/index.js` |
| Node.js engine | `>=18` |
| runtime dependency | `saxes@6.0.0` |
| license | `UNLICENSED` |

PEB-1 does not change package metadata, dependencies, lockfiles, Node.js support, workflows, schemas, or writer implementation files.

## Verified Milestone 3 evidence

PR #36 final head `27f0120cd2294cf314f2ec715f135b2a2b8fd294` passed:

- Tests #232 on Node.js 18, 20, and 22
- MusicXML Compatibility #101, including Node.js 18/20/22 alphaTab import/SVG checks and the Node.js 22 browser renderer/cursor/synth diagnostic

It was squash merged as `24b92e26b5f9c84451caa2a8ef2432ffbd79e711`.

PEB-1 requires fresh exact-head CI because it changes `src/index.js`, the shared error helper, and package-root regression tests.

## Package-root public API in this tree

| Export | Purpose |
|---|---|
| `convertMusicXmlToCanonicalTab` | public deterministic MusicXML → canonical TAB conversion |
| `preflightMusicXml` | public PASS/WARNING/BLOCKED inspection |
| `PREFLIGHT_STATUS` | preflight status constants |
| `getPositionCandidates` | physical string/fret candidates for MIDI pitch |
| `positionToMidi` | validated string/fret → MIDI conversion |
| `validateMidi` | fretboard MIDI validation |
| `FretboardError` | pre-existing public fretboard error compatibility class |
| `serializeCanonicalTabResult` | deterministic canonical JSON serialization |
| `serializeCanonicalTabResultToAscii` | deterministic six-string ASCII TAB serialization |
| `serializeCanonicalTabResultToMusicXml` | deterministic notation + TAB MusicXML serialization |
| `ENGINE_ERROR_CONTRACT_VERSION` | public error contract version identifier |
| `isEngineError` | nominal detector for errors inheriting from the internal engine error base |

The three serializers were merged in Milestone 3. The final two symbols are the PEB-1 additions represented by this tree.

## Error boundary

Internal `EngineError 1.0.0` remains the shared base for current domain errors, but the `EngineError` class itself is not package-root public.

PEB-1 intentionally keeps these internal:

- `EngineError`
- `GuitarConfigurationError`
- `CanonicalTabResultError`
- `CanonicalTabJsonWriterError`
- `CanonicalTabAsciiWriterError`
- `CanonicalTabMusicXmlWriterError`
- parser, validation, canonical-model, fingering, optimizer, and other domain subclasses

`isEngineError` is nominal, not structural. It is intended for caught errors from this package and rejects native `Error` objects and plain lookalikes.

For detected engine errors, consumers may inspect `name`, `code`, `details`, and `message`; programmatic decisions should prefer `code`.

PEB-1 changes no existing error code, message-generation rule, detail shape, wrapping behavior, writer adaptation, or preflight classification.

## Capability status

| Area | Status |
|---|---|
| XML normalization/safety and structural ceilings | implemented |
| centralized processing budget / deadline / cancellation | implemented |
| hostile-input regression corpus | implemented |
| immutable parsed MusicXML and one-pass semantics | implemented |
| public preflight + conversion | implemented |
| immutable canonical music | implemented |
| six-string tuning/configuration foundation | implemented internally |
| physical candidate generation | implemented |
| deterministic cost model and DP optimizer | implemented |
| immutable `CanonicalTabResult 1.0.0` | implemented |
| canonical JSON schema + shared runtime validator | implemented |
| JSON / ASCII TAB / TAB MusicXML writers | implemented and public |
| internal `EngineError 1.0.0` convergence | implemented |
| PEB-1 error detection/version boundary | implemented in this tree; authoritative only once merged |
| public/versioned `GuitarConfiguration 1.0` | partial |
| optimizer observation contract | not implemented |
| pedagogical feature vector | not implemented |
| teacher feedback contract | not implemented |
| fixed teacher benchmark | not implemented |
| learned candidate ranking | not implemented |
| HTTP/UI/PDF/OMR/Audiveris/SesliTab | outside current package scope |

## Writer boundary

All public writers consume `CanonicalTabResult`, validate the shared canonical contract, and use authoritative `selectedPosition` data. They do not generate candidates or invoke the optimizer. PEB-1 does not alter any writer option, output format, or writer-specific error code.

## CI and supply-chain status

- Node.js 18, 20, and 22 are tested in CI.
- MusicXML compatibility workflows cover alphaTab and browser rendering diagnostics for the supported monophonic output boundary.
- Third-party GitHub Actions are pinned to immutable full commit SHAs.
- Passing CI is evidence for the tested commit only; exact-head PR evidence must be checked before Ready/merge.

## Repository governance

- `main` is protected with seven required checks.
- Required-check enforcement still reports `non_admins`; administrator bypass hardening remains open.
- Latest read-only inspection returned no repository rulesets.
- PR #24 is closed without merge as superseded.

## Next package milestone after PEB-1

`GuitarConfiguration 1.0`: strengthen the existing immutable six-string configuration foundation with a stable version/identity and pitch↔MIDI consistency before broader alternative-tuning or learning-system work.

## Reproduction

```bash
npm ci --ignore-scripts
npm test
```

Use dedicated GitHub workflows for the full Node.js matrix and MusicXML compatibility evidence.
