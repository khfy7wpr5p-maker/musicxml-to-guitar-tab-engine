# GuitarSet Observed-Voicing Shadow Execution Review v1

## Decision

`SHADOW_EXECUTION_REVIEW_PASS_CONTROLLED_OFFLINE_EVIDENCE_ONLY`

The retained `GUITARSET-OBSERVED-VOICING-MODEL.v1` checkpoint may advance from adapter/parity verification to a separately implemented **controlled offline project-shadow evidence runner**. This review does not itself execute project inputs and does not authorize runtime connection, optimizer influence, TAB-output influence, or production use.

Authoritative review baseline:

- GuitarTab Engine `main`: `e54825db0e1a3f316919ee2d17d2c82b071fa749`
- offline adapter: `GUITARSET_OBSERVED_VOICING_SHADOW_VERSION = 1.0.0`
- retained model artifact SHA-256: `5d109e3b46ef286439f00ad6fa5885fc7bdf13e070974c49040c27b007461869`
- frozen feature schema SHA-256: `05f8fda622f3901869a149db3e2cca2baf1310f4834d39e278e36428ae48cd38`
- frozen protocol SHA-256: `1cbb3d219e8009c90c71075019a69a55c06a2893c12bd50264e66eda956dbc2d`
- cross-repository compatibility review SHA-256: `7a8158b295912df0fe743f605df799362fcc164f01e3d5357a62e5e3835af789`
- runtime guitar domain: standard six-string tuning, frets `0..20`
- frozen learned-model domain: standard six-string tuning, frets `0..19`

## Authority boundary

The deterministic GuitarTab Engine remains authoritative.

The learned checkpoint may only score the complete immutable PA-7 `GuitarVoicingCandidateModel 1.0.0` candidate group supplied to the offline adapter. It may not:

- generate, repair, legalize, add, remove, reorder before scoring, or mutate physical candidates;
- change source pitch, rhythm, simultaneity, reduction, octave decisions, fingering, or playability facts;
- choose or replace an authoritative optimizer result;
- mutate `CanonicalTabResult 1.0.0` or any future canonical result;
- influence JSON, ASCII TAB, TAB MusicXML, alphaTab, MuseScore, PDF, or any writer;
- become a package-root export or production/runtime call site under this gate.

If any candidate in a PA-7 group uses fret `20`, the whole group remains `NO_SCORE_NO_TRUNCATION`. Scoring only the in-domain subset is forbidden.

## Allowed input source for the next implementation slice

The first controlled shadow-execution implementation may consume only **repository-owned or explicitly review-bound non-live MusicXML evaluation fixtures** whose exact bytes are available before execution and can be SHA-256 sealed.

The first slice must not consume:

- live application traffic;
- uploaded user files;
- private email/Drive data;
- production logs;
- unseen validation/final GuitarSet labels;
- Teacher preference/correction labels;
- any input selected by model score or outcome.

Expanding beyond repository-owned/non-live fixtures requires a separate review.

## Required shadow evidence schema

A controlled offline runner must emit one deterministic evidence object per run containing only bounded diagnostic metadata. The minimum required fields are:

- `schemaVersion`;
- `engineCommitSha`;
- `adapterVersion`;
- `modelArtifactSha256`;
- `featureSchemaSha256`;
- `protocolSha256`;
- `inputSha256` for each evaluated fixture;
- fixture-local stable evaluation id with no original user filename requirement;
- PA-7 group count and candidate count before shadow scoring;
- scored-group count;
- no-candidate-group count;
- model-domain-incomplete-group count;
- per-group immutable candidate ids or canonical candidate digests;
- per-group top shadow candidate id when and only when the complete candidate group is model-domain compatible;
- optional already-authoritative/baseline candidate id when independently available;
- agreement/disagreement classification when such a baseline id exists;
- top-1/top-2 score margin for scored groups;
- run-level determinism digest;
- explicit authority flags, all false for optimizer/TAB/runtime/production effects.

The evidence format must be bounded and must not embed raw MusicXML bytes, model-training rows, GuitarSet validation/final labels, Teacher labels, or secrets.

## Privacy and retention

For the first controlled offline slice:

- raw MusicXML fixture bytes remain repository fixtures or ephemeral local/CI inputs and are not copied into shadow evidence;
- evidence records only cryptographic input identity plus derived bounded diagnostics;
- original local path/user filename is not required and should not be retained;
- no personal identifiers are introduced by the shadow layer;
- no network upload, telemetry, analytics, or external persistence is authorized;
- evidence retention is limited to review artifacts necessary to reproduce the exact controlled run.

Any future use of user-provided or private files requires a new privacy/data-retention review before execution.

## Determinism gate

Before the first controlled project-shadow result may be accepted:

1. the same exact engine commit, adapter, model artifact and input bytes must be used;
2. the runner must execute the complete fixture set at least `10/10` times;
3. every run must reproduce candidate identities/counts, score ordering, no-score classifications, aggregate metrics and the final evidence digest exactly;
4. any nondeterminism is a hard stop and no shadow conclusion may be promoted from that run.

Floating-point score equality may use the already frozen Node/Python parity tolerance only for cross-language numeric comparison; within one Node execution environment the emitted normalized evidence and rank order must be deterministic.

## Failure isolation

Shadow execution must be structurally downstream and non-authoritative.

Required behavior:

- authoritative deterministic processing is completed independently of shadow scoring;
- shadow receives immutable/copy-safe PA-7 candidate facts and returns a diagnostic object only;
- a shadow exception, malformed model artifact, unsupported fret-20 group, zero-candidate group, non-finite score, evidence-write failure, or determinism failure cannot alter deterministic engine decisions or TAB output;
- failure is recorded as shadow diagnostic failure/no-score and never repaired by clipping, candidate deletion, fallback learned scoring, or model substitution;
- deterministic fallback is not a shadow action: it remains the normal authoritative engine behavior that exists regardless of whether shadow runs.

## Comparison metrics

The first controlled offline run is diagnostic. At minimum it must report:

- total PA-7 groups;
- scorable-group rate;
- no-candidate-group rate;
- model-domain-incomplete rate;
- candidate-count preservation rate, which must be `100%`;
- shadow top-1 agreement rate with an independently available deterministic/baseline selection, when such a baseline exists;
- disagreement count and bounded disagreement identifiers;
- top-1/top-2 score-margin summary for scored groups;
- shadow-error count, which must be reported separately from model-domain no-score groups.

These metrics do not create promotion thresholds and cannot authorize optimizer influence.

## Hard stop conditions

Stop the shadow path and keep runtime/production closed if any of the following occurs:

- model/checkpoint/feature/protocol/cross-repo identity drift;
- candidate generation, filtering, mutation or count loss by the shadow layer;
- a fret-20-containing group is partially scored or truncated;
- any non-standard tuning is silently remapped;
- Node/Python parity regression beyond the frozen tolerance;
- 10/10 deterministic reproduction failure;
- raw/private input bytes or user-identifying paths leak into evidence;
- validation/final/Teacher labels are consumed by the shadow runner;
- a shadow error changes authoritative selection or serialized TAB output;
- the adapter becomes reachable from the package-root public API or an ordinary production conversion call site without a new approval gate.

## Required implementation evidence for the next PR

A future controlled offline runner PR must prove, on its exact head:

- focused positive tests for complete in-domain PA-7 groups;
- negative tests for fret-20 domain mismatch and zero candidates;
- exact candidate-count/no-mutation assertions;
- model/provenance tamper rejection;
- non-standard-tuning rejection;
- evidence-schema bounds and raw-input non-retention;
- shadow failure isolation from deterministic output;
- 10/10 deterministic reproduction on the fixed evaluation fixture set;
- full repository regression on Node.js 18/20/22;
- MusicXML compatibility/alphaTab workflows remain green;
- no package-root export and no production/runtime call site.

## Still closed

- live/user-input shadow execution: **false**
- runtime connection: **false**
- optimizer/final-selection effect: **false**
- canonical-result effect: **false**
- TAB/writer effect: **false**
- checkpoint refit/tuning/recalibration: **false**
- validation/final reuse for training: **false**
- production: **false**

## Next gate

After this review contract is merged and the isolation regression remains green, the next separately bounded engineering slice is:

`CONTROLLED_OFFLINE_PROJECT_SHADOW_RUNNER_IMPLEMENTATION`

That slice may implement and execute only the repository-owned/non-live fixture scope defined above. Any live/runtime/user-input connection remains a later separate consequential gate.
