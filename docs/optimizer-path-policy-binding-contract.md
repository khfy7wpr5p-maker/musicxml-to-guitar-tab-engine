# Optimizer Path-Policy Binding 1.0.0

## Status

This document defines the internal LR-S1B.2b durable association boundary built on top of LR-S1B.1 path-policy content binding and LR-S1B.2a semantic replay.

- Binding contract: `OptimizerPathPolicyBinding 1.0.0`
- Binding digest contract: `OptimizerPathPolicyBindingDigest 1.0.0`
- Binding digest algorithm: SHA-256
- Implementation: `src/fingering/optimizerPathPolicyBinding.js`
- Regression tests: `tests/optimizerPathPolicyBinding.test.js`
- Package-root public API: unchanged
- `OptimizerObservation 1.0.0`: unchanged
- `FingeringPathPolicySnapshot 1.0.0`: unchanged
- `OptimizerPathPolicyReplay 1.0.0`: unchanged
- `CanonicalTabResult 1.0.0`: unchanged
- Production optimizer authority: unchanged

## Purpose

LR-S1B.2b answers one narrow persistence question:

> After LR-S1B.2a has successfully verified semantic replay, how can the exact observation-content reference, exact path-policy content, optimizer identity, and replay scope be stored together as one immutable internal record whose content can later be checked for accidental or stale association changes?

The binding creator does not accept a caller-supplied `verified` flag or caller-supplied replay evidence. It invokes the existing LR-S1B.2a verifier itself and creates a binding only after that verifier returns success.

LR-S1B.2b does not make semantic replay authoritative over canonical fingering and does not prove historical producer authenticity.

## Creation input

The creator accepts exactly the same four values required by LR-S1B.2a:

```text
{
  observation,
  observationDigest,
  pathPolicySnapshot,
  pathPolicyDigest
}
```

No caller-supplied binding record, replay status, replay scope, runtime, clock, callback, candidate graph, optimizer implementation, model, filesystem path, network resource, process hook, plugin, or executable extension is accepted.

Before constructing a record, the creator calls:

```text
verifyOptimizerPathPolicyReplay({
  observation,
  observationDigest,
  pathPolicySnapshot,
  pathPolicyDigest
})
```

Any LR-S1B.2a failure is fail-closed and no binding is produced.

## Binding record

A successful non-empty binding has the following internal shape:

```text
OptimizerPathPolicyBinding
├── documentType = "OptimizerPathPolicyBinding"
├── contractVersion = "1.0.0"
├── authority = "none"
├── optimizerObservationVersion = "1.0.0"
├── noteCount
├── observationDigest
│   ├── contractVersion
│   ├── algorithm
│   └── value
├── optimizer
│   ├── name = "deterministic-dynamic-programming"
│   └── version
├── pathPolicySnapshot
│   ├── documentType = "FingeringPathPolicySnapshot"
│   ├── contractVersion = "1.0.0"
│   └── costProfile
│       └── complete normalized eleven-field policy
├── pathPolicyDigest
│   ├── contractVersion
│   ├── algorithm
│   └── value
└── semanticReplay
    ├── contractVersion = "1.0.0"
    ├── status = "verified"
    └── scope
```

The complete observation is intentionally not copied into the binding. The record stores its exact validated `OptimizerObservationDigest` reference instead.

The complete normalized path-policy snapshot is embedded because it is a small fixed contract and its own LR-S1B.1 digest must verify against that exact embedded snapshot.

The producer returns the complete binding deeply frozen.

## Replay scope

Replay scope is explicit and tied to the stored `noteCount` structural field:

- `noteCount > 0` requires `semanticReplay.scope = "deterministic-path"`.
- `noteCount === 0` requires `semanticReplay.scope = "empty-observation"`.

The zero-note case is deliberately not described as evidence that a policy selected a path. LR-S1B.2a validates the empty state without invoking a non-empty optimizer path, so LR-S1B.2b preserves that distinction in persisted metadata.

`semanticReplay.status` is always `"verified"` only on records created after successful LR-S1B.2a verification.

## Persisted-record validation boundary

`validateOptimizerPathPolicyBinding()` validates the stored record itself. It requires:

- the exact binding field set,
- a non-proxy plain record,
- version `1.0.0`,
- `authority: "none"`,
- the supported `OptimizerObservation` version,
- bounded non-negative integer `noteCount`,
- a valid `OptimizerObservationDigest` wrapper,
- the current deterministic optimizer name and version,
- a valid exact `FingeringPathPolicySnapshot`,
- a path-policy digest that verifies the embedded snapshot,
- LR-S1B.2a replay contract version,
- replay status `"verified"`,
- replay scope structurally consistent with zero versus non-zero `noteCount`.

Hostile or ambiguous top-level/nested data accepted through this boundary is rejected through the strict binding checks and the existing strict digest/snapshot validators, including unsupported proxy/accessor/symbol/unknown-field shapes and negative-zero policy values.

## Critical proof limitation of persisted validation

A persisted binding intentionally does **not** contain the full observation. Therefore `validateOptimizerPathPolicyBinding(record)` cannot independently re-run LR-S1B.2a from the record alone.

This distinction is mandatory:

- `createOptimizerPathPolicyBinding(...)` establishes that this implementation performed a successful LR-S1B.2a replay immediately before constructing the returned binding.
- `validateOptimizerPathPolicyBinding(record)` later establishes only that the supplied persisted record has the supported internal structure and internally consistent embedded policy/digest metadata.
- `verifyOptimizerPathPolicyBindingDigest(record, digest)` later establishes only that the supplied record content matches the supplied binding content digest.

A persisted record plus an ordinary SHA-256 digest is not cryptographic evidence that a trusted creator originally performed the replay. An actor who is able to manufacture arbitrary records and calculate new SHA-256 values can manufacture a new structurally valid record/digest pair.

To re-establish semantic truth from persisted material, the exact observation content must be supplied again, its observation digest must verify, and LR-S1B.2a must be run again with the exact embedded/bound policy.

A future authenticated provenance/signature layer, if ever required, is a separate security problem and is outside LR-S1B.2b.

## Binding digest

`OptimizerPathPolicyBindingDigest 1.0.0` contains exactly:

```text
{
  contractVersion: "1.0.0",
  algorithm: "sha256",
  value: "<64 lowercase hexadecimal characters>"
}
```

The digest input is domain-separated using:

```text
musicxml-to-guitar-tab-engine
OptimizerPathPolicyBinding
1.0.0
content-digest
1.0.0
```

with NUL separators, followed by a fixed-order canonical binding payload.

The payload binds the stored association including:

- binding identity/version,
- `authority`,
- observation contract version,
- `noteCount`,
- complete observation digest wrapper,
- optimizer identity/version,
- complete embedded path-policy snapshot,
- complete path-policy digest wrapper,
- semantic replay version/status/scope.

Changing a stored observation reference, policy, policy digest, replay scope, or other bound field changes the calculated binding digest or causes binding validation to fail.

Cross-domain observation or path-policy digest wrappers are not accepted as binding digests.

## What the binding digest proves

A matching binding digest proves only deterministic content integrity for the exact supplied binding record under this digest contract.

It can detect a stale digest after a record association changes.

It does not prove:

- digital-signature authenticity,
- producer identity,
- authorization,
- historical run identity,
- timestamp authenticity,
- that an untrusted persisted record was originally created by this helper,
- that semantic replay actually occurred if an attacker can manufacture both a record and a new digest,
- that the observation candidate graph came from a particular MusicXML source,
- source-document authenticity,
- teacher approval,
- privacy/consent/lawful-use status,
- pedagogical superiority,
- learned-model authority.

## Relationship to ObservationAdmission

`ObservationAdmission 1.0.0` remains a separate governance/producer-run metadata boundary. LR-S1B.2b does not modify it and does not treat admission metadata as cryptographic producer authenticity.

LR-S1B.2b binds observation content reference to path-policy content after semantic replay. It does not merge admission persistence, producer/run collision handling, or consent metadata into this contract.

## Authority boundary

LR-S1B.2b remains internal verification/provenance infrastructure with:

```text
authority = "none"
```

It does not:

- modify deterministic optimizer selection,
- modify cost-model semantics or defaults,
- modify candidate generation,
- modify `OptimizerObservation 1.0.0`,
- modify `FingeringPathPolicySnapshot 1.0.0`,
- modify LR-S1B.2a semantic replay,
- modify `CanonicalTabResult 1.0.0`,
- modify normal MusicXML conversion,
- modify writers,
- add a package-root export,
- persist through filesystem/network/storage by itself,
- accept callbacks/plugins/executable models,
- connect learned/shadow ranking to canonical selection,
- grant learned/shadow ranking production authority.

## Compatibility rule

LR-S1B.2b is additive internal infrastructure. Existing public conversion, writer, optimizer, observation, feedback, admission, benchmark, shadow-ranking, and canonical-result contracts remain unchanged.

Any future use of this binding to grant learned ranking influence over canonical output requires a separately reviewed and explicitly approved authority gate. A successful LR-S1B.2b record is not such an authority grant.
