# GuitarSet Offline Shadow Evidence Closeout v1

## Status

`OFFLINE_SHADOW_EVIDENCE_COMPLETE`

This document closes the bounded **offline-only** GuitarSet learned fingering shadow-evidence line. It records evidence and safety conclusions only. It does **not** authorize runtime connection, live/user-file evaluation, optimizer influence, canonical-result influence, TAB/writer influence, checkpoint mutation/refit, or production use.

The deterministic GuitarTab Engine remains authoritative.

## Evidence identity

The immutable historical shadow evidence is bound to the exact engine revision that produced it:

- exact-main engine commit: `a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35`
- shadow adapter/source-module version: `1.0.0`
- retained model version: `0.1.0-development`
- retained model artifact SHA-256: `5d109e3b46ef286439f00ad6fa5885fc7bdf13e070974c49040c27b007461869`
- frozen feature schema SHA-256: `05f8fda622f3901869a149db3e2cca2baf1310f4834d39e278e36428ae48cd38`
- frozen protocol SHA-256: `1cbb3d219e8009c90c71075019a69a55c06a2893c12bd50264e66eda956dbc2d`
- cross-repository review evidence SHA-256: `cc11c59016e5faa5bac64d4dea1f82eea5a7e24d4fd4cc0d4601975113052e39`
- immutable evidence artifact: `evidence/offline-shadow/exact-main/a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35/controlled-offline-shadow-evidence.v1.json`

The historical artifact is byte-SHA sealed and its integrity tests load the committed artifact directly. They do not recompute historical exact-main evidence through the current runner.

## Authority boundary

Controlled offline execution is the only positive authority flag:

- `controlledOfflineExecution = true`
- `runtimeConnectionAuthorized = false`
- `authoritativeDecisionEffectAuthorized = false`
- `canonicalResultEffectAuthorized = false`
- `tabOutputEffectAuthorized = false`
- `checkpointMutationAuthorized = false`
- `refitAuthorized = false`
- `productionAuthorized = false`

The learned checkpoint may score only complete immutable PA-7 candidate groups presented to the offline shadow adapter. It cannot generate, delete, filter, repair, truncate, mutate, or replace candidates and cannot alter source pitch, rhythm, simultaneity, reduction, octave, fingering/playability truth, deterministic optimizer decisions, canonical TAB, or writer output.

The adapter remains outside the package-root public API and ordinary runtime source path.

## Exact sealed evaluation result

The sealed controlled evaluation contains:

- fixture count: `6`
- total PA-7 group count: `5`
- candidate-bearing group count: `4`
- scored group count: `1`
- no-candidate group count: `1`
- model-domain-incomplete group count: `3`
- total candidate count before shadow: `153`
- total candidate count after shadow: `153`
- candidate-count preservation rate: `100%`
- candidate-bearing model coverage: `25%` (`1/4`)
- all-group no-score rate: `80%` (`4/5`)
- candidates inside model-domain-incomplete groups: `149`
- observed out-of-model-domain candidate occurrences: `48`
- blind-baseline comparable groups: `1`
- top-1 agreement count: `1`
- top-1 disagreement count: `0`
- top-1 agreement rate on comparable groups: `100%` (`1/1`)
- scored-group top-1/top-2 margin: `0.452842290727`
- shadow error count: `0`
- run digest SHA-256: `bcf85e6c41cf9e63acb340b9fc1eebd8c9e61559306584537249750b186ba898`

These are diagnostics, not promotion thresholds. In particular, `1/1` baseline agreement is not evidence of general model accuracy because there is only one baseline-comparable scored group in this sealed set.

## Determinism

The exact fixed fixture set reproduced identically across the required minimum repetition gate:

- repetitions: `10`
- identical: `true`
- determinism digest SHA-256: `3c52cc85ba7a4ee1db53ab744eaeaf7e0c3ec5563862ab4e39436cb65d470669`

A determinism-gate failure is tested to hard-stop offline promotion logic while leaving the deterministic engine result unchanged.

## Candidate integrity and model-domain boundary

Runtime PA-7 candidates may use frets `0..20`; the retained learned model accepts frets `0..19`.

The safety rule is whole-group abstention:

- if any candidate in a PA-7 group contains fret `20`, the complete group is `NO_SCORE_NO_TRUNCATION`;
- no fret-20 candidate is silently ignored;
- no in-domain subset is created for learned scoring;
- candidate counts and semantic candidate-space identities are preserved across shadow evaluation.

The three model-domain-incomplete sealed groups preserve their complete candidate counts: `21/21`, `55/55`, and `73/73`.

The current retained model therefore has an explicit coverage limitation. This evidence closes the measurement line; it does not grant permission to expand/retrain the model or connect it to runtime.

## Blind baseline and disagreement diagnostics

Baseline comparison is independent of teacher-gold, validation-final, or model-outcome labels.

The sealed real evaluation has one comparable group and no disagreement. Separate bounded diagnostic tests prove that a disagreement can be represented with candidate-space identities and score margins without granting selection or promotion authority.

No teacher-preference label, validation-final label, or gold answer is required or consumed by this offline shadow evidence path.

## Failure isolation

Tests prove fail-closed isolation for the bounded shadow line, including:

- missing retained model;
- malformed retained model;
- corrupted model transport;
- claimed artifact SHA mismatch;
- non-finite model transport input;
- malformed/non-frozen PA-7 shadow input;
- zero-candidate group;
- fret-20 model-domain mismatch;
- downstream evidence serialization failure;
- determinism-gate failure.

For relevant failure cases the deterministic blind-baseline result is captured before the shadow failure and verified identical afterward. Shadow failure is never repaired by deleting candidates, substituting a learned result, or modifying the deterministic path.

## Privacy and evidence boundary

The sealed evidence does not retain raw MusicXML bytes, local/private paths, original user filenames, teacher labels, or validation-final labels.

Controlled input contracts reject filename/path/private-label payload expansion. Offline shadow implementation files are covered by tests that reject introduction of HTTP/HTTPS/net/TLS/dgram clients, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, axios, or telemetry-call capability in this path.

No live application traffic, uploaded user file, private connected data, production log, or external telemetry/persistence is part of this closeout evidence.

## Regression and compatibility gates

The evidence-seal, diagnostics, and failure/privacy changes were merged only after protected-branch required checks passed on their exact PR heads. The required set includes:

- Node.js 18 repository tests;
- Node.js 20 repository tests;
- Node.js 22 repository tests;
- MusicXML compatibility + alphaTab import/SVG render on Node.js 18;
- MusicXML compatibility + alphaTab import/SVG render on Node.js 20;
- MusicXML compatibility + alphaTab import/SVG render on Node.js 22;
- alphaTab browser renderer/cursor + synthesizer diagnostic on Node.js 22.

The closeout line introduced no package-root API expansion and no runtime call site for the GuitarSet shadow adapter.

## Merged closeout slices

- PR `#132`: immutable exact-main historical evidence sealing; historical evidence no longer depends on future runner behavior.
- PR `#133`: sealed coverage, blind-baseline, disagreement, domain-gap, margin, candidate-integrity, authority, and privacy diagnostics.
- PR `#134`: explicit fail-closed failure-isolation and network/privacy-boundary regression evidence.

## Known limitations and residual risk

The evidence is intentionally narrow:

- only `1/4` candidate-bearing groups in the sealed set are scorable by the retained `0..19` model;
- three candidate-bearing groups are held because runtime PA-7 includes fret-20 possibilities;
- the sealed real set contains only one baseline-comparable scored group;
- the sealed real set contains zero disagreements, so disagreement machinery is validated separately with bounded synthetic diagnostic evidence;
- no conclusion about production accuracy, generalization, teacher preference, or live-user behavior is justified by this evidence;
- no model retraining, fret-20 expansion, teacher-label promotion, runtime integration, or production authorization is part of this closeout.

## Stop point and next human gate

The autonomous offline evidence line stops here.

`RUNTIME_SHADOW_CONNECTION_REVIEW` is a separate human/consequential gate.

Until that gate is explicitly reviewed and separately authorized:

- runtime connection: **closed**
- real user files: **closed**
- live/public API shadow execution: **closed**
- optimizer/final-selection influence: **closed**
- canonical-result/TAB/writer influence: **closed**
- checkpoint mutation/refit/retraining: **closed**
- production use: **closed**
