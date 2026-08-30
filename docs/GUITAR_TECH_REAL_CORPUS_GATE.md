# Guitar technique real-corpus production gate

## Status

Current prerequisite state: `HOLD_REAL_CORPUS_REEXECUTION_REQUIRED`.

`PROD-TECH-03` must not be merged until the committed gate state is changed to `PASS` by a fresh, reviewed audit of the exact nine-file Guitar Pro 7.6.0 corpus.

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

The required Node test suite also checks the gate automatically for branches named `stage/prod-tech-03-*`. While the committed state is HOLD, such a branch cannot obtain green required Node checks.

## Current decision

The gate infrastructure itself may be merged because it changes verification policy only. The current gate state deliberately remains HOLD until the exact external corpus is re-executed as runtime bytes. Therefore `PROD-TECH-03` is not authorized by this infrastructure merge alone.
