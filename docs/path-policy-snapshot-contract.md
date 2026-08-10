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

## Purpose

LR-S1B.1 makes one exact normalized deterministic fingering cost profile representable as a strict immutable internal data record and binds that record to a domain-separated content digest.

This closes only the **policy snapshot/content-integrity** part of the path-policy provenance gap. It does not yet prove that a particular `OptimizerObservation` was produced under that policy. Observation-to-policy semantic binding remains LR-S1B.2.

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

## Relationship to LR-S1B.2

LR-S1B.2 is a separate security gate. Its intended responsibility is to bind a validated `OptimizerObservationDigest` to an exact LR-S1B.1 path-policy snapshot/digest and then perform deterministic semantic replay checks over the observation candidate layers.

At minimum, that later gate must verify that:

- the observation digest is exact and valid,
- optimizer identity/version is explicitly bound,
- the complete path-policy snapshot/digest is exact and valid,
- the deterministic optimizer reproduces the observed selected path under the bound policy,
- selected cost records are compatible with recomputation under that policy,
- hard movement limits are satisfied by the bound path.

Even successful semantic replay does not by itself prove historical producer authenticity. Different policies can sometimes produce the same path on a particular input. Cryptographic producer/run authenticity therefore remains a distinct later security problem.

## Compatibility rule

LR-S1B.1 is additive internal infrastructure. Existing observation, feedback, admission, benchmark, shadow-ranking, canonical-result, writer, conversion, and package-root contracts remain unchanged.

Any future change that gives learned ranking authority over canonical output requires separately approved gates beyond LR-S1B.1 and LR-S1B.2.
