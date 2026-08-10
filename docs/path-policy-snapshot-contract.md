# Fingering Path-Policy Snapshot 1.0.0

## Status

This document defines the internal LR-S1B.1 path-policy snapshot and content-digest boundary.

- Snapshot contract: `FingeringPathPolicySnapshot 1.0.0`
- Digest contract: `1.0.0`
- Digest algorithm: SHA-256
- Implementation: `src/fingering/pathPolicySnapshot.js`
- Regression tests: `tests/pathPolicySnapshot.test.js`
- Package-root public API: unchanged
- `OptimizerObservation 1.0.0`: unchanged
- `CanonicalTabResult 1.0.0`: unchanged
- Production optimizer authority: unchanged

### 2026-08-10 convergence note

LR-S1B.1 remains unchanged. The original text below described LR-S1B.2 as a later gate; that companion work is now merged in two separately versioned contracts:

- LR-S1B.2a — `OptimizerPathPolicyReplay 1.0.0`
- LR-S1B.2b — `OptimizerPathPolicyBinding 1.0.0` + binding digest

LR-S1B.1 still provides only strict policy snapshot/content integrity. Semantic replay and immutable verified association belong to those later companion contracts. None of the three contracts establishes trusted historical producer authenticity or learned production authority.

## Purpose

LR-S1B.1 makes one exact normalized deterministic fingering cost profile representable as a strict immutable internal data record and binds that record to a domain-separated content digest.

This closes only the **policy snapshot/content-integrity** part of the path-policy provenance gap. It does not by itself prove that a particular `OptimizerObservation` was produced under that policy. Observation-to-policy semantic compatibility is addressed separately by merged LR-S1B.2a, and the verified immutable association record is addressed by merged LR-S1B.2b.

## Snapshot shape

```text
FingeringPathPolicySnapshot
├── documentType = FingeringPathPolicySnapshot
├── contractVersion = 1.0.0
└── costProfile
    ├── maximumFret
    ├── fretMovementWeight
    ├── stringMovementWeight
    ├── largeShiftThreshold
    ├── largeShiftWeight
    ├── highFretThreshold
    ├── highFretWeight
    ├── openStringPreferenceWeight
    ├── samePositionPreferenceWeight
    ├── maximumFretMovement
    └── maximumStringMovement
```

The snapshot always records all eleven fields after normalization through the existing deterministic `createFingeringCostProfile()` boundary. Omitted override fields therefore become explicit deterministic default values before the snapshot is returned.

The full profile is bound, not only `maximumFretMovement` and `maximumStringMovement`, because weights and thresholds also express caller path-selection intent.

## Strict input boundary

Snapshot creation and validation fail closed on unsupported or ambiguous JavaScript object shapes.

The boundary rejects:

- proxy objects,
- arrays or non-plain objects,
- unknown fields,
- symbol properties,
- non-enumerable fields,
- accessor-backed fields,
- invalid cost-profile numbers,
- negative values where the existing cost contract forbids them,
- non-finite values such as `NaN` or `Infinity`,
- invalid movement caps,
- incompatible thresholds/fret ranges,
- negative zero numeric values.

Negative zero is rejected because JSON serialization represents `-0` as `0`; accepting both would allow two distinguishable JavaScript numeric values to share one serialized digest representation.

The snapshot returned by the producer is deeply frozen for its complete current two-level data shape.

## Digest contract

The digest record contains exactly:

```text
{
  contractVersion: "1.0.0",
  algorithm: "sha256",
  value: "<64 lowercase hexadecimal characters>"
}
```

The hash input is domain separated by engine name, snapshot contract identity/version, the `content-digest` purpose label, and digest contract version. The normalized snapshot payload is reconstructed in one fixed field order before JSON serialization and hashing.

The digest provides deterministic content integrity for the exact normalized path-policy snapshot. A stale or mismatched digest fails closed.

The digest does **not** provide a digital signature, producer authentication, authorization, timestamp authenticity, run identity, or historical execution proof.

## Authority boundary

LR-S1B.1 does not:

- modify `OptimizerObservation 1.0.0`,
- add a cost-profile field to an observation,
- modify `CanonicalTabResult 1.0.0`,
- change the deterministic optimizer or cost model,
- change candidate generation,
- change normal MusicXML conversion,
- change writers,
- add a package-root export,
- connect shadow ranking to canonical selection,
- give a learned/shadow path production authority.

The current LR-S0/LR-S1A `authority: "none"` boundary remains unchanged.

## Relationship to LR-S1B.2a and LR-S1B.2b

Merged LR-S1B.2a binds a validated observation/digest to an exact LR-S1B.1 policy snapshot/digest for deterministic semantic replay. It verifies, among other things:

- exact valid observation digest;
- exact valid policy snapshot/digest;
- current deterministic optimizer identity/version;
- `maximumFret` agreement;
- hard movement-limit compatibility;
- replay of the observed candidate layers under the bound policy;
- exact selected path/cost compatibility.

Merged LR-S1B.2b creates an immutable `OptimizerPathPolicyBinding` record and domain-separated binding digest only after LR-S1B.2a succeeds.

Even together, these contracts do not prove historical producer authenticity. Different policies can sometimes produce the same path on a particular input, and content digests are not signatures. Cryptographic trusted-producer/run authenticity remains a distinct future security problem.

## Compatibility rule

LR-S1B.1 is additive internal infrastructure. Existing observation, feedback, admission, benchmark, shadow-ranking, canonical-result, writer, conversion and package-root contracts remain unchanged.

Any future change that gives learned ranking authority over canonical output requires separately approved data-governance, evaluation, shadow-first and production opt-in gates beyond the current LR-S1B integrity foundations.
