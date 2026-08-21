# PA-11.3L Genuine Blind Baseline Measurement

## Status

Evaluation-only measurement contract. No production authority.

## Goal

PA-11.3L performs the first genuine teacher-approved benchmark measurement using a gold-blind engine observation.

The measurement is intentionally split into two trust zones:

1. **Blind observation zone** — receives only evaluation identity (`benchmarkId`, `benchmarkVersion`, ordered `caseIds`) and source MusicXML bytes. It parses/projects the MusicXML and calls the PA-11.3K blind baseline selector. It cannot receive benchmark JSON, approval JSON, review records, accepted arrangement ids, or preferred arrangement ids.
2. **Scoring zone** — only after the `TeacherArrangementObservedOutput` has been fully produced does PA-11.3I receive the exact teacher-approved benchmark evidence and compare the frozen observation to gold.

This prevents teacher-gold data from influencing baseline selection.

## Bound evidence

- benchmark: `TeacherArrangementBenchmark 1.1.0 / 0.2.0`
- exact benchmark Git blob: `21a02c053a8bdfee781846a6c7f35b0c66600513`
- exact teacher approval Git blob: `21e76f6f81ad22754b73e17253b413cc0ef9aebd`
- blind selector policy: `PRESERVE_OR_OCTAVE_MIN_ERGONOMIC_1.0`

## Fresh measured baseline

The committed measurement artifact is:

`benchmarks/teacher-arrangement-v1/measurements/blind-baseline-v1.json`

Expected and executable classifications:

| Case | Blind result vs teacher-approved gold |
|---|---|
| 1 — two-note interval | `ACCEPTABLE_MATCH` |
| 2 — three-note voicing | `PHYSICALLY_VALID_NOT_APPROVED` |
| 3 — four-note voicing | `PHYSICALLY_VALID_NOT_APPROVED` |
| 4 — octave displacement | `ACCEPTABLE_MATCH` |

Aggregate:

- matched cases: `2 / 4`
- matched-case rate: `0.5` (`50%`)
- acceptable matches: `2`
- physically valid but not teacher-approved: `2`
- invalid: `0`
- unmatched: `0`

The 50% result is a **blind deterministic baseline measurement**, not a production-quality claim. Cases 2 and 3 are physically valid under PA-8/PA-9, but the blind baseline preserves the source pitches and therefore does not reproduce teacher-approved C=`x32010` and Cmaj7=`x32000` realized voicings.

## Safety boundary

PA-11.3L does not:

- modify engine selection using gold;
- activate production `REVOICED` or `VOICE_REDISTRIBUTED` execution;
- modify optimizer costs/candidate ordering in production;
- change the canonical writer or package-root API;
- grant training authority;
- activate PA-12.

The measurement may be used to identify the capability gap for the next internal stage, but it cannot promote or mutate production behavior by itself.
