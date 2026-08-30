# Guitar technique real-corpus production gate

## Status

Current prerequisite state: `PASS`.

The exact nine-file Guitar Pro 7.6.0 corpus was freshly re-executed against production runtime SHA `f4ecc51bd110b5e80ff7dd47e709b164ac34e78d`. `PROD-TECH-03` may proceed only while the expected base is that audited SHA or a verification-only descendant whose `src`, `package.json`, and `package-lock.json` runtime tree is equivalent under `scripts/check-guitar-tech-stage-gate.js`.

This gate is intentionally separate from production runtime behavior. It does not change parsing, projection, candidate generation, solver state, ranking, or physical semantics.

## Why this is mandatory

Focused fixtures and CI prove bounded contracts, but they cannot replace producer-realistic compatibility evidence. A production technique change can remove one strict blocker and reveal another. The exact new blocker must be measured rather than guessed.

The historical audit remains evidence only. It is never treated as a fresh run for a later production SHA.

## Corpus identity

`verification/guitar-tech-real-corpus-manifest.json` pins all nine external source files by exact file name and SHA-256. The source MusicXML files remain external and are not committed.

The runner rejects:

- a missing corpus directory;
- any missing required XML file;
- any unexpected XML/MusicXML file in the supplied corpus directory;
- a SHA-256 mismatch;
- duplicate/invalid manifest identities.

This prevents silent corpus substitution or partial validation.

## Required execution

Run from a checkout containing the production SHA to be audited:

```bash
node scripts/guitar-tech-real-corpus-gate.js \
  /absolute/path/to/exact-nine-file-corpus \
  /tmp/guitar-tech-real-corpus-report.json \
  --engine-commit=<40-char-production-sha>
```

Each source is passed through `processMusicXmlUpload()` exactly twice. The runner verifies:

1. exact source SHA-256 identity;
2. deterministic equality of the two complete public runtime results;
3. input byte SHA-256 before and after each runtime call;
4. route/status and exact public blocker code/feature;
5. final public-result SHA-256;
6. CanonicalTabResult SHA-256 when a file reaches PASS;
7. diff against the retained historical blocker baseline.

Any nondeterminism or input-byte mutation is a hard failure.

A changed blocker is not auto-approved. The runner returns `HOLD_BLOCKER_DIFF_REVIEW_REQUIRED` so the newly exposed exact blocker can be classified as `ACCIDENTAL_BLOCKED`, `LEGITIMATE_BLOCKED`, or `UNKNOWN_NEEDS_REVIEW` before the stage gate is marked PASS.

## Observable metrics

The public upload entrypoint directly supports these corpus metrics:

- XML safety accepted count;
- POLY route reached count;
- POLY_V2 PASS count;
- BLOCKED count;
- exact blocker code/feature per file;
- two-run deterministic count;
- source-byte immutability count;
- public result and canonical-result fingerprints.

`projectorReached` and `solverReached` are deliberately reported as `NOT_OBSERVABLE_WITH_PUBLIC_ENTRYPOINT` by this gate rather than inferred from error ordering. If exact internal reach metrics become necessary, they require a separately reviewed trace/instrumentation contract; this gate does not widen production architecture to obtain them.

Candidate-set and ranking invariance are likewise not fabricated from the public result. LAB-TECH-04 remains the verified internal metadata-only candidate/ranking invariance evidence. On real corpus files that reach PASS, the gate fingerprints the final CanonicalTabResult so selected physical output drift is observable.

## Stage approval

A generated report alone does not unlock the next stage when blocker drift exists. After review, a dedicated verification change must update `verification/guitar-tech-real-corpus-state.json` with:

- `status: PASS`;
- `prodTech03MergeAllowed: true`;
- exact `auditedMainSha`;
- exact SHA-256 of the reviewed report;
- `corpusIdentityVerified: true`;
- `twoRunDeterminismVerified: true`;
- `sourceByteImmutabilityVerified: true`;
- `blockerDiffReviewed: true`.

`node scripts/check-guitar-tech-stage-gate.js PROD-TECH-03 <expected-base-sha>` then must return exit code 0.

The required Node test suite also checks the gate automatically for branches named `stage/prod-tech-03-*`. A later change to `src`, `package.json`, or `package-lock.json` makes the audit stale unless a fresh corpus audit is performed.

## Reviewed audit

Reviewed report: `verification/guitar-tech-real-corpus-reviewed-audit-f4ecc51.json`.

Reviewed report SHA-256: `71727f159542b9699fd117fbb6e2c93fa7b0754abffbf968d5b03239d6e7bacc`.

Fresh results:

- corpus identity: 9/9 verified;
- deterministic two-run execution: 9/9;
- source-byte immutability: 9/9;
- XML safety accepted: 8/9;
- POLY route reached: 8/9;
- POLY_V2 PASS: 0/9;
- changed blockers requiring review: 2.

The two changed blockers were reviewed as non-regressions:

1. `[Air]鸟之诗.xml`: the former hammer-on blocker is cleared and the next visible blocker is grace-note `<notehead>normal</notehead>`. This is classified `ACCIDENTAL_BLOCKED` display metadata and is tracked as separate compatibility work; it is not bundled into `PROD-TECH-03`.
2. `[Angel Beats!]Brave Song.xml`: the next visible blocker is `note/notations/technical/down-bow`. This remains `UNKNOWN_NEEDS_REVIEW` and fail-closed because no authorized Guitar Pro guitar-semantic mapping exists.

## Current decision

The real-corpus prerequisite for `PROD-TECH-03` is `PASS`. No runtime regression was detected by the audit. The gate remains fail-closed for any later runtime-tree drift, and the two newly exposed blockers remain separate from `PROD-TECH-03` scope.
