# PA-11.2T — Exact teacher-approval binding

## Status

- Slice: `PA-11.2T`
- Purpose: bind explicit teacher approval to the exact immutable `TeacherArrangementBenchmark 1.1.0 / 0.2.0` bytes.
- Production authority: none.
- Training authority: none.
- Scoring authority: none in this slice.

## Exact approved artifact

The approved artifact is not rewritten after review. Approval is represented by a separate immutable `TeacherArrangementBenchmarkApproval 1.1.0` record that binds the exact Git blob:

- path: `benchmarks/teacher-arrangement-v1/benchmark.proposed.v0.2.0.json`
- benchmark id: `teacher-arrangement-seed-v1`
- benchmark version: `0.2.0`
- Git blob SHA: `21a02c053a8bdfee781846a6c7f35b0c66600513`

This preserves the exact reviewed bytes. The embedded `reviewStatus: proposed` field remains historical content of the reviewed artifact; effective teacher-approved status is granted only when the exact artifact is paired with the exact approval record and the blob binding validates.

## Explicit teacher scope

The approval includes the exact teacher directions already encoded in the reviewed artifact:

- case 2: standard open C, `x32010`;
- case 3: standard open Cmaj7, `x32000`.

Cases 1 and 4 remain as represented in the exact reviewed artifact. No preferred arrangement is inferred.

## Fail-closed rule

A future 1.1 evaluator may treat the artifact as teacher-approved only if all of the following hold:

1. approval record is structurally valid;
2. approval status is exactly `TEACHER_APPROVED_EXACT_ARTIFACT`;
3. effective review status is exactly `teacher-approved`;
4. artifact path, id, contract version, benchmark version and Git blob SHA match exactly;
5. C and Cmaj7 approval scope matches the exact realized voicings in the artifact;
6. training and production authority are both false.

Any artifact byte change yields a different Git blob SHA and invalidates this approval binding.

## Non-authority

This slice does not activate `REVOICED` or `VOICE_REDISTRIBUTED` in production, does not alter PA-4 through PA-9 authority, does not write canonical output, does not train a model, and does not score engine output. It only records immutable evaluation approval evidence.
