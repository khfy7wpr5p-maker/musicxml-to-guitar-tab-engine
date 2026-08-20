# PA-11.3H — Teacher-approved 1.1 source/runtime replay

## Purpose

PA-11.3H proves that the exact teacher-approved `TeacherArrangementBenchmark 1.1.0 / 0.2.0` remains connected to real bound MusicXML source bytes and to the existing PA-8/PA-9 physical-playability engine.

This slice is evaluation-only. It does not activate production `REVOICED` or `VOICE_REDISTRIBUTED` execution.

## Gate order

The public internal replay entry first requires:

1. PA-11.3F exact benchmark + approval byte admission;
2. PA-11.3G complete v1.1 semantic validation;
3. exact baseline `0.1.0` and review-record bindings;
4. exact MusicXML fixture SHA/source replay through the existing PA-11.3D/E baseline path.

Only then is teacher-approved runtime replay evidence emitted.

## Baseline-reference cases

Cases 1 and 4 retain `BASELINE_REFERENCE` semantics. Their referenced arrangements are resolved against the bound 1.0 benchmark runtime replay. No arrangement is inferred or regenerated as new teacher truth.

## REALIZED_VOICING physical replay

Cases 2 and 3 use evaluation-only `REALIZED_VOICING` semantics. Current production PA-6/PA-7 does not execute `REVOICED` / `VOICE_REDISTRIBUTED`, so PA-11.3H does not widen those production contracts.

Instead, the already teacher-approved realized tones are projected into a temporary evaluation-only simultaneous `PolyphonicSourceModel`. Each realized tone is treated as `PRESERVED` solely for physical replay. The existing PA-8 and PA-9 engines must then reproduce:

- exact string/fret positions;
- exact finger assignments;
- exact barre facts;
- one simultaneous shape;
- `PLAYABLE_WITHIN_POLICY` with no rejection reason.

This adapter tests the physical truth of the approved realized guitar shape; it is not a production revoicing producer and cannot select teacher answers for normal conversion.

## Negative gates

Tests require fail-closed behavior for:

- changed MusicXML source bytes;
- approved realized positions/fingers that PA-8 cannot reproduce;
- realized shapes rejected by PA-9 physical policy;
- any failure in PA-11.3F/G admission/semantics.

## Non-authority

PA-11.3H does not score or rank engine output, change optimizer costs, alter candidate ordering, write canonical output, expose a public API, grant training authority, or activate PA-12.
