# PA-11.3A Teacher Arrangement Benchmark Admission Guard

## Status

- Gate: `PA-11`
- Slice: `PA-11.3A`
- Scope: fail-closed benchmark/evaluator admission boundary
- Authority: evaluation infrastructure only
- Current PA-11.1 review state: `proposed`
- Production selection authority: none
- Public API / writer / canonical-output change: none

## Purpose

PA-11.3A creates the smallest safe evaluator-admission seam before deterministic arrangement comparison is implemented.

The current `benchmark.proposed.json` may pass admission-shape checks, but `assertTeacherApprovedArrangementBenchmarkAdmission()` rejects it because its review state is still `proposed`. Blank teacher-review fields or current engine output are never converted into approval.

The admission guard checks exact root fields, benchmark identity/version, bounded native case arrays, safe fixed source paths/policies/SHA-256 syntax, unique case/source identities, accepted-arrangement identities, preferred-arrangement membership, hostile root/array shapes, and exact bounded source-byte SHA-256 binding.

This is intentionally **not yet the full PA-11 artifact semantic validator or match scorer**. Deep decision/outcome/shape semantics remain protected by the existing PA-11.1 fixture tests and PA-8/PA-9 replay evidence until the next separately verified PA-11.3 slice expands this boundary.

## Non-authority boundary

PA-11.3A does not:

- change the proposed artifact to `teacher-approved`;
- infer a teacher decision;
- score candidate arrangements;
- train or tune a model;
- select/repair production output;
- change PA-4 through PA-9;
- add a package-root export;
- change `CanonicalTabResult 1.0.0` or activate v2 runtime output.

Actual teacher-approved evaluation remains blocked until PA-11.2 records explicit human decisions for the exact artifact version.
