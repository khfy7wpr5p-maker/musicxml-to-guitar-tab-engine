# Current Implementation Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-28 -->

Architecture convergence base: `50859edb322e65a3c8d3db74564fef871f10623f` (merged PR #145). Runtime-shadow connection review implementation: PR #146. PA-12 internal end-to-end implementation: PR #150.

Polyphony compatibility audit base: protected `main` at `0210976ffc74123df8a3c8c0fab2d3cf69067c32`. See `docs/polyphony-compatibility-audit-2026-08-28.md`.

## Executive status

| Area | Status |
|---|---|
| Secure deterministic monophonic conversion | ✅ PUBLIC / VERIFIED |
| `CanonicalTabResult 1.0.0` | ✅ PUBLIC AUTHORITY |
| PA-1 through PA-9 internal polyphonic foundations | ✅ MERGED INTERNAL |
| PA-10.0 through PA-10.5 canonical-v2 design/compatibility | ✅ MERGED CONTRACT/DOC/TEST EVIDENCE |
| PA-11 teacher evaluation | ✅ MERGED through PA-11.4A |
| Deterministic PA-7 snapshot handoff | ✅ `DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_V1` |
| GuitarSet v2 retained model + engine adapter parity | ✅ COMPLETE |
| GuitarSet v2 controlled offline execution/evidence | ✅ `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE` |
| Runtime shadow connection | ✅ INTERNAL / DEFAULT-OFF / NON-AUTHORITATIVE — `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1` |
| Attack-local deterministic final polyphonic selector | ✅ INTERNAL / NON-ML / FAIL-CLOSED ON SUSTAINED OVERLAP |
| PS-1 through PS-6 sustained-polyphony foundations/evidence | ✅ MERGED INTERNAL / NON-PUBLIC |
| Sustained path solver integration into active Canonical V2 producer | 🔒 NOT CONNECTED / NOT AUTHORITATIVE |
| Real-world polyphonic compatibility normalization | 🟡 INCREMENTAL / BOUNDED / OPEN WORK REMAINS |
| `CanonicalTabResult 2.0.0` runtime/validator/writer | ✅ INTERNAL / NON-PUBLIC |
| PA-12 internal polyphonic E2E | ✅ IMPLEMENTED / NON-PUBLIC |
| Guitar TAB Workbench | ✅ IMPLEMENTED / GUARDED MONO_V1 + POLY_V2 HOST SEAMS |
| GitHub Pages Workbench preview | ✅ STATIC / READ-ONLY / NO RUNTIME AUTHORITY |
| UI-07 same-pitch POLY_V2 selection hardening | ✅ MERGED / PROTECTED CI PASS |
| Same-origin Runtime Host | 🟡 STAGING IMPLEMENTATION / NON-PRODUCTION |
| Grace-note/Bach compatibility continuation | 🟡 PR #208 OPEN / EXACT-HEAD TEST + MUSICXML COMPATIBILITY NOT PASSING AT AUDIT TIME |
| Public polyphonic API | 🔒 NOT IMPLEMENTED |
| Production hosted application/PDF/persistence/release | 🔒 NOT READY |

Package metadata: version `0.1.0`, `private: true`, `SEE LICENSE IN LICENSE`, Node.js >=18.

## Public runtime

The public path is unchanged:

`MusicXML → safety/budgets → ParsedMusicXmlDocument 1.0.0 → monophonic projection → CanonicalMusicDocument → physical candidates → deterministic DP optimizer → CanonicalTabResult 1.0.0 → JSON/ASCII/TAB MusicXML`.

The package-root public API remains exact and contains no polyphonic, PA, PS, benchmark, teacher, model, runtime-shadow or GuitarSet exports. Public polyphonic structures remain fail-closed.

## Internal PA sequence

- PA-1 source model ✅
- PA-2 bounded projector and hardening ✅
- PA-3 simultaneity ✅
- PA-4 arrangement decision/provenance ✅
- PA-5 deterministic register/voice analysis ✅
- PA-6 deterministic reduction/octave subset ✅
- PA-7 0..20 distinct-string voicing candidates ✅
- PA-7 immutable single-generation handoff ✅
- PA-8 left-hand finger/barre shape candidates ✅
- PA-9 conservative static physical playability ✅
- PA-10.3 migration matrix ✅
- PA-10.4 `CanonicalTabResult 2.0.0` proposal ✅ documentation only
- PA-10.5 exact dispatch contract ✅ documentation only
- PA-11 evaluation chain ✅ through PA-11.4A
- attack-local deterministic final selector ✅ internal, non-ML, fail-closed on unsupported sustained overlap
- `CanonicalTabResult 2.0.0` runtime/validator/writer ✅ internal
- PA-12 raw MusicXML-to-v2-to-MusicXML path ✅ internal

No public v2 API, learned selection authority or production authority follows from these internal stages.

## Internal sustained-polyphony (PS) sequence

The sustained-polyphony line now has merged internal implementation/evidence beyond the original PS-0/PS-1 architecture document:

- PS-1 temporal event model ✅ internal
- PS-2 sustain/tie and duration invariants ✅ internal
- PS-3 active-note/sonority timeline ✅ internal
- PS-4 sustained guitar-state/slicing foundations ✅ internal
- PS-5 bounded deterministic sustained path solver ✅ internal
- PS-6 regression/determinism and Bach-oriented compatibility evidence stages ✅ internal, continuing through PS-6B normalizers

This does **not** mean sustained polyphony is active runtime authority. At the audit base, `createCanonicalTabResultV2()` still delegates final attack selection to the older attack-local deterministic selector. That selector rejects retained-note overlap with `details.reason = RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED` under generic error code `UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION`. The sustained path solver therefore exists as internal capability but is not yet wired into the active Canonical V2 producer/upload authority path.

The strict `PolyphonicSourceModel` admission boundary also remains intentionally bounded. Real-world compatibility normalizers reduce structural-export incompatibilities incrementally, but broad real-world MusicXML or Bach-level admission must not be claimed until exact-head compatibility gates pass.

## Runtime shadow connection

Stage: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

The approved internal seam is:

`PA-7 generation once → authentic immutable PA-7 snapshot → PA-8/PA-9 deterministic selection lineage + detached deeply frozen PA-7 read-copy → GuitarSet v2 score/evidence`.

The deterministic result is produced from the same single-generation handoff and remains independent of shadow score ordering. Shadow/model/artifact failures are isolated into diagnostic evidence and do not replace the deterministic result.

Authority boundary:

- runtime shadow connection: internal default-off
- explicit internal shadow execution: allowed only through the reviewed bridge
- live/user input: false
- candidate generation/mutation/filter/deletion by model: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation: false
- refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- package-root exposure: false

The retained model and underlying parity adapter continue to carry their own `runtime_connection_authorized=false` / `shadow_execution_authorized=false` provenance flags. Engine-side runtime permission is represented only by the separately reviewed bridge; it does not rewrite or elevate the retained model artifact.

## GuitarSet learning line

Historical v1 candidate domain is 0..19 and remains frozen. `GUITARSET-OBSERVED-VOICING-MODEL.v2` uses candidate domain 0..20 while positive observed gold remains 0..19.

The v2 Node parity adapter and exact-main controlled-offline evidence are complete. Immutable evidence remains:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Byte SHA-256: `a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba`.

Sealed diagnostics remain historical evidence: 4/4 candidate-bearing coverage, 153/153 candidates preserved, one explicit zero-candidate NO_SCORE group, 1/4 baseline agreement, three disagreements, 48 fret-20 candidates, zero shadow errors and 10/10 determinism.

## Runtime host staging boundary

The staging host exposes only the existing bounded application seams from one origin:

`browser Workbench → POST /api/upload | /api/edit | /api/edit/poly-v2 → existing application runtimes → full regenerated notation + TAB`.

The host does not change package-root authority, does not persist user source bytes, and does not make GitHub Pages dynamic. UI-07 browser-only tie identity remains metadata: the Workbench projects POLY_V2 edits to the existing runtime command schema, and the runtime independently rejects unknown command fields fail-closed.

This is a staging/evaluation boundary only. Authentication, public deployment, multi-user persistence, production playback/PDF and release operations remain separate gates.

## Compatibility baseline

PR #146 passed the following protected matrix before merge:

- Node.js 18 tests: ✅ PASS
- Node.js 20 tests: ✅ PASS
- Node.js 22 tests: ✅ PASS
- alphaTab MusicXML import/SVG on Node.js 18/20/22: ✅ PASS
- alphaTab browser renderer/cursor: ✅ PASS
- synth diagnostic: ✅ PASS
- MuseScore CLI availability: ✅ PASS

PR #165 subsequently merged the UI-07 static and real-Chromium identity/command-projection gates. Every later change must pass the applicable protected matrix on its own exact head; the Runtime Host stage additionally requires its dedicated real-browser E2E.

At the 2026-08-28 audit, PR #208 is open and its exact head does not have a passing test/MusicXML-compatibility result. No grace-note or broad Bach-source compatibility claim follows until that exact-head evidence is green.

## Known open architecture gates

1. Integrate/promote the already implemented sustained path solver into an active Canonical V2 producer only through a separately reviewed deterministic integration gate; do not silently replace the static selector.
2. Complete bounded real-world structural/grace-note normalization with exact-head compatibility evidence.
3. Production/public selector authority beyond the current deterministic internal subset; runtime shadow cannot become that selector implicitly.
4. Runtime v1/v2 public dispatcher if separately approved.
5. PA-13 public polyphonic API.
6. Production hosting, authentication, PDF, persistence, release hardening and operational support; the current Workbench, read-only Pages preview and staging Runtime Host do not grant production authority.
7. Any future live/user-input shadow activation or learned decision authority requires a separate consequential gate.

Historical versioned contracts, closure records and sealed evidence remain exact historical records; this file is the live convergence view.