# Teacher Feedback Contract 1.0.0

## Purpose

`TeacherFeedback 1.0.0` is an internal immutable record for capturing a teacher's evaluation of an already generated, physically valid fingering decision.

It preserves the optimizer's selected candidate and records one of three teacher decisions:

- `accept`: the optimizer candidate is accepted.
- `override`: the teacher selects a different existing candidate.
- `reject`: the optimizer candidate is rejected and no replacement is asserted.

An optional bounded textual reason may be attached.

## Version references

Each feedback record explicitly references the active versions of:

- Optimizer Observation
- Pedagogical Feature Vector
- GuitarConfiguration

This prevents future research data from silently mixing incompatible feature/configuration generations.

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

`override` records a candidate identity supplied by a reviewed caller. Membership in the exact observed candidate set must be verified by a later integration layer before feedback is admitted to a benchmark or research dataset. This foundation intentionally does not accept arbitrary candidate objects or perform pipeline integration.

## Data minimization

V1 contains no teacher name, email, account identifier, student identifier, score title, free-form document payload, timestamp, or network metadata. The optional reason is limited to 1000 characters.

## Integration status

Foundation only. The module is internal and is not exported from the package-root public API or wired into normal conversion.
