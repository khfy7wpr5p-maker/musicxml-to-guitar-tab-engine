# TeacherFingeringBenchmark Evaluation Contract 1.0.0

## Purpose

`TeacherFingeringBenchmarkEvaluation 1.0.0` is an internal deterministic evaluation harness for the fixed, teacher-approved `TeacherFingeringBenchmark 1.0.0` artifacts.

It measures the existing deterministic MusicXML → `CanonicalTabResult` baseline. It does not change optimizer decisions, train a model, or authorize collection or use of live TeacherFeedback data.

## Authority boundary

The harness may:

- validate that the benchmark is teacher-approved,
- verify each supplied source text against the B1 SHA-256 binding,
- run the existing conversion pipeline with the benchmark guitar configuration,
- compare each selected position with the teacher-approved event-local accepted/preferred positions,
- emit deterministic immutable counts and case/event records.

The harness does **not** have authority to:

- read arbitrary files or directories,
- perform network access,
- invoke caller-supplied loaders or callbacks,
- write benchmark results to storage,
- change parser, candidate, optimizer, cost-model or writer behavior,
- change the package-root public API,
- create or mutate TeacherFeedback, ObservationAdmission or persistence records,
- authorize research, training, consent, privacy or lawful-use processing,
- train, select or deploy a learned ranking model.

## Input

The internal entry point accepts exactly:

```js
{
  benchmark,
  sourceEntries
}
```

`benchmark` must pass the B1 `assertTeacherApprovedBenchmark()` gate.

`sourceEntries` must be a dense ordered array with exactly one entry per benchmark case:

```js
{
  caseId,
  sourceText
}
```

The order and `caseId` must exactly match `benchmark.cases`. Each `sourceText` is verified against the corresponding B1 SHA-256 before conversion. Missing, extra, sparse, reordered, accessor-backed, proxy or unknown-field inputs fail closed.

The B2 module performs no filesystem or network loading. Repository fixtures are loaded only by tests or another explicitly authorized caller and supplied as source text.

## Conversion baseline

Each verified source is passed to the existing `convertMusicXmlToCanonicalTab()` pipeline using the benchmark's fixed guitar configuration and the existing default deterministic fingering cost profile.

B2 does not inject a learned score, alternate cost profile or optimizer override.

## Event alignment

For a successful conversion, the non-rest result events must exactly match the benchmark case event count and event-id order.

A successful conversion with missing, extra, reordered or different event identities is an invalid evaluation and fails closed. It is not silently skipped and is not converted into a lower score.

## Event evaluation

For every aligned event:

- `acceptableMatch` is true when `selectedPosition` is an exact member of the B1 `acceptedPositions` set.
- `preferredEligible` is true when B1 defines a non-null `preferredPosition`.
- `preferredMatch` is true only when the selected position exactly matches that preferred position.
- `candidateCoveragePresent` is true when at least one teacher-accepted position exists in the engine's actual candidate set represented by the selected plus alternative positions.

B1 labels are event-local. B2 does not infer that independently accepted event positions form a teacher-approved whole-piece fingering path.

## Case evaluation

A converted case passes only when every benchmark event is an acceptable match and there is no candidate-coverage failure.

A conversion blocked by the existing secure preflight boundary produces a `blocked` case record with zero evaluated events and `pass: false`.

Blocked cases remain in the benchmark denominator. They are never silently removed.

## Report

The internal immutable report has document type `TeacherFingeringBenchmarkEvaluation` and contract version `1.0.0`.

The top-level counts are:

- `benchmarkCaseCount`
- `benchmarkEventCount`
- `evaluatedCaseCount`
- `evaluatedEventCount`
- `unevaluatedEventCount`
- `acceptableMatchCount`
- `preferredEligibleEventCount`
- `preferredMatchCount`
- `casePassCount`
- `candidateCoverageFailureCount`
- `blockedConversionCount`

No floating-point percentage or rate is stored in contract v1. This avoids denominator ambiguity.

If a consumer derives an acceptable-match rate, the denominator is `benchmarkEventCount`, not only evaluated events. If a consumer derives a preferred-match rate, the denominator is the benchmark-wide `preferredEligibleEventCount`, including preferred-labeled events in blocked cases. Therefore blocked conversions cannot artificially improve the score by shrinking the denominator.

The report also records the engine, CanonicalTabResult and GuitarConfiguration versions used by the evaluation.

## Failure behavior

Malformed B2 inputs, B1 integrity failures, source-order violations, source SHA mismatch, successful-conversion event identity mismatch, and inconsistent conversion results fail closed with:

`INVALID_TEACHER_FINGERING_BENCHMARK_EVALUATION`

Underlying engine/B1 codes may be copied into bounded structured `causeCode` details, but native or hostile accessor/proxy exceptions are not allowed to escape the evaluation contract.

## Determinism and immutability

For identical benchmark and source text inputs under the same engine version, the harness produces the same report. The report is deeply frozen and the inputs are not mutated.

The contract contains no current time, randomness, network result, filesystem metadata or mutable external dataset state.

## Current B1 baseline

For the initial teacher-approved B1 set of 8 cases / 32 note events, the current deterministic baseline is expected to remain fully acceptable. Preferred-match count is tracked separately because an accepted teacher alternative can be selected even when it is not the preferred event-local position.

Changing the benchmark labels, fixtures, benchmark version, engine behavior, guitar configuration or evaluation contract requires fresh review rather than silently carrying forward an old score.
