# Package and Verification Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

## Package metadata

- name: `musicxml-to-guitar-tab-engine`
- version: `0.1.0`
- `private: true`
- license: `UNLICENSED`
- Node.js >=18
- runtime dependency: `saxes@6.0.0`
- public canonical result: `CanonicalTabResult 1.0.0`

GitHub repository visibility and package publication are distinct. A public repository does not change `private: true` and does not publish a package.

## Public package-root API

`src/index.js` exposes exactly:

| Export | Purpose |
|---|---|
| `ENGINE_ERROR_CONTRACT_VERSION` | public error-contract version |
| `FretboardError` | public fretboard error |
| `PREFLIGHT_STATUS` | preflight states |
| `convertMusicXmlToCanonicalTab` | supported deterministic conversion |
| `getPositionCandidates` | physical guitar candidate helper |
| `isEngineError` | nominal public error detector |
| `positionToMidi` | position → MIDI helper |
| `preflightMusicXml` | MusicXML preflight |
| `serializeCanonicalTabResult` | deterministic JSON |
| `serializeCanonicalTabResultToAscii` | deterministic ASCII TAB |
| `serializeCanonicalTabResultToMusicXml` | deterministic TAB MusicXML |
| `validateMidi` | MIDI validation |

No internal PA, teacher benchmark, revoicing, GuitarSet model, or shadow function is package-root exported.

## Capability matrix

| Capability | Status |
|---|---|
| XML safety / ProcessingBudget / hostile limits | ✅ VERIFIED |
| ParsedMusicXmlDocument 1.0.0 | ✅ VERIFIED |
| Public monophonic semantic projection | ✅ VERIFIED |
| CanonicalMusicDocument | ✅ VERIFIED |
| Physical guitar candidates | ✅ VERIFIED |
| Deterministic cost + DP optimizer | ✅ VERIFIED |
| CanonicalTabResult 1.0.0 | ✅ PUBLIC |
| JSON / ASCII / TAB MusicXML writers | ✅ PUBLIC |
| PA-1 through PA-7 source/reduction/voicing foundations | ✅ INTERNAL |
| PA-8 `LeftHandShapeModel 1.0.0` | ✅ INTERNAL |
| PA-9 `PhysicalPlayabilityValidation 2.0.0` | ✅ INTERNAL |
| PA-10.3 compatibility/migration matrix | ✅ MERGED DOC |
| PA-10.4 CanonicalTabResult 2.0 proposal | ✅ MERGED DOC |
| PA-10.5 version-dispatch contract | ✅ MERGED DOC |
| Runtime CanonicalTabResult 2.0 validator | 🔒 NOT IMPLEMENTED |
| Runtime v1/v2 dispatcher | 🔒 NOT IMPLEMENTED |
| PA-11 teacher evaluation | ✅ through PA-11.4A |
| Production polyphonic final selector | 🔒 NOT IMPLEMENTED |
| Public polyphonic arrangement API | 🔒 NOT IMPLEMENTED |
| GuitarSet v2 offline adapter parity | ✅ COMPLETE |
| GuitarSet v2 controlled offline execution | ✅ GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE |
| Runtime learned selection | 🔒 CLOSED |
| Production playback | 🔒 NOT VERIFIED |
| MuseScore semantic round-trip | 🔒 NOT VERIFIED |
| Production PDF | 🔒 NOT IMPLEMENTED |
| Application UI/persistence/export | 🔒 NOT IMPLEMENTED |

## GuitarSet v2 package boundary

`GUITARSET-OBSERVED-VOICING-MODEL.v2` candidate domain is 0..20 and matches PA-7. Python↔Node parity and exact-main controlled-offline evidence are complete. Observed positive GuitarSet gold remains 0..19, therefore `fret20QualityAuthority=false`.

Evidence status: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`.

- immutable artifact: `evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`
- artifact byte SHA-256: `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba`
- exact engine commit: `acdb66e2bb2ad809ab45fc7c2183d84280d61ad7`
- candidate-bearing coverage: 4/4
- candidate preservation: 153/153
- determinism: 10/10

The v2 path remains internal and isolated:

- controlled repository-fixture execution: complete
- live/user input: false
- runtime connection: false
- authoritative optimizer/canonical/TAB effect: false
- production: false

Next human/consequential gate: `RUNTIME_SHADOW_CONNECTION_REVIEW`.

## Compatibility verification

PR #136 adapter-parity baseline:

- Tests #764: PASS on Node.js 18/20/22
- MusicXML Compatibility #533: PASS
- alphaTab 1.8.4 MusicXML import and SVG render: verified
- alphaTab browser renderer/cursor: verified
- synth: diagnostic only and `continue-on-error`; not production readiness
- MuseScore: CI availability probe only; import/re-export/round-trip/PDF not proven

## Release boundary

No npm/public package release, production application, public polyphonic API, runtime learned-selection authority, or production PDF/playback claim is made. Historical contract/closure/evidence documents retain their original exact stage context and are not a live package-status source.
