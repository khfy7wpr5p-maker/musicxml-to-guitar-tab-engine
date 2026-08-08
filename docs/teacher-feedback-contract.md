# Teacher Feedback Contract 1.0.0

## Purpose

`TeacherFeedback 1.0.0` is an internal immutable record for capturing a teacher's evaluation of an already generated, physically valid fingering decision.

It preserves the optimizer's selected candidate and records one of three teacher decisions:

- `accept`: the optimizer candidate is accepted.
- `override`: the teacher selects a different candidate from the exact observed candidate layer.
- `reject`: the optimizer candidate is rejected and no replacement is asserted.

An optional bounded textual reason may be attached.

## Version references

Each feedback record explicitly references the active versions of:

- Optimizer Observation
- Pedagogical Feature Vector
- GuitarConfiguration

This prevents future research data from silently mixing incompatible feature/configuration generations.

## Exact observation binding

Feedback creation requires both:

- the actual `OptimizerObservation 1.0.0` object being reviewed, and
- a non-empty bounded opaque `observationId` supplied by the integrating/admission system.

The returned feedback record stores `observationId` but does not copy the full observation.

The integrating/admission system is responsible for assigning an `observationId` that uniquely identifies the source observation within its persistence or dataset domain. The TeacherFeedback module validates the identifier's bounded string shape but does not maintain a global identity registry.

For the requested `eventId`, the TeacherFeedback boundary validates the supplied observation fail-closed and requires:

- the event to exist exactly once in the observation decision list;
- the observed candidate list to be dense and non-empty;
- candidate identities within the observed decision to be canonical and unique;
- every observed candidate identity to encode the same `eventId` as its decision;
- the observation's `selectedCandidateId` to belong to that exact candidate set;
- `optimizerSelectedCandidateId` in the feedback input to equal the observation's selected candidate exactly.

Feedback for an event that is absent from the supplied observation is rejected.

## Canonical candidate identity

Candidate identities must use the canonical form emitted by `createCandidateId`:

```text
candidate:<encodeURIComponent(eventId)>:s<string>:f<fret>
```

The TeacherFeedback boundary validates the complete identity rather than only the `candidate:` prefix. It requires:

- canonical URI encoding of a non-empty event identity;
- guitar string integer `1..6`;
- non-negative integer fret within the supplied observation's `GuitarConfiguration.maximumFret`;
- exact canonical re-encoding through the current candidate identity generator.

For `override`, the teacher-selected identity must also encode the same event and be an exact member of the supplied observation decision's candidate set. A well-formed candidate from another event, or a physically shaped identity not present in the exact observed layer, is rejected.

## Decision semantics

`accept`:

- records the observation's optimizer-selected candidate as the teacher selection;
- rejects a different supplied teacher candidate.

`override`:

- requires a different candidate;
- requires that candidate to belong to the exact observed candidate layer for the same event.

`reject`:

- records no replacement candidate;
- rejects any supplied replacement identity.

These rules record teacher judgment without modifying optimizer output or canonical TAB state.

## Safety boundary

Teacher feedback is observation/research data. It does not mutate or replace the deterministic engine result.

The contract MUST NOT:

- create a new string/fret candidate;
- change MusicXML pitch, rhythm, or event identity;
- modify candidate generation or physical validation;
- change optimizer costs, tie-breaking, or dynamic-programming output;
- write directly to `CanonicalTabResult`;
- bypass the physical validator;
- train or activate a learned ranker by itself.

Exact candidate membership is enforced inside the TeacherFeedback runtime boundary by validating against the supplied `OptimizerObservation`. This does not wire feedback into normal conversion or authorize benchmark/dataset admission by itself.

## Consent and privacy separation

A teacher decision is **not** consent for research, model training, analytics reuse, publication, or any other secondary data use.

`TeacherFeedback 1.0.0` intentionally carries no consent, lawful-basis, retention, user-account, student, or research-purpose fields. The runtime accepts only the defined TeacherFeedback input fields and rejects unsupported fields fail-closed, so consent or personal metadata cannot be silently folded into this record shape.

Any research/training admission layer must maintain a separately versioned consent/privacy or lawful-use record and must join it explicitly outside TeacherFeedback.

The optional `reason` remains bounded free text and is not a consent field. Callers must not place teacher/student identifiers or other unnecessary personal data in it.

## Data minimization

V1 contains no teacher name, email, account identifier, student identifier, score title, free-form document payload, timestamp, network metadata, or consent record. The optional reason is limited to 1000 characters. `observationId` is an opaque technical identity and must not be populated with personal data.

## Integration status

The module remains internal and is not exported from the package-root public API or wired into normal conversion.

The runtime gaps behind the two historical PR #44 P2 findings are closed by the merged TeacherFeedback hardening: observation identity/exact supplied-observation binding and complete canonical candidate validation with exact same-event membership. Both PR #44 review threads are now resolved after merged runtime/regression evidence and merge-post Tests #305 were verified. Review-thread resolution was repository bookkeeping only and did not change runtime behavior.

Persistence, global observation-ID uniqueness, benchmark/dataset admission, and separately versioned consent/privacy or lawful-use records remain outside this contract and are not implemented by this module.
