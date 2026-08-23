# MusicXML to Guitar TAB Engine — Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

## 1. Authority model

The system deliberately separates the protected public deterministic path from internal polyphonic, teacher-evaluation, and learned/shadow paths. `CanonicalTabResult 1.0.0` remains the only public TAB authority. No internal helper becomes authoritative merely because it is merged on `main`.

Package: version `0.1.0`, `private: true`, `UNLICENSED`, Node.js >=18.

## 2. Public deterministic engine

```text
MusicXML
 ↓
XML normalization/safety + ProcessingBudget/deadline/cancellation
 ↓
ParsedMusicXmlDocument 1.0.0
 ↓
supported monophonic semantic projection
 ↓
CanonicalMusicDocument
 ↓
GuitarConfiguration + physical string/fret candidates
 ↓
deterministic fingering cost model
 ↓
dynamic-programming optimizer
 ↓
CanonicalTabResult 1.0.0
 ↓
shared canonical validator
 ↓
JSON | ASCII TAB | TAB MusicXML
```

Parser authority, guitar-candidate authority, optimizer authority, canonical-result authority and writer authority remain separate. Writers serialize selected positions and never re-optimize.

## 3. Internal polyphonic architecture

```text
Polyphonic MusicXML
 ↓
XML Safety + ProcessingBudget
 ↓
ParsedMusicXmlDocument 1.0.0
 ↓
PA-1 PolyphonicSourceModel 1.0.0
 ↓
PA-2 bounded polyphonic projector
 ↓
PA-3 SimultaneousEventModel 1.0.0
 ↓
PA-4 GuitarArrangementPlan 1.0.0
 ↓
PA-5 DeterministicVoiceAnalysis 1.0.0
 ↓
PA-6 DeterministicReductionPlan 1.0.0
 ↓
PA-7 GuitarVoicingCandidateModel 1.0.0 (0..20 fret)
 ↓
PA-8 LeftHandShapeModel 1.0.0
 ↓
PA-9 PhysicalPlayabilityValidation 2.0.0
 ↓
PA-10 canonical-v2 design/compatibility contracts
 ↓
PA-11 independent teacher-evaluation infrastructure through PA-11.4A
 ↓
future final polyphonic selector
 ↓
future CanonicalTabResult 2.0.0 runtime
 ↓
future PA-12 E2E / PA-13 public polyphonic API
```

PA-1 through PA-9 are merged internal foundations. PA-10.0 through PA-10.5 are merged contract/design evidence. PA-11 is merged evaluation infrastructure through PA-11.4A. Final production arrangement selection is not implemented.

## 4. PA responsibilities

- **PA-1/2:** preserve/project bounded source truth; no guitar selection.
- **PA-3:** group exact simultaneous source events; no arrangement authority.
- **PA-4:** represent explicit arrangement decisions/provenance; does not choose a policy.
- **PA-5:** deterministic onset-local register roles; not semantic melody/bass truth.
- **PA-6:** deterministic preserved/omitted/octave-displaced/conservative chord-reduced execution; deferred decision kinds remain fail-closed.
- **PA-7:** enumerate exact-target-MIDI, distinct-string standard-guitar candidates in fret domain 0..20; enumeration order is not ranking.
- **PA-8:** structural finger/barre candidates; no universal ergonomic or final-selection truth.
- **PA-9:** conservative static playability verdicts; `PLAYABLE_WITHIN_POLICY` is policy-specific, not universal comfort/anatomy/tempo truth.
- **PA-10.3:** v1↔v2 compatibility/migration matrix.
- **PA-10.4:** minimal `CanonicalTabResult 2.0.0` schema proposal only.
- **PA-10.5:** exact-version fail-closed dispatch contract only.
- **PA-11:** teacher-reviewed evaluation, replay and scoring; no production selection.
- **PA-11.4A:** evaluation-only revoicing tone candidate atoms; no complete production voicing composition/selection.

## 5. Canonical v1/v2 boundary

Current runtime implements and publishes only `CanonicalTabResult 1.0.0` for the supported monophonic conversion path. PA-10 documentation proves why polyphonic meaning needs a separate major schema and defines future requirements, but there is no runtime v2 validator, dispatcher, migration engine, v2 writer, or package-root polyphonic API.

A v1 artifact alone cannot be losslessly upgraded to future v2 because required source/arrangement provenance is absent. Canonical v2→v1 downgrade is not a lossless semantic operation.

## 6. Teacher evaluation architecture

Teacher benchmark evidence is independent evaluation truth, not training data and not production authority. The PA-11 chain binds exact source bytes and exact approved artifact bytes, validates source/shape/physical semantics, produces gold-blind observed output, and scores only after the engine result is frozen. The genuine blind baseline is 2/4 teacher-approved matches.

## 7. Learned/shadow architecture

Historical GuitarSet v1 is scientifically bound to candidate frets 0..19. Exact v1 offline evidence remains historical and must not be rewritten.

`GUITARSET-OBSERVED-VOICING-MODEL.v2` uses candidate domain 0..20. Python↔Node parity and exact-main controlled-offline execution are complete.

Evidence status: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`.

The immutable artifact `evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json` is byte-sealed to `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba` and binds engine commit `acdb66e2bb2ad809ab45fc7c2183d84280d61ad7`. It records 4/4 candidate-bearing coverage, 153/153 candidate preservation, one explicit zero-candidate NO_SCORE group, 1/4 baseline agreement, three disagreements, 48 fret-20 candidates, zero shadow errors, and 10/10 determinism.

Safety facts:

- observed positive-gold domain: 0..19;
- `fret20QualityAuthority=false`;
- candidate mutation/filter/truncation: false;
- controlled repository-fixture execution: complete;
- live/user input: false;
- runtime connection: false;
- authoritative optimizer/canonical/TAB effect: false;
- production: false.

Next human/consequential gate: `RUNTIME_SHADOW_CONNECTION_REVIEW`. The seal cannot wire the model into normal conversion.

## 8. Public compatibility boundary

Public monophonic validation remains fail-closed for chords/simultaneity, backup/forward, multiple voices/staves, multipart, grace notes, tuplets, unsupported 32nd rhythms and compressed `.mxl`. Internal PA support must never be exposed by weakening those checks.

## 9. Rendering/product boundary

```text
CanonicalTabResult 1.0.0
 ↓
TAB MusicXML
 ├─ alphaTab compatibility adapter
 └─ future MuseScore engraving/PDF adapter
```

PR #136 Tests #764 and MusicXML Compatibility #533 passed. alphaTab import, SVG render and browser renderer/cursor are compatibility-verified. Synth remains diagnostic, MuseScore semantic round-trip remains unverified, and PDF/application UI/persistence are not implemented. Renderers have no fingering authority.

### Preserved external-renderer / PDF security requirements

Any future MuseScore or external renderer adapter must preserve these controls unless a separately approved security review replaces them with equal-or-stronger controls:

- resolve only an explicitly approved renderer executable/version; user-supplied executable paths are not authority;
- invoke without a shell and with a fixed allowlisted argument shape; user-controlled command fragments/flags are forbidden;
- require no renderer network access and disable network access where deployment permits;
- use a job-owned isolated temporary directory; never inspect unrelated directories or share writable temp storage with unrelated services;
- reject path traversal and unsafe symlink/file-replacement conditions before read/write/delete/publish operations;
- never overwrite original MusicXML or caller-owned artifacts; renderer output is always a new derived artifact;
- cleanup only current-job files/directories on success, failure and timeout paths;
- enforce hard process timeout, process-tree termination where required and bounded concurrency; stronger CPU/memory ceilings belong at OS/container/worker boundary when needed;
- bound captured stdout/stderr and generated output size;
- validate claimed PDF output as non-empty and at minimum verify `%PDF-` signature plus configured type/size ceilings;
- missing renderer, unsupported version, spawn failure, timeout, invalid/empty output, path mismatch and cleanup failure must produce explicit fail-closed adapter errors;
- renderer/PDF failure must not destroy or invalidate an already valid deterministic core result, JSON, ASCII TAB or TAB MusicXML output;
- errors must avoid leaking secrets, credentials, unrestricted environment data, arbitrary filesystem contents or unnecessary command details;
- third-party renderer/tool versions and workflow actions remain reviewed and pinned/controlled under supply-chain policy;
- production rendering should use a separately bounded worker/service where stronger process/filesystem isolation is needed, with no unrelated writable mounts, secrets or deployment authority.

A future renderer gate needs negative evidence for missing/unsupported executable, argument/path injection, traversal/symlink escape, timeout/termination, excessive output/logs, empty/invalid PDF, unrelated-file preservation, current-job-only cleanup, and proof that core MusicXML/TAB outputs survive renderer failure.

These are architecture requirements only; they do not make MuseScore or PDF a current runtime capability.

## 10. Non-negotiable safety rules

1. Original MusicXML is immutable source truth.
2. XML/resource/deadline/cancellation hostile-input limits remain fail-closed.
3. Parsing never chooses guitar positions.
4. Structural XML validation and musical semantic projection remain separate.
5. Physical validity precedes learned scoring.
6. Deterministic public optimization remains reproducible and the mandatory fallback.
7. External systems integrate only through explicit versioned contracts/adapters.
8. Teacher approval cannot make an impossible shape physically valid and is not training consent.
9. Digests prove content correspondence, not trusted producer identity.
10. Fixed evaluation benchmarks remain separate from training.
11. PA-7 candidate order is deterministic enumeration, not preference/final selection.
12. Application UI/renderers/editors/persistence cannot directly mutate authoritative canonical objects.
13. Historical sealed evidence is immutable evidence, not a mutable status file.
14. Canonical-v2 design does not imply runtime-v2 implementation.
15. High-risk runtime changes require focused negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and explicit authority review.
16. Runtime shadow, final selection, public polyphony and production are separately gated.
