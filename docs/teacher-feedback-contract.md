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

- an actual supported `OptimizerObservation 1.0.0` object being reviewed, and
- a non-empty bounded opaque `observationId` supplied by the integrating/admission system.

The returned feedback record stores `observationId` but does not copy the full observation.

The integrating/admission system is responsible for assigning an `observationId` that uniquely identifies the source observation within its persistence or dataset domain. The TeacherFeedback module validates the identifier's bounded string shape but does not maintain a global identity registry.

Before event-specific TeacherFeedback checks run, the supplied observation is passed through the reusable internal `validateOptimizerObservation()` boundary from the OptimizerObservation module. TeacherFeedback therefore does not maintain a weaker parallel observation validator. Unsupported or forged observation metadata/shape fails closed before feedback admission.

For the current supported observation contract the shared validator checks, among other invariants:

- observation/candidate/optimizer/GuitarConfiguration version metadata;
- a valid six-string guitar configuration and canonical tuning order/values, including pitch↔MIDI consistency;
- dense decision and candidate arrays with exact count/index agreement;
- unique event identities;
- canonical candidate IDs matching the exact event/string/fret position;
- selected-position identity and exact candidate membership;
- complete selected-cost shape, playability, empty rejection reasons, required finite/non-negative breakdown fields, and aggregate total consistency.

For the requested `eventId`, the TeacherFeedback boundary then additionally requires:

- the event to exist exactly once in the validated observation decision list;
- `optimizerSelectedCandidateId` in the feedback input to equal the observation's selected candidate exactly;
- an override candidate, when present, to be a different exact member of the same validated event candidate layer.

Feedback for an event that is absent from the supplied observation is rejected.

This is full supported-contract validation, not cryptographic provenance. A structurally and semantically valid observation object is accepted as such; `TeacherFeedback 1.0.0` does not yet contain or verify a content digest proving that the object originated from one particular historical optimizer run.

## Canonical candidate identity

Candidate identities must use the canonical form emitted by `createCandidateId`:

```text
candidate:<encodeURIComponent(eventId)>:s<string>:f<fret>
```

The shared observation validator and TeacherFeedback event-specific boundary validate complete candidate identity rather than only the `candidate:` prefix. They require:

- canonical URI encoding of a non-empty event identity;
- guitar string integer `1..6`;
- non-negative integer fret within the supplied observation's `GuitarConfiguration.maximumFret`;
- exact canonical re-encoding through the current candidate identity generator;
- exact position/identity agreement inside the validated observation candidate layer.

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

Exact candidate membership and the complete supported observation invariants are enforced inside the TeacherFeedback runtime admission path by reusing `validateOptimizerObservation()`. This does not wire feedback into normal conversion, create a persistence layer, or authorize benchmark/dataset admission by itself.

## Consent and privacy separation

A teacher decision is **not** consent for research, model training, analytics reuse, publication, or any other secondary data use.

`TeacherFeedback 1.0.0` intentionally carries no consent, lawful-basis, retention, user-account, student, or research-purpose fields. The runtime accepts only the defined TeacherFeedback input fields and rejects unsupported fields fail-closed, so consent or personal metadata cannot be silently folded into this record shape.

Any research/training admission layer must maintain a separately versioned consent/privacy or lawful-use record and must join it explicitly outside TeacherFeedback.

The optional `reason` remains bounded free text and is not a consent field. Callers must not place teacher/student identifiers or other unnecessary personal data in it.

## Data minimization

V1 contains no teacher name, email, account identifier, student identifier, score title, free-form document payload, timestamp, network metadata, or consent record. The optional reason is limited to 1000 characters. `observationId` is an opaque technical identity and must not be populated with personal data.

A future observation content digest, if approved, must be introduced through a separately reviewed versioning/security decision; it is not implicitly part of this `1.0.0` record.

## Regression boundary

S1 regression coverage verifies that TeacherFeedback rejects supplied observations that are only partial or forged lookalikes, including cases with unsupported optimizer/candidate metadata, malformed selected positions or candidate identity/membership, malformed cost shape/aggregate totals, and invalid guitar tuning semantics. Additional negative cases reject pitch↔MIDI disagreement and non-canonical tuning order.

These tests protect the current admission boundary but do not prove external provenance or persistence correctness.

## Integration status

The module remains internal and is not exported from the package-root public API or wired into normal conversion.

The runtime gaps behind the two historical PR #44 P2 findings were closed by the earlier TeacherFeedback hardening: observation identity/exact supplied-observation binding and complete canonical candidate validation with exact same-event membership. Both PR #44 review threads are resolved; review-thread resolution was repository bookkeeping only and did not change runtime behavior.

S1 full observation admission merged in PR #56. The TeacherFeedback path now reuses the complete OptimizerObservation validator rather than trusting a partial `OptimizerObservation` lookalike. Merge-post Tests #311 passed on the resulting `main` for Node.js 18/20/22.

Persistence, global observation-ID uniqueness, cryptographic/content-digest provenance, benchmark/dataset admission, and separately versioned consent/privacy or lawful-use records remain outside this contract and are not implemented by this module.
