# Package and Verification Status

This document records the current package surface, strongest verified runtime evidence and separately planned capability tracks. It distinguishes merged runtime behavior from tests-only evidence, compatibility evidence and future product architecture.

## Snapshot — 2026-08-12

- authoritative PA-2 verification closure baseline on `main`: `488d00f7ddfaac7a5c8552f03384e82c456f3328`
- closure Git tree: `8b86a7b8b27bd522dc8afdbe14b1884e6b21fdc7`
- latest merged runtime-changing feature: PR #81 — PA-2.5 internal `<chord/>`, multiple-voice and staff 1–2 projection
- PA-2.6 hardening: PR #83 — tests-only, rebase-merged on 2026-08-12
- post-merge Tests #617 on `main`: `SUCCESS`
- MusicXML Compatibility #438: `SUCCESS` on PR head `0ecc4f6222af668027b7d38b74aefddb8d90337f`; that commit and the rebased `main` baseline have the same Git tree
- PA-2.7 full regression + public monophonic compatibility: `VERIFIED`
- PA-2.8 GitHub CI + independent code/test review: `VERIFIED`; no P1/P2 blocker found
- PA-2 sequence: `CLOSED`
- next separately approved polyphonic gate: PA-3 simultaneous-event/chord contract
- GitHub repository visibility: `public`
- package name: `musicxml-to-guitar-tab-engine`
- package version: `0.1.0`
- npm/package publication guard: `private: true`
- license metadata: `UNLICENSED`
- Node.js engine: `>=18`
- runtime dependency: `saxes@6.0.0`
- canonical result: `CanonicalTabResult 1.0.0`
- public polyphonic conversion: not implemented
- production application UI / PDF / playback: not implemented
- real uploaded-file PA-2 E2E: not executed

GitHub repository visibility and npm/package publication state are separate controls. A `public` GitHub repository does **not** change `package.json` `private: true`, does not publish the package to npm and does not create a package release.

PA-2 closure does not create a public polyphonic API or alter the current public monophonic conversion boundary. PA-3 is not authorized by PA-2 completion.

## Package metadata

| Field | Value |
|---|---|
| GitHub repository visibility | `public` |
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` — npm/package publication guard; distinct from GitHub repository visibility |
| `main` | `src/index.js` |
| `test` | `node --test` |
| Node.js engine | `>=18` |
| Runtime dependency | `saxes@6.0.0` |
| License | `UNLICENSED` |

No public package release is claimed.

## Current package-root public API

`src/index.js` exposes exactly:

| Export | Purpose |
|---|---|
| `ENGINE_ERROR_CONTRACT_VERSION` | Public EngineError contract version identifier |
| `FretboardError` | Existing public fretboard error class |
| `PREFLIGHT_STATUS` | Public preflight status constants |
| `convertMusicXmlToCanonicalTab` | Public supported MusicXML-to-canonical-TAB conversion |
| `getPositionCandidates` | Physical guitar candidate helper |
| `isEngineError` | Public nominal detector for caught package errors |
| `positionToMidi` | Guitar position-to-MIDI helper |
| `preflightMusicXml` | Public MusicXML preflight API |
| `serializeCanonicalTabResult` | Deterministic canonical JSON serializer |
| `serializeCanonicalTabResultToAscii` | Deterministic six-string ASCII TAB serializer |
| `serializeCanonicalTabResultToMusicXml` | Deterministic TAB MusicXML serializer |
| `validateMidi` | MIDI validation helper |

The following remain intentionally internal: EngineError/domain subclasses, GuitarConfiguration metadata, Integration Contract metadata, observation/digest/feature/feedback/admission modules, B1/B2 benchmark/evaluation components, LR shadow/path-policy components, `PolyphonicSourceModel 1.0.0`, and the PA-2 projector.

## Package capability status

| Capability | Status |
|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` |
| XML/measure/event/deadline/cancellation limits | `VERIFIED_ON_MAIN` |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` |
| Current supported MusicXML validation/parser path | `VERIFIED_ON_MAIN` |
| Shared public monophonic semantic projection | `VERIFIED_ON_MAIN` |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` |
| Guitar configuration foundation | `VERIFIED_ON_MAIN_INTERNAL` |
| Fretboard/playability | `VERIFIED_ON_MAIN` |
| Deterministic fingering cost model | `VERIFIED_ON_MAIN` |
| Deterministic fingering optimizer | `VERIFIED_ON_MAIN` |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` |
| Canonical validator | `VERIFIED_ON_MAIN` |
| Public JSON / ASCII / TAB MusicXML writers | `VERIFIED_ON_MAIN` |
| EngineError / PEB-1 | `VERIFIED_ON_MAIN` |
| S1/S2 observation integrity | `VERIFIED_ON_MAIN_INTERNAL` |
| TeacherFeedback 1.1.0 | `VERIFIED_ON_MAIN_INTERNAL` |
| S3/S3.1 admission foundations | `VERIFIED_ON_MAIN_INTERNAL` |
| B1 fixed teacher benchmark | `VERIFIED_ON_MAIN_INTERNAL` |
| B2 deterministic evaluation harness | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S0 shadow ranking foundation | `VERIFIED_ON_MAIN_INTERNAL_SHADOW_ONLY` |
| LR-S1A shadow benchmark evaluation | `VERIFIED_ON_MAIN_INTERNAL_SHADOW_ONLY` |
| LR-S1B.1 path-policy snapshot/digest | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S1B.2a semantic replay verifier | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S1B.2b path-policy binding/digest | `VERIFIED_ON_MAIN_INTERNAL` |
| PA-1 `PolyphonicSourceModel 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| PA-2.1 projection contract | `MERGED_DOCUMENTATION_ONLY` — PR #75 |
| PA-2.2 valid polyphonic red-first fixtures/tests | `MERGED_TESTS_ONLY` — PR #77 |
| PA-2.3 minimal internal basic note/rest projection | `VERIFIED_ON_MAIN_INTERNAL` — PR #78 |
| PA-2.4 `backup` / `forward` cursor semantics | `VERIFIED_ON_MAIN_INTERNAL` — PR #80 |
| PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection | `VERIFIED_ON_MAIN_INTERNAL` — PR #81 |
| PA-2.6 hostile/budget/deadline/cancellation negatives | `MERGED_TESTS_ONLY` — PR #83; no production-code change |
| PA-2.7 full regression + monophonic compatibility | `VERIFIED` |
| PA-2.8 GitHub CI + independent review | `VERIFIED` — PA-2 closed |
| PA-3 simultaneous-event/chord contract | `NOT_STARTED` — separate approval required |
| PA-4+ polyphonic arrangement runtime | `NOT_IMPLEMENTED` |
| alphaTab MusicXML import | `COMPATIBILITY_VERIFIED` |
| alphaTab SVG rendering | `COMPATIBILITY_VERIFIED` |
| alphaTab browser rendering/cursor | `COMPATIBILITY_VERIFIED` |
| alphaTab production playback | `NOT_VERIFIED` |
| MuseScore real import/re-export | `NOT_EXECUTED` |
| MuseScore semantic round-trip | `NOT_EXECUTED` |
| Production PDF adapter | `NOT_IMPLEMENTED` |
| Application score/TAB viewer | `NOT_IMPLEMENTED` |
| Teacher correction UI | `NOT_IMPLEMENTED` |
| Project persistence | `NOT_IMPLEMENTED` |
| Production learned selection | `BLOCKED` |

## Current public musical compatibility boundary

The public package remains one-part, one-staff, one-voice and monophonic `score-partwise`.

Verified musical coverage includes notes/rests, pitch step/alter/octave, whole/half/quarter/eighth/16th values, dots, divisions, time signatures, pickup/implicit measures, ties and beam metadata.

Current public fail-closed boundaries include:

- chords / simultaneous note structures
- `backup` / `forward`
- multiple voices
- multiple staves
- multipart scores
- grace notes
- tuplets
- unsupported values such as 32nd rhythms
- compressed `.mxl`

PA-2 internal projection support must not be mistaken for public conversion support. Future notation or arrangement work must add authority explicitly and must not obtain compatibility by deleting rejection checks.

## Output status

| Output | Package-root/core availability | Application availability |
|---|---|---|
| Canonical JavaScript result | Public through current conversion API | no application shell yet |
| JSON text | Public | no download/share UI yet |
| ASCII TAB | Public | no download/share UI yet |
| TAB MusicXML | Public | no download/share UI yet |
| alphaTab viewer | Compatibility evidence only | not implemented as product UI |
| MuseScore rendering | Not a core dependency | not implemented |
| PDF | Not implemented in core | not implemented |
| Polyphonic source model | Internal only | no application integration |
| Polyphonic arrangement result | Not implemented | not implemented |
| Chord-aware canonical result | Not implemented | not implemented |

All current writers consume validated `CanonicalTabResult 1.0.0` and do not regenerate candidates or rerun optimization.

## B1/B2 and learning boundary

B1 remains fixed independent evaluation infrastructure and is not exported from `src/index.js`.

Current B2 baseline remains:

| Metric | Count |
|---|---:|
| Benchmark cases | 8 |
| Benchmark events | 32 |
| Acceptable matches | 32 |
| Preferred-eligible events | 28 |
| Preferred matches | 26 |
| Case passes | 8 |
| Candidate-coverage failures | 0 |
| Blocked conversions | 0 |

B1 must remain separate from future training data if it is to continue serving as independent evaluation evidence.

Current LR components remain internal/non-authoritative. LR-S0 uses `mode: "shadow"` and `authority: "none"`; LR-S1A evaluates shadow behavior against B1; LR-S1B.1/2a/2b bind and replay deterministic fingering policy evidence. No LR stage authorizes production learned selection.

## TeacherFeedback package boundary

`TeacherFeedback 1.1.0` remains internal. It records `accept`, `override` to an exact same-event validated candidate, or `reject`. It cannot alter pitch/rhythm/event identity, generate new physical candidates, mutate `CanonicalTabResult`, bypass physical validation or authorize model training.

Future application work must separate Teacher Fingering Correction from Teacher Score Correction.

## Compatibility evidence

### alphaTab

The compatibility suite verifies MusicXML import, SVG rendering, browser rendering in headless Chrome, standard notation + six-line TAB, fret 10, ties/beams, bar/measure cursor and beat cursor.

The tested alphaTab 1.8.4 synthesizer path remains unverified because an internal recursive `loadedMidiInfo` runtime error occurred before score/MIDI/SoundFont/player readiness. Playback remains a separate future gate.

### MuseScore

MuseScore Studio was not installed in the tested environments. Real import, re-export, semantic round-trip and PDF export remain unexecuted. Planned semantic round-trip must compare musical meaning rather than XML bytes.

MuseScore is an independent compatibility/engraving/PDF adapter target, not deterministic-core authority.

## PA package boundary

PA-0 architecture/documentation and PA-1 `PolyphonicSourceModel 1.0.0` are merged. PA-2.1 defines the projection contract; PA-2.2 supplies red-first evidence; PA-2.3 adds internal note/rest projection; PA-2.4 adds cursor semantics; PA-2.5 adds source chord/multiple-voice/staff-2 projection; PA-2.6 adds tests-only hostile/budget/deadline/cancellation hardening; PA-2.7 verifies full regression/public monophonic compatibility; PA-2.8 verifies GitHub CI and independent code/test review.

```text
ParsedMusicXmlDocument 1.0.0
  ├─ current monophonic projection → current deterministic TAB core
  └─ PA-2 runtime projector → PolyphonicSourceModel 1.0.0
                           ↓
                     PA-3+ arrangement contracts
                           ↓
                     GuitarArrangementPlan
                           ↓
                     guitar-compatible score
                           ↓
                     Physical Playability Validator v2
```

PA-2 is closed but creates no public polyphonic conversion or package-root API. PA-3 simultaneity/chord grouping is the next separately gated contract and is not authorized by this closure. `CanonicalTabResult 1.0.0` remains unchanged.

## Application / presentation package boundary

The repository currently has no production application shell. Planned downstream capabilities include open/preflight/convert, score+TAB viewer, measure/beat cursor, playback after stable evidence, error/warning presentation, fingering inspector, Teacher Fingering Correction, separately controlled Teacher Score Correction, export center, MuseScore/PDF adapter, PDF preview/print/share, project persistence and application E2E.

These are not package-root engine responsibilities and must remain adapter-bound.

## Controlled next sequence — 2026-08-12

1. PA-2.6 hostile/budget/deadline/cancellation negatives — completed tests-only through PR #83
2. PA-2.7 full regression + monophonic compatibility — verified
3. PA-2.8 GitHub CI + independent review — verified; PA-2 closed
4. PA-3 simultaneous-event/chord contract — next separately approved polyphonic gate
5. later PA-4…PA-14 only in their separately approved order
6. Musical Notation Coverage contract — separately gated
7. MuseScore semantic compatibility — separately gated
8. independent real-world MusicXML E2E fixture gate — not yet executed
9. Application/Presentation architecture and downstream UI/rendering gates — separately gated
10. production learning/training — blocked until durable storage, privacy/consent/lawful-use, authorized dataset, model lifecycle and independent evaluation prerequisites exist

Completion of PA-2 does not authorize PA-3.

## CI and governance

- third-party workflow actions remain SHA-pinned
- `main` remains protected
- required Node.js 18/20/22 and compatibility contexts are configured
- G0.1 administrator enforcement is completed
- historical branch audit is completed
- repository settings/workflow-architecture changes remain separate approval gates

## Evidence limitations

- passing repository tests do not prove compatibility with every MusicXML producer
- Compatibility #438 ran on PR commit `0ecc4f...`, not the rebased `main` commit SHA; equivalence is supported by the identical Git tree `8b86a7b8...`
- no current evidence proves a real uploaded Audiveris/Scarlatti file was executed through the PA-2 projector
- alphaTab compatibility evidence does not equal a production application or production synth readiness
- no current test proves MuseScore semantic round-trip or production PDF generation
- PA-2 internal projection does not make public polyphonic conversion available
- B1/B2/LR completion does not authorize live training data or production learned selection
- content digests do not prove trusted producer authenticity
- no package release is claimed

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.