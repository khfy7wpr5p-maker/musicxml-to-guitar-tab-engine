# PA-11.3F — Teacher-approved 1.1 admission gate

## Purpose

PA-11.3F adds the first executable admission gate for the teacher-approved `TeacherArrangementBenchmark 1.1.0 / 0.2.0` path.

It does not score arrangements. It only decides whether evaluator code may treat one benchmark/approval pair as the exact approved evidence.

## Exact pair

Benchmark:
- `benchmarks/teacher-arrangement-v1/benchmark.proposed.v0.2.0.json`
- Git blob: `21a02c053a8bdfee781846a6c7f35b0c66600513`

Approval:
- `benchmarks/teacher-arrangement-v1/approvals/teacher-approval-v0.2.0-2026-08-20.json`
- Git blob: `21e76f6f81ad22754b73e17253b413cc0ef9aebd`

Both byte identities are mandatory. A semantically equivalent reserialization is intentionally rejected.

## Admission checks

`assertExactTeacherApprovedV11BenchmarkAdmission(benchmarkText, approvalText)` requires:

- exact benchmark and approval Git blob identities;
- benchmark identity `TeacherArrangementBenchmark 1.1.0 / 0.2.0`;
- benchmark remains evaluation-only with training/production authority false;
- exact approval status `TEACHER_APPROVED_EXACT_ARTIFACT`;
- effective review status `teacher-approved`;
- approval metadata matches the benchmark identity and exact blob;
- teacher scope is exactly C=`x32010` and Cmaj7=`x32000`;
- those scope values match the actual selected shapes in cases 2 and 3;
- no preferred arrangement is inferred.

Successful admission returns frozen evaluation-only evidence. It does not return a production selection and does not mutate either input.

## Compatibility boundary

The existing 1.0 admission path remains unchanged and must continue to reject 1.1 artifacts. This prevents accidental widening of legacy evaluator authority.

## Non-authority

PA-11.3F does not:

- activate `REVOICED` or `VOICE_REDISTRIBUTED` in production;
- score or rank outputs;
- change candidate ordering;
- write canonical output;
- expose a public API;
- grant training authority;
- activate PA-12.
