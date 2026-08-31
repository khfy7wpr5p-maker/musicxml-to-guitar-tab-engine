# Guitar technique real-corpus production gate

> **HISTORY / SUPERSEDED CURRENT STATUS**  
> This file records the PROD-TECH-02/03 prerequisite gate at production runtime SHA `f4ecc51bd110b5e80ff7dd47e709b164ac34e78d`. Its `0/9 POLY_V2 PASS` corpus totals and named first blockers are historical evidence, not the current production compatibility state. Later generic compatibility/sustain changes through PR #261 supersede those blocker observations. The gate methodology below remains authoritative as a pattern. For live state use [`current-status.md`](current-status.md).

## Historical status

Prerequisite state at the audited revision: `PASS`.

The exact nine-file Guitar Pro 7.6.0 corpus was re-executed against production runtime SHA `f4ecc51bd110b5e80ff7dd47e709b164ac34e78d`. This gate was intentionally separate from production runtime behavior and did not change parsing, projection, candidate generation, solver state, ranking, or physical semantics.

## Why this gate pattern remains mandatory

Focused fixtures and CI prove bounded contracts, but they cannot replace producer-realistic compatibility evidence. A production change can remove one strict blocker and reveal another. The exact new blocker must be measured rather than guessed.

A historical audit is evidence only. It is never treated as a fresh run for a later production SHA.

## Corpus identity

`verification/guitar-tech-real-corpus-manifest.json` pins the external source files by exact file name and SHA-256. The source MusicXML files remain external and are not committed.

A gate runner must reject a missing/partial corpus, unexpected score files, SHA mismatch, or duplicate/invalid manifest identities. This prevents silent corpus substitution.

## Required evidence contract

Each intended source is passed through the production entrypoint repeatedly under one audited engine revision. The gate verifies:

1. exact source SHA-256 identity;
2. deterministic equality of complete public runtime results;
3. input byte SHA-256 unchanged before and after runtime calls;
4. route/status and exact public blocker code/feature;
5. final public-result SHA-256;
6. CanonicalTabResult SHA-256 when a file reaches PASS;
7. reviewed diff against the retained prior blocker baseline.

Any nondeterminism or input-byte mutation is a hard failure.

A changed blocker is not auto-approved. It must be classified from its semantics before a stage gate is marked PASS. Public-entrypoint metrics must not invent internal `projectorReached`/`solverReached` facts that are not observable. Candidate/ranking invariance likewise requires its own internal evidence rather than inference from a public result.

## Historical reviewed audit

Reviewed report: `verification/guitar-tech-real-corpus-reviewed-audit-f4ecc51.json`.

Reviewed report SHA-256: `71727f159542b9699fd117fbb6e2c93fa7b0754abffbf968d5b03239d6e7bacc`.

Results at that historical revision:

- corpus identity: 9/9 verified;
- deterministic two-run execution: 9/9;
- source-byte immutability: 9/9;
- XML safety accepted: 8/9;
- POLY route reached: 8/9;
- POLY_V2 PASS: 0/9;
- changed blockers requiring review: 2.

Those blocker observations were later superseded by subsequent generic production compatibility work. They must not be copied into current-status documents.

## Current reusable rule

Real corpus is a verification layer, never a dispatch layer:

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

A current production gate should verify source identity/immutability, deterministic public/canonical/MusicXML output when applicable, absence of hidden semantic mutation, expected fail-closed behavior, and required CI green on the exact audited runtime revision.
