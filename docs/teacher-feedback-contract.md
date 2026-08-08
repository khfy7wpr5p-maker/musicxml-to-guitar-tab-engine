# Teacher Feedback Contract 1.1.0

## Purpose

`TeacherFeedback 1.1.0` is an internal immutable record for capturing a teacher's evaluation of an already generated, physically valid fingering decision.

It preserves the optimizer's selected candidate and records one of three teacher decisions:

- `accept`: the optimizer candidate is accepted.
- `override`: the teacher selects a different candidate from the exact observed candidate layer.
- `reject`: the optimizer candidate is rejected and no replacement is asserted.

An optional bounded textual reason may be attached.

Version 1.1.0 adds a required verified `OptimizerObservationDigest 1.0.0` reference. This binds the feedback record to the exact supplied observation content without granting feedback any authority over optimization or canonical TAB output.

## Version references

Each feedback record explicitly references the active versions of:

- Optimizer Observation
- Optimizer Observation Digest
- Pedagogical Feature Vector
- GuitarConfiguration

This prevents future research data from silently mixing incompatible feature/configuration generations and makes the observation-content integrity contract explicit.

## Exact observation and content binding

Feedback creation requires:

- an actual supported `OptimizerObservation 1.0.0` object being reviewed,
- a non-empty bounded opaque `observationId` supplied by the integrating/admission system, and
- a matching `OptimizerObservationDigest 1.0.0` supplied as `observationDigest`.

The returned feedback record stores `observationId` and a frozen copy of the verified `observationDigest`, but does not copy the full observation.

The integrating/admission system is responsible for assigning an `observationId` that uniquely identifies the source observation within its persistence or dataset domain. The TeacherFeedback module validates the identifier's bounded string shape but does not maintain a global identity registry.

Before event-specific TeacherFeedback checks run, `verifyOptimizerObservationDigest()` validates the supplied digest contract, validates the full observation through the reusable `validateOptimizerObservation()` boundary, recomputes the observation digest, and rejects mismatches fail-closed.

For the current supported observation contract the shared full validator checks, among other invariants:

- observation/candidate/optimizer/GuitarConfiguration version metadata;
- a valid six-string guitar configuration and canonical tuning order/values, including pitch↔MIDI consistency;
- dense decision and candidate arrays with exact count/index agreement;
- unique event identities;
- canonical candidate IDs matching the exact event/string/fret position;
- selected-position identity and exact candidate membership;
- complete selected-cost shape, playability, empty rejection reasons, required finite/non-negative breakdown fields, and aggregate total consistency.

For the requested `eventId`, the TeacherFeedback boundary additionally requires:

- the event to exist exactly once in the validated observation decision list;
- `optimizerSelectedCandidateId` in the feedback input to equal the observation's selected candidate exactly;
- an override candidate, when present, to be a different exact member of the same validated event candidate layer.

Feedback for an event that is absent from the supplied observation is rejected.

## OptimizerObservationDigest 1.0.0 boundary

`OptimizerObservationDigest 1.0.0` is an internal content-integrity contract.

The digest uses:

- algorithm: `sha256`,
- domain separation including project identity, `OptimizerObservation`, observation contract version, and digest contract version,
- deterministic canonical JSON-style serialization with lexicographically ordered object keys and preserved array order,
- the complete validated observation content as input.

The canonicalization boundary rejects values that could make the fingerprint ambiguous or allow data to escape the digest, including:

- non-finite numbers,
- unsupported non-JSON value types,
- cycles,
- excessive canonical depth,
- sparse arrays,
- custom array properties,
- symbol properties,
- accessor properties,
- non-enumerable data properties,
- non-plain objects.

The digest record contains exactly:

- `contractVersion: "1.0.0"`,
- `algorithm: "sha256"`,
- `value`: lowercase 64-character SHA-256 hex.

A matching digest means the supplied observation content corresponds to that fingerprint under the current canonicalization contract.

**It is not a digital signature, trusted-producer attestation, persistence receipt, timestamp, or external authenticity proof.** A party able to create a different valid observation can also compute a matching digest for that different observation. Trusted producer identity and dataset admission remain separate future boundaries.

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

Exact candidate membership, the complete supported observation invariants, and the observation content-digest match are enforced inside the TeacherFeedback runtime admission path. This does not wire feedback into normal conversion, create a persistence layer, establish trusted producer identity, or authorize benchmark/dataset admission by itself.

## Consent and privacy separation

A teacher decision is **not** consent for research, model training, analytics reuse, publication, or any other secondary data use.

`TeacherFeedback 1.1.0` intentionally carries no consent, lawful-basis, retention, user-account, student, or research-purpose fields. The runtime accepts only the defined TeacherFeedback input fields and rejects unsupported fields fail-closed, so consent or personal metadata cannot be silently folded into this record shape.

Any research/training admission layer must maintain a separately versioned consent/privacy or lawful-use record and must join it explicitly outside TeacherFeedback.

The optional `reason` remains bounded free text and is not a consent field. Callers must not place teacher/student identifiers or other unnecessary personal data in it.

## Data minimization

The record contains no teacher name, email, account identifier, student identifier, score title, free-form document payload, timestamp, network metadata, or consent record. The optional reason is limited to 1000 characters. `observationId` is an opaque technical identity and must not be populated with personal data.

`observationDigest` contains only the digest contract version, algorithm identifier, and hash value. It must not be treated as a user identity or consent record.

## Regression boundary

S1 regression coverage verifies that TeacherFeedback rejects supplied observations that are partial or forged lookalikes, including unsupported optimizer/candidate metadata, malformed selected positions or candidate identity/membership, malformed cost shape/aggregate totals, invalid guitar tuning semantics, pitch↔MIDI disagreement, and non-canonical tuning order.

S2 regression coverage additionally verifies rejection of:

- missing digest,
- malformed digest contract/value,
- digest mismatch,
- observation content changed after a digest was created,
- copied/altered optimizer metadata,
- symbol-based digest-invisible content,
- non-enumerable digest-invisible content and other unsupported canonicalization shapes.

These tests protect the current integrity boundary but do not prove trusted producer identity, persistence correctness, or lawful dataset admission.

## Integration status

The module remains internal and is not exported from the package-root public API or wired into normal conversion.

The runtime gaps behind the two historical PR #44 P2 findings were closed by the earlier TeacherFeedback hardening: observation identity/exact supplied-observation binding and complete canonical candidate validation with exact same-event membership. Both PR #44 review threads are resolved; review-thread resolution was repository bookkeeping only and did not change runtime behavior.

S1 full observation admission merged in PR #56. S2 observation content-digest binding and the `TeacherFeedback 1.1.0` contract bump merged in PR #58. Merge-post Tests #321 passed on resulting `main` `312261cb374d1959c993530b10c42d32ab8c3caf` for Node.js 18/20/22.

Persistence, global observation-ID uniqueness, trusted-producer authenticity, dataset admission, and separately versioned consent/privacy or lawful-use records remain outside this contract and are not implemented by this module.
