# Shadow Ranking Benchmark Evaluation v1

## Status

This document defines the internal LR-S1A measurement-only benchmark evaluation boundary.

- Evaluation contract: `1.0.0`
- Implementation: `src/benchmark/shadowRankingBenchmarkEvaluation.js`
- Regression tests: `tests/shadowRankingBenchmarkEvaluation.test.js`
- Benchmark authority: fixed teacher-approved `TeacherFingeringBenchmark 1.0.0`
- Baseline authority: existing deterministic `TeacherFingeringBenchmarkEvaluation 1.0.0`
- Shadow authority: none
- Package-root public API: unchanged
- Production optimizer authority: unchanged

### 2026-08-10 convergence note

LR-S1A remains a fixed-B1/default-policy measurement contract and is unchanged. The document originally described general path-policy binding as a future LR-S1B gate. That companion work is now merged:

- LR-S1B.1 — strict `FingeringPathPolicySnapshot 1.0.0` + digest
- LR-S1B.2a — `OptimizerPathPolicyReplay 1.0.0`
- LR-S1B.2b — `OptimizerPathPolicyBinding 1.0.0` + binding digest

Those later contracts do not change LR-S1A's `pathPolicy.scope: "fixed-b1-default"` or `pathPolicy.generalizedProvenance: false`; they provide separate policy-aware integrity/replay/binding evidence for future consumers. None of them authorize learned production selection or trusted historical producer identity.

## Purpose

LR-S1A measures the existing LR-S0 shadow ranking output against the fixed teacher-approved B1 benchmark while preserving the deterministic B2 baseline as the authoritative conversion result.

It is evaluation infrastructure only. It does not train, tune, select, deploy, or authorize a learned model.

## Evaluation flow

```text
fixed teacher-approved B1 benchmark
        ↓
exact source SHA-256 verification
        ↓
existing deterministic B2 baseline
        ↓
reproduced OptimizerObservation 1.0.0
        ↓
LR-S0 ShadowRankingReport 1.0.0
        ↓
teacher-label comparison
        ↓
ShadowRankingBenchmarkEvaluation 1.0.0
```

## Authority boundary

Every LR-S1A report records:

- `mode: "shadow-evaluation"`,
- `authority: "none"`,
- the exact benchmark identity/version/review state,
- the validated model identity/version/content digest,
- deterministic B2 baseline counts,
- shadow benchmark counts,
- baseline-versus-shadow divergence counts,
- case-level LR-S0 shadow reports for evaluated cases,
- explicit blocked/unevaluated cases without fabricated shadow output.

LR-S1A must not:

- change deterministic optimizer decisions,
- write or replace `CanonicalTabResult.selectedPosition`,
- change the cost model,
- alter MusicXML parsing, physical candidate generation, writers, or normal conversion,
- add a package-root export or conversion option,
- mutate B1/B2 benchmark artifacts,
- remove blocked or failed cases from denominators,
- train or tune model weights from B1 labels,
- authorize production learned selection.

## Fixed benchmark boundary

LR-S1A requires the teacher-approved B1 benchmark and delegates baseline/source integrity checks to the existing B2 evaluation boundary.

Every source entry must remain in exact benchmark order and must match the benchmark-bound SHA-256 source content. A source mismatch fails closed.

Blocked conversion cases remain in the benchmark denominator. LR-S1A records the corresponding shadow case as blocked and does not invent a shadow result for input that the deterministic baseline could not evaluate.

## B1 independence rule

The fixed B1 benchmark remains independent evaluation evidence.

The current synthetic LR-S0 reference model is hand-authored and was not trained from B1 labels. LR-S1A may measure that fixed model on B1, but B1 results must not be used to tune weights and then reused as independent evidence.

Any future trained model requires separate training data, provenance, lawful-use/privacy controls, model lifecycle/versioning, and an independent holdout evaluation gate.

## Fixed path-policy scope

LR-S1A evaluates only the exact fixed B1/B2 baseline policy. It reconstructs the existing default normalized fingering cost profile with the benchmark guitar maximum fret and records that profile in the report.

The report explicitly records:

- `pathPolicy.scope: "fixed-b1-default"`
- `pathPolicy.generalizedProvenance: false`

This remains intentionally **not** a general path-policy provenance solution.

`OptimizerObservation 1.0.0` does not itself persist every caller-supplied cost-profile setting. Therefore LR-S1A does not claim that a shadow path is policy-equivalent for arbitrary caller-supplied profiles, especially custom `maximumFretMovement` or `maximumStringMovement` caps.

General path-policy integrity/replay/binding is now provided by the separate merged LR-S1B.1 / LR-S1B.2a / LR-S1B.2b companion contracts. LR-S1A itself remains fixed-scope and does not embed those records.

## Baseline alignment invariant

For every B2-evaluated case, LR-S1A reproduces the deterministic candidate/optimizer observation under the fixed B1 default policy and requires:

- exact event-count alignment,
- exact event identity alignment,
- exact deterministic selected-position alignment between B2 and the LR-S0 observation baseline.

Any mismatch fails closed rather than producing comparison metrics over inconsistent baselines.

## Metrics

The report preserves the existing B2 baseline counts and records shadow counts for:

- evaluated cases/events,
- unevaluated events,
- acceptable teacher-label matches,
- preferred-eligible events,
- preferred matches,
- case passes,
- candidate-coverage failures,
- blocked conversions.

Candidate coverage is a property of the fixed validated candidate set shared by the deterministic baseline and LR-S0 shadow path. LR-S1A therefore carries the exact B2 `candidateCoverageFailureCount` into the shadow summary rather than recalculating or redefining coverage.

Comparison metadata records:

- divergent case count,
- divergent decision count,
- acceptable-match delta,
- preferred-match delta.

A positive or negative delta is measurement evidence only. It does not authorize production behavior.

## Trusted input and hostile-input boundary

The LR-S1A wrapper accepts exactly:

- `benchmark`,
- `sourceEntries`,
- `model`.

Unknown fields, proxy wrappers, accessors, malformed model data, stale model digests, invalid benchmark/source bindings, and inconsistent evaluated observations fail closed with structured `ShadowRankingBenchmarkEvaluationError` errors.

The evaluator accepts source/model records as data. It adds no filesystem, network, process, plugin, callback, remote-model-loading, or executable-model authority.

## Compatibility rule

LR-S1A is internal measurement infrastructure. Normal MusicXML conversion, `CanonicalTabResult 1.0.0`, writers, package-root exports, deterministic optimizer selection, B1/B2 artifacts, and LR-S0 `authority: "none"` semantics remain unchanged.

Any future production influence remains a separate architecture milestone and is still blocked pending separately approved learned-model data, privacy/lawful-use, independent evaluation, shadow-first and opt-in production gates. The fact that LR-S1B policy companions are now merged does not by itself authorize production learned selection.
