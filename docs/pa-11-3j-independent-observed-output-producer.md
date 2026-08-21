# PA-11.3J — Independent Engine Observation → Observed Output Producer

## Status

- Gate: `PA-11`
- Slice: `PA-11.3J`
- Authority: evaluation-only adapter
- Public API change: none
- Production conversion change: none
- Canonical writer change: none
- Training authority: none
- Production `REVOICED` / `VOICE_REDISTRIBUTED` activation: none
- PA-12 activation: none

## Purpose

PA-11.3I can score `TeacherArrangementObservedOutput 1.0.0`, but genuine measurement still needs a producer boundary that records independently produced engine facts without reading teacher-approved answers.

PA-11.3J adds that boundary.

The producer accepts only:

1. evaluation scope identity:
   - `benchmarkId`
   - `benchmarkVersion`
   - ordered `caseIds`
2. independent engine-result facts:
   - source outcomes
   - selected guitar tones
   - barre facts
   - explicit `null` when no arrangement was produced.

It does **not** accept benchmark JSON, approval/review JSON, accepted/preferred arrangement IDs, teacher labels, match classifications, or scoring hints. Unknown fields fail closed.

## Input

```text
IndependentEngineArrangementObservation 1.0.0
├─ documentType
├─ contractVersion
├─ evaluationScope
│  ├─ benchmarkId
│  ├─ benchmarkVersion
│  └─ caseIds[]
└─ cases[]
   ├─ caseId
   └─ result | null
      ├─ sourceOutcomes[]
      ├─ selectedTones[]
      └─ barres[]
```

`evaluationScope` identifies what is being measured, not the approved answer.

Every scope case must have exactly one explicit case entry. Engine cases may arrive in any order; output is deterministically reordered to `evaluationScope.caseIds`. `result: null` remains null and PA-11.3I classifies it as `UNMATCHED`.

## Output

```text
TeacherArrangementObservedOutput 1.0.0
```

Selected engine tones become scorer `realizedTones` with local deterministic IDs:

```text
engine-observation:<caseIndex>:tone:<toneIndex>
```

Those IDs carry no teacher/gold identity and are ignored by PA-11.3I semantic matching.

## Provenance consistency

Before emission the producer checks only independent internal consistency:

- unique source outcomes;
- selected tones reference represented source events;
- each source outcome's target-MIDI multiset exactly matches its selected tones;
- `RETAINED` has one or more target MIDIs;
- `OMITTED` has none.

The producer does not decide teacher acceptability and does not repair physical or musical errors. Physical validation and teacher-approved comparison remain PA-11.3I responsibilities.

## Anti-leakage boundary

Exact-field admission prevents the producer input from carrying hidden gold facts. Fields such as `arrangementId`, `acceptedArrangements`, `preferredArrangementId`, review state, or any other unrecognized field are rejected.

The scorer-compatibility test uses only explicit `null` engine results for the real four-case benchmark, proving integration without copying teacher-approved answers into the producer fixture.

## Current architecture boundary

The public production conversion path remains monophonic `CanonicalTabResult 1.0.0`. PA-11.3J does not create a polyphonic final selector, does not activate deferred arrangement decisions, does not change optimizer/candidate ordering, does not write canonical output, and grants no production or training authority.

A future genuine benchmark run must obtain engine-result facts independently, pass them through this producer, and only then pass the emitted observed output to PA-11.3I scoring.