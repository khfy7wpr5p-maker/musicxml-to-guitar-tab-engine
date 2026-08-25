# Package and Verification Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-24 -->

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146. PA-12 internal end-to-end implementation: PR #150.

## Package metadata

- name: `musicxml-to-guitar-tab-engine`
- version: `0.1.0`
- `private: true`
- license: `SEE LICENSE IN LICENSE`
- Node.js >=18
- runtime dependency: `saxes@6.0.0`
- public canonical result: `CanonicalTabResult 1.0.0`

GitHub repository visibility and package publication are distinct. A public repository does not change `private: true` and does not publish a package.

## Public package-root API

`src/index.js` continues to expose exactly the approved public error, preflight, fretboard, deterministic conversion and JSON/ASCII/TAB MusicXML writer APIs. No PA, teacher benchmark, revoicing, GuitarSet model, shadow adapter or runtime-shadow bridge is package-root exported.

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
| Deterministic single-generation PA-7 handoff | ✅ INTERNAL |
| PA-8 `LeftHandShapeModel 1.0.0` | ✅ INTERNAL |
| PA-9 `PhysicalPlayabilityValidation 2.0.0` | ✅ INTERNAL |
| PA-10.3 compatibility/migration matrix | ✅ MERGED DOC |
| PA-10.4 CanonicalTabResult 2.0 proposal | ✅ MERGED DOC |
| PA-10.5 version-dispatch contract | ✅ MERGED DOC |
| Runtime CanonicalTabResult 2.0.0 producer/validator | ✅ INTERNAL |
| CanonicalTabResult 2.0.0 MusicXML writer | ✅ INTERNAL |
| Deterministic final polyphonic selector | ✅ INTERNAL / NON-ML / FAIL-CLOSED |
| PA-12 internal polyphonic E2E | ✅ INTERNAL / NON-PUBLIC |
| Runtime v1/v2 dispatcher | 🔒 NOT IMPLEMENTED |
| PA-11 teacher evaluation | ✅ through PA-11.4A |
| Production polyphonic final selector | 🔒 NOT IMPLEMENTED |
| Public polyphonic arrangement API | 🔒 NOT IMPLEMENTED |
| GuitarSet v2 offline adapter parity | ✅ COMPLETE |
| GuitarSet v2 controlled offline execution | ✅ `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE` |
| GuitarSet v2 runtime shadow connection | ✅ INTERNAL DEFAULT-OFF — `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1` |
| Runtime learned selection authority | 🔒 CLOSED |
| Guitar TAB Workbench browser UI | ✅ IMPLEMENTED / GUARDED MONO_V1 + POLY_V2 HOST SEAMS |
| GitHub Pages Workbench preview | ✅ STATIC / READ-ONLY / NO RUNTIME AUTHORITY |
| Same-origin Runtime Host | 🟡 STAGING IMPLEMENTATION / NON-PRODUCTION |
| Hosted persistence / multi-user state / export service | 🔒 NOT IMPLEMENTED |
| Production playback | 🔒 NOT VERIFIED |
| MuseScore semantic round-trip | 🔒 NOT VERIFIED |
| Production PDF | 🔒 NOT IMPLEMENTED |

## GuitarSet v2 package boundary

`GUITARSET-OBSERVED-VOICING-MODEL.v2` candidate domain is 0..20 and matches PA-7. Observed positive GuitarSet gold remains 0..19, therefore `fret20QualityAuthority=false`.

Historical controlled-offline evidence remains:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

The internal runtime-shadow seam now consumes the same authentic single-generation PA-7 lineage used by deterministic PA-8/PA-9 selection and passes only a detached deeply frozen read-copy to the v2 scoring adapter.

Authority boundary:

- runtime shadow connection: internal default-off
- live/user input: false
- learned candidate generation/mutation/filter/deletion: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation/refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- public package-root exposure: false

The retained model artifact is not rewritten: its own runtime/shadow authorization fields remain false. Engine-side connection permission exists only in the reviewed internal bridge.

## Runtime host package boundary

The same-origin staging host is an internal application host and is not exported from `src/index.js`. It exposes the existing bounded upload/edit seams to the browser while preserving immutable source bytes, exact source SHA identity and full server-side regeneration.

POLY_V2 browser tie/source evidence remains UI metadata. Before transport, the Workbench projects edit commands to the existing runtime schema; direct clients that add unknown fields such as browser-only tie metadata are rejected by the authoritative POLY_V2 runtime.

The staging host does not publish the npm package, does not grant public `CanonicalTabResult 2.0.0` authority and does not authorize production hosting.

## Compatibility verification baseline

PR #146 passed before merge:

- Node.js 18/20/22 complete tests
- alphaTab MusicXML import + SVG render on Node.js 18/20/22
- alphaTab browser renderer/cursor
- synth diagnostic
- MuseScore CLI availability

PR #165 subsequently merged UI-07 static and real-Chromium identity/command-projection gates without widening package-root or runtime authority. Each later change must pass the applicable protected matrix on its own exact head. The Runtime Host staging line also requires the dedicated real-browser upload/edit/regeneration E2E.

## Release boundary

No npm/public package release, production application, public polyphonic API, runtime learned-selection authority, live/user-input shadow activation, production PDF or production playback claim is made. Runtime shadow is diagnostic, internal and default-off. The same-origin Runtime Host is staging-only and does not create a production deployment claim.