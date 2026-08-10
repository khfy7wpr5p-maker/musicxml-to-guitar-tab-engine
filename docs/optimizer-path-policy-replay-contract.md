# Optimizer Path-Policy Semantic Replay 1.0.0

## Status

This document defines the internal LR-S1B.2a semantic replay verification boundary.

- Verifier contract: `OptimizerPathPolicyReplay 1.0.0`
- Implementation: `src/fingering/optimizerPathPolicyReplay.js`
- Regression tests: `tests/optimizerPathPolicyReplay.test.js`
- Package-root public API: unchanged
- `OptimizerObservation 1.0.0`: unchanged
- `FingeringPathPolicySnapshot 1.0.0`: unchanged
- `CanonicalTabResult 1.0.0`: unchanged
- Production optimizer authority: unchanged

## Purpose

LR-S1B.2a answers one narrow question:

> Can the exact validated `OptimizerObservation` be deterministically reproduced from its own observed candidate layers under the exact validated LR-S1B.1 path-policy snapshot?

A successful verification returns `true`. Any malformed input, binding mismatch, replay mismatch, movement-limit violation, cost mismatch, or replay resource-limit failure is fail-closed.

LR-S1B.2a does not create a durable binding record and does not create a binding digest. Those responsibilities remain LR-S1B.2b.

## Required input

The verifier accepts exactly four internal values:

```text
{
  observation,
  observationDigest,
  pathPolicySnapshot,
  pathPolicyDigest
}
```

The supplied observation digest must exactly bind the complete supplied `OptimizerObservation`. The supplied path-policy digest must exactly bind the complete supplied `FingeringPathPolicySnapshot`.

No caller-supplied runtime, callback, optimizer implementation, model, candidate set, filesystem path, network resource, or executable hook is accepted.

## Candidate replay source

Replay candidate layers are reconstructed only from:

```text
observation.decisions[].candidates[].position
```

The verifier does not accept a second external candidate graph. This prevents a caller from pairing one observation digest with a semantically different replay candidate set.

The current accepted observation contract uses the current six-string deterministic candidate boundary, so semantic replay limits each decision to at most six observed candidates and at most 50,000 decisions.

These limits are replay/resource boundaries, not proof that the candidate graph originated from a particular MusicXML source.

## Strict hostile-input boundary

Before delegating to existing observation/digest validators, LR-S1B.2a requires canonical own-data shapes for the observation graph and digest wrappers.

The boundary rejects unsupported or ambiguous JavaScript shapes including:

- proxy objects,
- accessor-backed properties,
- symbol properties,
- non-enumerable semantic fields,
- missing or unknown fields in the defined observation shape,
- sparse arrays,
- custom array properties,
- non-finite numeric values,
- negative zero numeric values.

Negative zero is rejected because JSON serialization collapses `-0` to `0`; semantic replay must not accept two distinguishable JavaScript numeric values as one digest-domain representation.

The LR-S1B.1 path-policy snapshot validator remains authoritative for strict path-policy shape and numeric validation.

## Pre-digest resource boundaries

Hostile input must be bounded before digest verification or optimizer replay begins. LR-S1B.2a therefore applies these internal fail-closed limits while inspecting the canonical observation/digest wrappers:

- at most 50,000 observation decisions,
- at most six candidates per decision,
- at most 16 `cost.reasons` entries per decision,
- at most 4,096 characters in any one semantic string,
- at most 4 Mi characters across semantic strings inspected by the pre-digest boundary.

Exceeding one of these resource bounds throws `OPTIMIZER_PATH_POLICY_REPLAY_RESOURCE_LIMIT`. These bounds are independent from the later trusted `ProcessingRuntime` deadline: the static limits prevent unbounded work before the runtime checkpoint boundary becomes active, while the runtime deadline bounds deterministic optimizer replay itself.

These limits do not enlarge accepted musical authority and do not prove source provenance. Changing them requires a separate compatibility/security review because they are part of the LR-S1B.2a hostile-input contract.

## Verification sequence

The verifier performs the following fail-closed sequence:

1. Validate the exact LR-S1B.2a input shape.
2. Validate the exact canonical observation graph shape used by the current `OptimizerObservation 1.0.0` producer while enforcing the pre-digest resource bounds.
3. Verify `OptimizerObservationDigest 1.0.0` against the supplied observation.
4. Verify the LR-S1B.1 path-policy digest against the supplied snapshot.
5. Require the current deterministic dynamic-programming optimizer identity/version.
6. Require exact `maximumFret` agreement between the bound path policy and the observed guitar configuration.
7. Check the observed selected path explicitly against bound fret/string movement caps.
8. Reconstruct candidate layers from the observation itself.
9. Re-run the existing deterministic optimizer with the exact bound cost profile and a trusted internal processing runtime.
10. Require exact replay total-cost equality.
11. Require exact selected-position equality for every decision.
12. Require exact selected cost-record equality for every decision.

Any failure throws `OptimizerPathPolicyReplayError` with an internal fail-closed replay code.

## Trusted replay runtime

Semantic replay uses the engine's internal `ProcessingRuntime 1.0.0`; callers cannot provide or replace the runtime or clock.

The existing optimizer checkpoint boundary therefore remains active during replay. A processing deadline failure is surfaced as a semantic replay resource-limit failure rather than being treated as successful provenance evidence.

## What successful replay proves

A successful LR-S1B.2a verification establishes only:

> The exact supplied observation content is semantically compatible with, and deterministically reproducible under, the exact supplied path-policy content on the candidate graph recorded inside that observation.

It also establishes that the observed selected costs and hard movement limits are compatible with that deterministic replay.

## What successful replay does not prove

LR-S1B.2a does not prove:

- that the historical producer actually used this policy at the original execution time,
- producer identity or cryptographic authenticity,
- run timestamp authenticity,
- that the observation candidate graph came from a particular MusicXML source,
- source-document authenticity,
- training-data provenance,
- teacher approval,
- lawful-use/privacy status,
- that this policy is pedagogically superior,
- that any learned/shadow output may alter canonical selection.

Different policies can sometimes produce the same deterministic path on the same candidate graph. Semantic replay therefore must not be described as historical execution proof.

## Authority boundary

LR-S1B.2a remains verification-only infrastructure.

It does not:

- modify the deterministic optimizer,
- modify the cost model,
- modify candidate generation,
- modify `OptimizerObservation 1.0.0`,
- modify `FingeringPathPolicySnapshot 1.0.0`,
- modify `CanonicalTabResult 1.0.0`,
- modify normal MusicXML conversion,
- modify writers,
- add a package-root export,
- persist a binding record,
- create a binding digest,
- connect learned/shadow ranking to canonical selection,
- grant learned/shadow ranking production authority.

The LR-S0/LR-S1A `authority: "none"` boundary remains unchanged.

## Relationship to LR-S1B.2b

LR-S1B.2b is a separate later gate. It may define an immutable `OptimizerPathPolicyBinding` record and a domain-separated binding digest only after LR-S1B.2a has successfully verified the semantic relationship.

LR-S1B.2b must not weaken the semantic replay requirements and must not reinterpret semantic compatibility as producer authenticity.
