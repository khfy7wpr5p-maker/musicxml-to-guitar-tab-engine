# OptimizerObservation 1.0.0

## Status

This document defines the first internal observation contract for the deterministic fingering optimizer.

- Observation contract version: `1.0.0`
- Optimizer algorithm version: `1.0.0`
- Guitar configuration reference: `GuitarConfiguration 1.0.0`
- Candidate contract reference: `CanonicalFingeringCandidates 1.0.0`
- Public package-root export: not part of this milestone

## Purpose

`OptimizerObservation` records what the existing deterministic optimizer saw and selected. It is an observation-only layer. It does not participate in candidate generation, physical validation, cost calculation, tie-breaking, or final canonical selection.

The foundation is intended to support later pedagogical feature extraction, teacher-feedback recording, deterministic benchmark evaluation, and learned ranking research without giving those layers authority over the deterministic core.

## Authority boundary

The observation layer may:

- identify every physical candidate deterministically,
- record the selected candidate,
- copy the existing cost breakdown,
- record optimizer and configuration versions,
- preserve event/measure references,
- provide immutable data for later analysis.

The observation layer may not:

- add or remove candidates,
- change pitch,
- change string or fret values,
- change physical playability rules,
- recalculate or override costs,
- change optimizer tie-breaking,
- replace `CanonicalTabResult`,
- write back into canonical music or optimizer state,
- bypass teacher review or validators.

## Candidate identity

Candidate identity is derived only from the canonical event identity and physical position:

```text
candidate:<encoded-event-id>:s<string>:f<fret>
```

Example:

```text
candidate:m1-e0:s2:f1
```

This identity is deterministic for the same event/string/fret combination and does not contain model scores, teacher labels, array object identity, timestamps, randomness, or external database identifiers.

## Observation shape

The internal runtime object contains:

```text
OptimizerObservation
├── documentType = OptimizerObservation
├── contractVersion = 1.0.0
├── candidateContractVersion
├── optimizer
│   ├── name = deterministic-dynamic-programming
│   └── version = 1.0.0
├── guitarConfiguration
│   ├── contractVersion = 1.0.0
│   └── value
├── partId
├── noteCount
├── totalCost
└── decisions[]
    ├── decisionIndex
    ├── eventId
    ├── measureKey
    ├── eventIndex
    ├── candidates[]
    │   ├── candidateId
    │   ├── candidateIndex
    │   └── position { string, fret }
    ├── selectedCandidateId
    ├── selectedPosition
    └── cost
        ├── total
        ├── isPlayable
        ├── reasons
        └── breakdown
```

The `cost` object is copied from the existing deterministic optimizer result. The observation layer does not recompute it.

## Decision trace semantics

For each note event, the observation contains the complete physically valid candidate layer supplied to the optimizer and identifies exactly one selected candidate. The selected position must already exist in that layer. A forged or inconsistent optimizer result fails closed with `INVALID_OPTIMIZER_OBSERVATION_INPUT`.

The current foundation records the winning decision path and its existing cost breakdown. It does not yet record every rejected transition or every intermediate dynamic-programming state. Such expansion requires a separate approved milestone because it can increase memory/output cost significantly.

## Immutability and hostile-data handling

Produced observations are deeply frozen. The builder rejects:

- unsupported candidate contract versions,
- count/length mismatches,
- invalid string/fret values,
- selected positions outside candidate membership,
- negative or non-finite total/cost values,
- cyclic metadata graphs.

Cycle rejection is fail-closed to prevent recursive observation cloning from becoming an uncontrolled stack/resource path.

## Versioning rule

`FINGERING_OPTIMIZER_VERSION` identifies the deterministic DP behavior observed by this contract. A future behavioral change to optimizer candidate ordering, cost path selection, or tie-breaking must be evaluated for an optimizer-version change.

`OPTIMIZER_OBSERVATION_VERSION` identifies the observation data contract. Adding/removing/renaming required observation fields requires compatibility review and an appropriate contract-version change.

## Public API boundary

The following remain internal in this milestone:

- `FINGERING_OPTIMIZER_VERSION`
- `OPTIMIZER_OBSERVATION_VERSION`
- `OptimizerObservationError`
- `createCandidateId`
- `createOptimizerObservation`

The package-root API is unchanged. Integration Contract v1 therefore remains the external authority boundary.

## Pipeline status

This foundation is deliberately **not wired into the conversion pipeline** yet. Normal MusicXML → `CanonicalTabResult` behavior remains unchanged and does not allocate an observation object.

A later, separately approved step may define how observations are requested or captured without changing the authoritative deterministic result.

## Relationship to later learning stages

The approved dependency direction is:

```text
Physical Candidate Generator
        ↓
Deterministic Cost Model
        ↓
Deterministic Optimizer
        ↓
CanonicalTabResult (authority)
        │
        └── observation-only copy
                  ↓
         OptimizerObservation
                  ↓
       Pedagogical Feature Vector
                  ↓
          Teacher Feedback
                  ↓
              Benchmark
                  ↓
       Learned Ranking Research
```

Any learned component remains downstream and non-authoritative unless a future separately approved contract explicitly states otherwise. It may never create physically invalid candidates or bypass deterministic safety validation.
