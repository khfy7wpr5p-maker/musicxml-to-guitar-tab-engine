# Shadow Ranking Foundation v1

## Status

This document defines the internal LR-S0 shadow-ranking boundary.

- Shadow report contract: `1.0.0`
- Shadow model contract: `1.0.0`
- Implementation: `src/learning/shadowRanking.js`
- Reference artifact: `models/shadow-ranking/synthetic-reference-v1.json`
- Package-root public API: unchanged
- Production optimizer authority: unchanged

### 2026-08-10 convergence note

LR-S0 itself remains unchanged and `authority: "none"`. The path-policy limitation described below is still a limitation of an LR-S0 report **by itself**, but the repository has since merged the companion LR-S1B integrity/provenance foundations:

- LR-S1B.1 — `FingeringPathPolicySnapshot 1.0.0` + digest
- LR-S1B.2a — `OptimizerPathPolicyReplay 1.0.0`
- LR-S1B.2b — `OptimizerPathPolicyBinding 1.0.0` + binding digest

Those later contracts provide strict path-policy content binding, deterministic semantic replay and an immutable verified binding record without changing LR-S0, the deterministic optimizer or production authority. They still do **not** prove trusted historical producer identity and they do not authorize learned production selection.

## Purpose

LR-S0 creates a deterministic, observation-only ranking path over candidates that were already produced and physically validated by the deterministic guitar engine. It exists to compare a shadow suggestion with the authoritative deterministic optimizer decision without allowing the shadow path to alter normal conversion.

The LR-S0 reference model is a hand-authored synthetic model used to exercise the contract. It is not trained, learned from teacher feedback, or derived from the fixed B1 evaluation labels.

## Authority boundary

A `ShadowRankingReport` always records:

- `mode: "shadow"`,
- `authority: "none"`,
- the authoritative deterministic baseline path,
- the independent shadow suggestion,
- deterministic divergence metadata.

Shadow ranking must not:

- replace or mutate any `OptimizerObservation` decision `selectedPosition`,
- change the deterministic optimizer or cost model,
- write `CanonicalTabResult.selectedPosition`,
- change writers or normal conversion behavior,
- add a conversion option,
- add a package-root export,
- invent candidates outside the validated observation candidate set.

## Trusted input boundary

LR-S0 consumes only a produced, deeply frozen `OptimizerObservation 1.0.0` and a validated `ShadowRankingModel 1.0.0` data record.

Before scoring, the observation boundary rejects proxy values, accessors, symbols, custom array properties, array subclasses, sparse arrays, non-plain objects, non-finite numbers, cycles/shared object references, and excessive graph depth/node count. The existing `OptimizerObservationDigest 1.0.0` path then validates and binds the observation content.

The shadow implementation never accepts caller-provided feature vectors. `PedagogicalFeatureVector 1.0.0` values are recomputed internally from the candidate positions already present in the validated observation.

### Residual path-policy limitation

`OptimizerObservation 1.0.0` proves the exact observed candidate membership and the deterministic selected path, but it does not persist every caller-supplied optimizer cost-profile setting. In particular, a shadow alternative cannot prove that it satisfies an unrecorded custom `maximumFretMovement` or `maximumStringMovement` transition cap merely because each selected shadow position is an observed physical candidate.

Therefore LR-S0 establishes **candidate-membership / physical-position validity only** for a divergent shadow suggestion. It does not claim policy-equivalence with an unrecorded custom optimizer transition profile. This limitation is acceptable because `authority: "none"` is mandatory and LR-S0 cannot affect canonical output.

For later policy-aware evidence, use the merged LR-S1B.1 / LR-S1B.2a / LR-S1B.2b companion contracts. Their existence does not retrofit LR-S0 itself with policy provenance or production authority.

## Model contract

The LR-S0 model is declarative data only. Its allowed fields are exactly:

- `documentType`
- `contractVersion`
- `modelId`
- `modelVersion`
- `modelKind`
- `featureContractVersion`
- `scoreDirection`
- `featureWeights`
- `modelSha256`

LR-S0 supports only `modelKind: "synthetic-reference-linear"` and `scoreDirection: "lower-is-better"`.

The exact feature weights are keyed by the `PedagogicalFeatureVector 1.0.0` fields:

- `fretMovement`
- `stringMovement`
- `positionContinuity`
- `openStringUsage`
- `largeShift`
- `handStability`
- `phraseContinuity`

Weights must be finite numbers with absolute value no greater than 1000. Intermediate and cumulative shadow scores must remain finite and within the LR-S0 score boundary.

## Model integrity

The model is bound to:

- model contract version,
- model ID,
- model version,
- model kind,
- feature contract version,
- score direction,
- exact normalized feature weights.

`modelSha256` is a lowercase SHA-256 digest over a domain-separated canonical LR-S0 payload. A stale or forged digest fails closed.

This digest provides content integrity, not cryptographic producer authenticity or signature verification.

## Determinism and tie-breaking

LR-S0 performs deterministic dynamic programming across the exact observed candidate layers. It uses no clock, random source, environment-dependent score input, network call, filesystem loader, callback, plugin, executable model, or process execution.

Equal shadow scores use stable path ranking and physical candidate order so repeated evaluation of the same observation and model yields the same result.

## Synthetic reference model

`synthetic-reference-v1.json` assigns weight `1` to fret movement and string movement and `0` to all other current pedagogical features. It exists only to provide a stable reference for LR-S0 contract and regression testing.

It is explicitly:

- hand-authored,
- synthetic,
- not trained,
- not teacher-feedback-derived,
- not a production learned model,
- not evidence that learned ranking is superior to the deterministic baseline.

## Data and evaluation separation

The fixed `TeacherFingeringBenchmark 1.0.0` remains independent evaluation evidence. LR-S0 does not train on B1, does not mutate B1/B2 artifacts, and does not authorize reuse of B1 labels as both training and independent evaluation data.

A future real learned model requires separately approved training data, provenance, lawful-use/privacy boundaries, model lifecycle/versioning, and an independent evaluation gate.

## Explicit non-authorities

LR-S0 adds no authority for:

- live or mutable TeacherFeedback ingestion,
- persistence or durable admission storage,
- model training,
- model registry or remote model loading,
- filesystem/network/process model execution,
- callbacks or plugins,
- cryptographic producer authentication,
- production learned selection,
- automatic fallback from deterministic selection to shadow selection.

Those remain separate blocked milestones.

## Compatibility rule

Normal MusicXML conversion and package-root API behavior must remain byte/decision compatible with the pre-LR-S0 deterministic engine. A future change that allows learned ranking to influence canonical output is a separate architecture milestone and cannot be inferred from this shadow contract.
