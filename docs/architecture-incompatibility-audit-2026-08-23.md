# Architecture Incompatibility Audit — 2026-08-23

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-23 -->

Architecture convergence base: `200d55ebc4863471c8c50b59e9ba6a6115806dd6` (merged PR #136).

## Scope

This audit compares the executable repository state on the convergence base against the active architecture/status documentation. Historical versioned contracts, closure records, and sealed scientific evidence remain immutable historical records and are not rewritten by the convergence work.

## Findings before convergence

1. `README.md` still described PA-7 as the latest merged polyphonic capability and PA-8 as the next gate, although PA-8 and PA-9 are merged internal capabilities.
2. `AI_CONTEXT.md`, `docs/current-status.md`, and `docs/package-status.md` still described PA-10.3 as not started, although PA-10.3, PA-10.4, and PA-10.5 are merged documentation/contract slices.
3. `docs/ARCHITECTURE.md` and `docs/polyphonic-guitar-arrangement-foundation.md` retained older PA-7/PA-8 planning state and did not reflect the merged PA-11 evaluation chain through PA-11.4A.
4. `docs/musicxml-compatibility.md` retained an older compatibility-run snapshot and did not identify PR #136 Tests #764 / MusicXML Compatibility #533 as the latest verified adapter-parity evidence.
5. The executable package boundary remained internally consistent: `src/index.js` exposes only the approved public monophonic API; PA-8/PA-9, PA-11 evaluation modules, and the GuitarSet v2 adapter remain internal.
6. No evidence was found that PR #136 granted shadow execution, runtime connection, optimizer/canonical/TAB influence, live/user input, or production authority.

## Runtime compatibility verdict

The detected incompatibility is documentation-to-runtime architectural drift, not a demonstrated deterministic-core or package-root authority incompatibility.

The convergence must preserve:

- public `CanonicalTabResult 1.0.0` authority for the supported monophonic path;
- public package API exactness;
- fail-closed public polyphonic boundary;
- PA-8/PA-9 internal-only status;
- PA-10.3–PA-10.5 as merged design/contract evidence, not runtime CanonicalTabResult 2.0 implementation;
- PA-11 evaluation-only authority through PA-11.4A;
- `GUITARSET-OBSERVED-VOICING-MODEL.v2` as an isolated offline/parity adapter only;
- `fret20QualityAuthority=false` because positive observed GuitarSet gold remains 0..19;
- `runtime connection: false`;
- `production: false`.

## Next gate after convergence

`GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`

This is a fixture-only, controlled, non-authoritative evidence gate. It does not authorize live/user input, package-root exposure, runtime wiring, authoritative optimization/TAB influence, checkpoint mutation, or production.
