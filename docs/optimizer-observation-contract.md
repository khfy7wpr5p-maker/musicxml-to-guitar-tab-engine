# OptimizerObservation 1.0.0

## Status

This document defines the internal observation contract for the deterministic fingering optimizer.

- Observation contract version: `1.0.0`
- Optimizer algorithm version: `1.0.0`
- Guitar configuration reference: `GuitarConfiguration 1.0.0`
- Candidate contract reference: `CanonicalFingeringCandidates 1.0.0`
- Step 1 hostile-data hardening: merged
- Step 2 cost-shape/playability/aggregate-consistency hardening: merged
- Step 2.4 negative-regression completeness: merged
- S1 reusable full-observation validation: merged
- Public package-root export: not part of this milestone
- Normal conversion-pipeline wiring: not implemented

## Purpose

`OptimizerObservation` records what the existing deterministic optimizer saw and selected. It is an observation-only layer. It does not participate in candidate generation, physical validation, cost calculation, tie-breaking, or final canonical selection.

The foundation is intended to support later pedagogical feature extraction, teacher-feedback recording, deterministic benchmark evaluation, and learned ranking research without giving those layers authority over the deterministic core.

## Authority boundary

The observation layer may:

- identify every physical candidate deterministically,
- record the selected candidate,
- copy the existing cost breakdown,
- validate the required selected-cost shape and selected-playability invariants,
- validate aggregate selected-path cost consistency,
- validate a complete supported `OptimizerObservation 1.0.0` through the reusable internal `validateOptimizerObservation()` boundary,
- record optimizer and configuration versions,
- preserve event/measure references,
- provide immutable data for later analysis.

The observation layer may not:

- add or remove candidates,
- change pitch,
- change string or fret values,
- change physical playability rules,
- recalculate or override optimizer costs,
- change optimizer tie-breaking,
- replace `CanonicalTabResult`,
- write back into canonical music or optimizer state,
- bypass teacher review or validators,
- prove cryptographic provenance or bind an observation to a historical run by itself.

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

The `cost` object is copied from the existing deterministic optimizer result. The observation layer does not rerun or replace the cost model; it validates the copied record before admitting it into an observation.

## Reusable full-observation validation

S1 introduces one reusable internal `validateOptimizerObservation(observation)` boundary. The same validator is used:

- by `createOptimizerObservation()` after constructing the complete observation and before deep-freezing/returning it, and
- by `TeacherFeedback` before accepting feedback bound to a supplied observation.

The validator rejects unsupported or forged observation content fail-closed. For the current `1.0.0` contract it verifies:

- `documentType`, observation contract version, candidate contract version, optimizer name/version, and guitar-configuration contract version;
- a valid six-string `GuitarConfiguration` value with valid fret range;
- dense six-entry tuning with canonical string order and exact normalized `number`, `midi`, and `pitch` values, including pitch↔MIDI consistency;
- non-empty `partId`;
- non-negative `noteCount`, a dense `decisions` array, and exact decision-count agreement;
- finite non-negative top-level `totalCost`;
- `decisionIndex` equal to the decision's array position;
- non-empty unique `eventId` values, non-empty `measureKey`, and non-negative integer `eventIndex`;
- dense non-empty candidate lists;
- `candidateIndex` equal to the candidate's array position;
- candidate positions inside guitar string/fret bounds;
- canonical, unique candidate IDs derived from the decision event and candidate position;
- canonical selected-position identity and exact selected-candidate membership;
- complete selected-cost shape, selected playability, empty rejection reasons, and required finite/non-negative breakdown values;
- exact aggregate equality between the sum of decision cost totals and observation `totalCost`.

The validator checks the supported observation's structure and internal semantics. It does **not** cryptographically prove that a valid observation object was emitted by one particular historical optimizer execution. Content-digest/provenance binding requires a separate versioned security gate.

## Decision trace semantics

For each note event, the observation contains the complete physically valid candidate layer supplied to the optimizer and identifies exactly one selected candidate. The selected position must already exist in that layer. A forged or inconsistent optimizer result fails closed with `INVALID_OPTIMIZER_OBSERVATION_INPUT`.

The current foundation records the winning decision path and its existing cost breakdown. It does not yet record every rejected transition or every intermediate dynamic-programming state. Such expansion requires a separate approved milestone because it can increase memory/output cost significantly.

## Selected-cost integrity

Every observed selected cost must have:

- a finite, non-negative `cost.total`,
- boolean `cost.isPlayable`,
- a dense `cost.reasons` array containing only non-empty strings,
- `cost.isPlayable === true`,
- `cost.reasons.length === 0`,
- an object-valued `cost.breakdown`.

For the first selected position, the required finite, non-negative numeric breakdown fields are:

- `highFretDistance`
- `highFretCost`
- `openStringPreferenceCost`

For each later transition, the required finite, non-negative numeric breakdown fields are:

- `fretMovement`
- `fretMovementCost`
- `stringMovement`
- `stringMovementCost`
- `largeShiftDistance`
- `largeShiftCost`
- `highFretDistance`
- `highFretCost`
- `openStringPreferenceCost`
- `samePositionPreferenceCost`

Transition breakdowns also require boolean `samePosition`.

Extra copied optimizer metadata may remain present, subject to the hostile-data limits below. The required fields above may not be omitted or replaced by malformed values.

## Aggregate cost consistency

`optimizerResult.totalCost` must be finite and non-negative. After every selected decision cost has been validated, the observation builder sums each selected `decision.cost.total`. The resulting aggregate must equal `optimizerResult.totalCost` exactly.

The reusable S1 validator independently applies the same aggregate rule to a supplied complete observation: the sum of observed decision costs must equal `observation.totalCost` exactly.

A forged top-level total or a forged individual selected-decision total therefore fails closed with `INVALID_OPTIMIZER_OBSERVATION_INPUT`.

These checks verify internal consistency of the supplied deterministic optimizer result/observation. They do not authorize the observation layer to recompute optimizer decisions, run the cost model, or alter a selected cost.

## Immutability and hostile-data handling

Produced observations are deeply frozen. The builder/shared validator rejects:

- unsupported observation, candidate, optimizer, or guitar-configuration contract metadata,
- invalid or non-canonical six-string tuning semantics/order,
- pitch/MIDI disagreement in observed tuning,
- count/length mismatches,
- invalid string/fret values,
- duplicate event identities,
- incorrect decision/candidate array-index identities,
- malformed, duplicate, or position-inconsistent candidate identities,
- selected positions outside candidate membership,
- negative or non-finite total/cost values,
- incomplete or malformed required selected-cost records,
- selected costs marked unplayable or carrying rejection reasons,
- aggregate/per-decision selected-cost inconsistencies,
- cyclic metadata graphs,
- observed metadata nested more than 100 object/array edges below a copied metadata root,
- sparse `candidateSet.notes`, `candidateSet.candidateLayers`,
  `optimizerResult.positions`, or `optimizerResult.costs` arrays,
- sparse individual arrays nested within `candidateSet.candidateLayers`,
- sparse observation `decisions`, candidate lists, or `cost.reasons` arrays.

Metadata cloning accepts a maximum nesting depth of exactly 100 object/array edges;
depth 101 fails closed with `INVALID_OPTIMIZER_OBSERVATION_INPUT`. Cycle and depth
rejection prevent recursive observation cloning from becoming an uncontrolled
stack/resource path. Deep freezing uses an iterative traversal, so accepted metadata
does not reintroduce a recursive call-stack failure. Sparse arrays are rejected before
iteration so holes cannot bypass note, candidate, position, cost, reason, decision, or
candidate-index validation.

## Regression boundary

Merged negative regression coverage independently protects the principal observation-integrity rules, including:

- sparse observation arrays and nested candidate layers,
- cyclic and over-depth copied metadata,
- missing/malformed selected-cost fields,
- non-finite and negative selected-cost totals and breakdown fields,
- `isPlayable: false` even when `reasons` is empty,
- a selected playable cost carrying rejection reasons,
- forged top-level aggregate cost,
- forged per-decision selected cost,
- a minimal/partial `OptimizerObservation` lookalike,
- forged optimizer or candidate-contract metadata,
- malformed selected position or selected candidate identity/membership,
- forged candidate indices/position identities,
- malformed guitar configuration/tuning,
- pitch↔MIDI disagreement,
- non-canonical tuning string order.

This test coverage is a regression boundary, not a claim that every future optimizer metadata field is independently enumerated by this contract.

## Versioning rule

`FINGERING_OPTIMIZER_VERSION` identifies the deterministic DP behavior observed by this contract. A future behavioral change to optimizer candidate ordering, cost path selection, or tie-breaking must be evaluated for an optimizer-version change.

`OPTIMIZER_OBSERVATION_VERSION` identifies the observation data contract. Adding/removing/renaming required observation fields requires compatibility review and an appropriate contract-version change.

A future cryptographic/content-digest provenance field is not implicitly part of `1.0.0`; it requires a separately approved compatibility/versioning decision.

## Public API boundary

The following remain internal in this milestone:

- `FINGERING_OPTIMIZER_VERSION`
- `OPTIMIZER_OBSERVATION_VERSION`
- `OptimizerObservationError`
- `createCandidateId`
- `validateOptimizerObservation`
- `createOptimizerObservation`

The package-root API is unchanged. Integration Contract v1 therefore remains the external authority boundary.

## Pipeline status

This foundation is deliberately **not wired into the conversion pipeline** yet. Normal MusicXML → `CanonicalTabResult` behavior remains unchanged and does not allocate an observation object.

Step 1, Step 2.1–2.4, and S1 observation-integrity hardening being complete do not make the broader benchmark/research pipeline active. TeacherFeedback exact observation/candidate binding and shared full-observation admission are merged, but cryptographic/content-digest provenance, dataset admission, persistence/global identity, and separate privacy/consent boundaries remain prerequisites before feedback-backed research data can be admitted.

A later, separately approved step may define how observations are requested, persisted, content-addressed, or captured without changing the authoritative deterministic result.

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
