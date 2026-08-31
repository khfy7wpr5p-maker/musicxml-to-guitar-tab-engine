# Package and Verification Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

This is the live package-boundary view. Historical PR numbers, commit SHAs, corpus first-blocker reports, and sealed evidence remain revision-specific records and do not override current source/tests.

## Package metadata

- name: `musicxml-to-guitar-tab-engine`
- version: `0.1.0`
- `private: true`
- license: `SEE LICENSE IN LICENSE`
- Node.js >=18
- runtime dependencies include `saxes@6.0.0` and `@coderline/alphatab@1.8.4`
- public canonical result: `CanonicalTabResult 1.0.0`

GitHub repository visibility and package publication are distinct. A public repository does not change `private: true` and does not publish a package.

## Public package-root API

`src/index.js` continues to expose exactly the approved public error, preflight, fretboard, deterministic monophonic conversion, and JSON/ASCII/TAB MusicXML writer APIs. No PA/PS stage, teacher benchmark, revoicing module, GuitarSet model, shadow adapter, runtime-shadow bridge, `CanonicalTabResult 2.0.0` producer, or internal POLY_V2 conversion pipeline is package-root exported.

## Capability matrix

| Capability | Status |
|---|---|
| XML safety / ProcessingRuntime / hostile limits | ✅ VERIFIED |
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
| PA-10.3 compatibility/migration matrix | ✅ MERGED CONTRACT |
| PA-10.4 CanonicalTabResult 2.0 design | ✅ MERGED CONTRACT |
| PA-10.5 exact version-dispatch contract | ✅ MERGED CONTRACT |
| Runtime CanonicalTabResult 2.0.0 producer/validator | ✅ INTERNAL/APPLICATION |
| CanonicalTabResult 2.0.0 MusicXML writer | ✅ INTERNAL/APPLICATION |
| Deterministic final polyphonic selector | ✅ INTERNAL / NON-ML / FAIL-CLOSED |
| PS-2 SustainTieGraph 1.2.0 | ✅ INTERNAL/APPLICATION |
| PS-3 logical sustain continuity | ✅ INTERNAL/APPLICATION |
| PS-4A active sonority | ✅ INTERNAL/APPLICATION |
| PS-4C sustained PA-8/PA-9 physical state | ✅ INTERNAL/APPLICATION |
| PA-12 internal polyphonic E2E | ✅ INTERNAL/APPLICATION / NON-PACKAGE-ROOT |
| Exact Guitar Pro grace + `32nd` nominal type | ✅ ACTIVE COMPATIBILITY |
| Exact GP bracketed 3:2 triplet display | ✅ ACTIVE COMPATIBILITY |
| Exact normalized TAB staff mirror collapse | ✅ ACTIVE COMPATIBILITY |
| Closed/repeated closed sustain-stop compatibility | ✅ ACTIVE / BOUNDED |
| Same-voice `<chord/>` one-attack-group handling | ✅ ACTIVE |
| Unequal-duration chord max-member occupancy | ✅ ACTIVE |
| Independent same-voice overlap | 🔒 FAIL-CLOSED |
| Runtime v1/v2 public dispatcher | 🔒 NOT IMPLEMENTED |
| PA-11 teacher evaluation | ✅ through PA-11.4A |
| Public/package-root polyphonic API / PA-13 | 🔒 NOT IMPLEMENTED |
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

## PA-8 resource contract

The fixed constants in `src/music/leftHandShapeModel.js` remain:

- `MAX_LEFT_HAND_SHAPE_CANDIDATES = 20_000`;
- `MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS = 100_000`.

They are enforced per independently processed source group. In sustained PS-4C processing one enforced group is exactly one PS-4A sonority point across that point's ordered position states. The correction to this enforcement scope did not raise either ceiling and did not alter candidate order, physical rules, solver ranking/cost, or tie-break behavior.

## Compatibility / fail-closed package boundary

Compatibility normalizers are internal/application representation adapters. They are filename-independent, SHA-independent, bounded, deterministic, fail-closed, and source-immutable. They do not grant package-root authority and do not invent pitch, octave, onset, duration, voice, staff, tie, chord relationships, source pitch transformation, automatic octave shifts, implicit voice splits, ambiguous sustain continuation, or solver ranking overrides.

Exact same-voice MusicXML `<chord/>` members form one attack group; occupancy extends to the maximum member end. A later independent non-chord event beginning before that end remains fail-closed as `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` / `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`.

## GuitarSet v2 package boundary

`GUITARSET-OBSERVED-VOICING-MODEL.v2` candidate domain is 0..20 and matches PA-7. Observed positive GuitarSet gold remains 0..19, therefore `fret20QualityAuthority=false`.

Historical controlled-offline evidence remains:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

The internal runtime-shadow seam consumes the same authentic single-generation PA-7 lineage used by deterministic PA-8/PA-9 selection and passes only a detached deeply frozen read-copy to the v2 scoring adapter.

Authority boundary:

- runtime shadow connection: internal default-off
- live/user input: false
- learned candidate generation/mutation/filter/deletion: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation/refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- public package-root exposure: false

The retained model artifact is not rewritten. Engine-side connection permission exists only in the reviewed internal bridge.

## Runtime host package boundary

The same-origin staging host is an internal application host and is not exported from `src/index.js`. It exposes the existing bounded upload/edit seams to the browser while preserving immutable source bytes, exact source SHA identity, and server-side regeneration.

POLY_V2 browser tie/source evidence remains UI metadata. Direct clients cannot widen the authoritative runtime schema by adding browser-only semantic fields.

The staging host does not publish the npm package, grant public `CanonicalTabResult 2.0.0` authority, or authorize production hosting.

## Verification baseline

Protected CI continues to require Node.js 18/20/22 and alphaTab import/render/browser-cursor checks. Runtime staging has its own E2E workflow. A documentation-only change must still satisfy repository documentation-consistency tests and the required protected checks on the exact PR head.

Real Guitar Pro corpus is regression/evidence material only. Current gates should verify exact intended source identity, byte immutability, deterministic public/canonical/MusicXML fingerprints when produced, no hidden semantic mutation, expected fail-closed behavior, and green required CI.

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

## Release boundary

No npm/public package release, public polyphonic package API, runtime learned-selection authority, live/user-input shadow activation, production PDF, or production playback claim is made. Internal/application POLY_V2 support and sustained selection do not by themselves create public package-root authority.