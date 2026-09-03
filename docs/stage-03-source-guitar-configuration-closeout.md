# Stage 03 Source Guitar Configuration Closeout

Date: 2026-09-01
Production baseline: `main@62b14efc1e9a56d35fa3bccc34400213c5e68f23`

This document records the production-reality boundary reached by the Stage 03 source guitar configuration work. It is a live closeout note, not permission to weaken unrelated fail-closed semantics.

## Production behavior

The application upload runtime can consume explicit MusicXML guitar configuration evidence when the declaration is structurally complete and physically valid.

A complete executable tuning declaration requires:

- exactly six `staff-tuning` entries covering lines 1..6 once each;
- valid step / optional alter / octave scalars;
- six-string physical ordering within the bounded adjacent-open-string interval rule;
- at most one capo;
- a configuration representable by the immutable guitar configuration model.

The resulting configuration is source configuration evidence and is threaded through the bounded application/internal conversion path. Source MusicXML bytes and source musical facts remain immutable.

## Immutable solve scope

The first executable guitar configuration must be established before the immutable solve scope begins.

For provenance extraction, solve scope has begun when either:

- the declaration first appears after measure index 0; or
- a `note`, `backup`, or `forward` has already appeared earlier in the first measure.

A genuine tuning or capo change after solve start remains fail-closed. Identical restatement does not create new configuration authority. Capo-only restatement requires a prior complete configuration on the same staff and must resolve to the same effective configuration if it is to remain a restatement rather than a change.

## Legacy TAB presentation compatibility

Some historical producer exports carry `staff-tuning` as TAB presentation provenance rather than executable physical tuning authority. Production retains a deliberately narrow compatibility fallback for exactly two parser-error shapes:

- one well-formed partial legacy TAB tuning declaration with no capo; or
- one well-formed complete legacy TAB tuning declaration whose line order is the physically reversed presentation order observed in the reviewed Guitar Pro compatibility profile.

This fallback is admitted only when all of the following are true:

- the parser error is `INVALID_GUITAR_CONFIGURATION_PROVENANCE` with the exact admitted legacy error message;
- the parser error identifies a valid exact part / first-measure / attributes / staff-details location;
- the exact staff has a TAB clef;
- the legacy shape at that exact error location is structurally proven;
- no `note`, `backup`, or `forward` precedes the declaration in measure 0;
- the entire document contains exactly one compatible presentation block;
- the shape has no executable capo authority and no conflicting configuration evidence.

When admitted, the block is classified as `TAB_PRESENTATION_PROVENANCE_ONLY` and the application uses `STANDARD_DEFAULT`. The legacy block does not become executable tuning authority.

A lone legacy tuning declaration after solve start remains fail-closed. This boundary was added by production PR #303 after the post-merge P1 review on PR #299.

## Regression history

Verification PR #298 exposed one exact compatibility regression: `COMPAT-01C Guitar Pro export-profile provenance follows MONO guitar register semantics without trusting source TAB fingering`. The reviewed fixture encodes Standard tuning in a complete legacy TAB presentation order. PR #299 restored this bounded pre-solve compatibility.

The post-merge review of PR #299 found that a single legacy block first appearing after solve start could still be downgraded to Standard. PR #303 fixed that boundary by anchoring the fallback to the exact parser error location and rejecting after-scope declarations.

The production fix changes only the upload-runtime compatibility gate and its regressions. It does not change solver ranking/cost/tie-break, PA-6 policy, physical-feasibility rules, resource ceilings, source mutation rules, or public package-root authority.

## Verification evidence

For PR #303:

- exact COMPAT-01C regression: PASS;
- reversed legacy TAB declaration after solve start: fail-closed regression PASS;
- partial legacy TAB declaration after timing starts in measure 0: fail-closed regression PASS;
- focused configuration/runtime/compatibility suites: PASS;
- full repository tests: PASS;
- protected Tests workflow: Node 18 / 20 / 22 PASS;
- MusicXML Compatibility workflow: PASS, including alphaTab import/SVG/browser paths;
- Runtime Staging E2E: PASS.

The audited candidate commit was `8e2bf4114ed092b8877a2139c2695b956471e866`. Its tree SHA was `03e0de47aa4ca444bb412e832b7bb231a9a8dd9b`. The production squash merge `62b14efc1e9a56d35fa3bccc34400213c5e68f23` has the same tree SHA, so the audited behavior is byte-identical at the repository-tree level.

## Exact nine-file Stage 03 corpus audit

A separate verification-only Stage 03 audit used nine exact SHA-selected files from `amamiya-yuuko/AnimeTAB` pinned at source commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a`.

The audit established:

- 9/9 source SHA identities verified;
- 9/9 deterministic repeated processing;
- 9/9 source byte immutability;
- duplicate audit reports byte-identical;
- direct pre-fix production main versus candidate comparison: `PRESERVED_CLASSIFICATIONS=9/9`.

This Stage 03 audit is additional verification evidence. It does **not** replace `verification/guitar-tech-real-corpus-manifest.json`, which pins a different historical Guitar Pro evidence corpus and must not be silently repurposed.

## Current limitation and next architectural direction

Stage 03 deliberately preserves many semantic/physical `BLOCKED` outcomes. It does not itself implement the broader product goal of converting repairable or local OMR problems into `REVIEW_REQUIRED` or partial usable output.

That later work must preserve the distinction between:

- representation-only compatibility that can be proven safely;
- repairable score/OMR uncertainty suitable for review;
- genuine configuration ambiguity or unsafe semantic/physical state that still requires fail-closed handling.
