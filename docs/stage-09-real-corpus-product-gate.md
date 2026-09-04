# Stage 09 — Real OMR/MusicXML Corpus + Product Gate

Status: ⚠️ IN PROGRESS — Tier A minimum verified; authentic teacher-correction Tier B remains an evidence gap.

## Goal

Stage 09 validates the already-approved Stage 08 production path with authentic external evidence. It is not a new TAB engine and must not widen solver or music semantics merely to improve corpus outcomes.

Target chain:

```text
real OMR / MusicXML
  → REVIEW_REQUIRED when evidence-backed repair is needed
  → teacher correction
  → saved correction revision
  → REVALIDATED_REVISION + VALID
  → trusted Stage 08 materialization
  → existing production parse / route
  → POLY_V2 for true polyphony
  → existing physical feasibility / solver
  → CanonicalTabResult
  → writer output
  → Stage08RevalidationTabEvidence
  → approved canonical revision
```

## Tier A — authentic external MusicXML

Stage 09 now has **20 unique verified real MusicXML identities**, meeting the stage minimum.

The first evidence set is `verification/guitar-tech-real-corpus-manifest.json`: nine historical external MusicXML SHA-256 identities verified by the reviewed PROD-TECH-03 audit. Repeated audits of those same nine identities do not increase the unique count.

The second evidence set is `verification/stage09-additional-real-musicxml-corpus.json`: eleven additional files pinned to `amamiya-yuuko/AnimeTAB` commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a`. GitHub Actions workflow run `33920454602`, job `101177320360`, audited all eleven through `processMusicXmlUpload()` twice. The produced artifact `stage09-additional-real-corpus-audit` has digest `sha256:5ade371f3822d71122b62f478f35b70902bc99ffda0350e8b0ec4a7b87710806`.

The reviewed audit is pinned at `verification/stage09-additional-real-corpus-reviewed-audit.json`. Its results are:

- 11/11 exact source identities verified;
- 11/11 deterministic two-run results;
- 11/11 source-byte immutability;
- 11/11 require `POLY_V2`;
- 0 true-polyphony → `MONO_V1` downgrades;
- 11/11 output semantics valid for their bounded outcomes.

The audited PR head `540821912e4af58a6d2adec68092799cd778e0c2` and the protected-main squash merge `1303c4ad1ad5dcd856dab1d7de0ace97ed8da43e` have the identical tree SHA `cd52150b592f1cb92cfa2a5232e6855f958e8789`. The audit therefore measures the exact merged production tree.

Current Tier A: **20 / 20 minimum verified**. The product-gate script rejects evidence-set overlap instead of allowing duplicate identities to inflate this count.

## Tier B — authentic OMR → teacher correction → Stage 08

Tier B requires real teacher-correction provenance. A counted case must carry exact original/corrected fingerprints, saved and revalidated revision identity, a non-empty patch ledger, `VALID` revalidation, two-run deterministic Stage 08 evidence, source immutability and a bounded Stage 08 outcome.

For a Tier B `PASS`, evidence must additionally prove canonical approval authority and a writer-output SHA. `REVIEW_REQUIRED` and `BLOCKED` cases must carry no canonical approval or writer output.

A cross-repository evidence audit found two teacher-verified references, recorded in `verification/stage09-teacher-correction-evidence-candidates.json`:

1. `seslitab-plan0-owner-approved-3-8` — authentic teacher-approved Audiveris 5.11.0 OMR provenance exists, but the approved projection records **0 correction-needed events**. There is no non-empty teacher patch ledger, so it is `INELIGIBLE_NO_CORRECTION_NEEDED` for Stage 09 Tier B.
2. `seslitab-plan0-cc0-4measure` — source PDF and expected MusicXML are teacher-verified, but there is no accepted successful OMR artifact/correction chain that can be revalidated through Stage 08. It is `INELIGIBLE_NO_APPROVED_OMR_CORRECTION_CHAIN`.

Seven additional real-OMR MusicXML regression outputs in SesliTab remain excluded because source/licence/teacher ground-truth evidence is incomplete. Synthetic Stage 08 fixtures also remain test-only evidence.

Current Tier B: **0 / 3 minimum eligible correction cases**.

## Product gate thresholds

`Stage09RealCorpusProductGateManifest 1.0.0` requires:

- at least 20 unique authentic verified MusicXML identities, target ceiling 50;
- at least 3 authentic teacher-correction cases;
- Stage 08 outcome coverage for `PASS`, `REVIEW_REQUIRED` and `BLOCKED`;
- correction-corpus coverage for voice 2, voice 3/4, chord, tie, staff, duration/onset and difficult guitar-position cases;
- exact identity verification, two-run determinism and source-byte immutability;
- Stage 08 canonical/writer evidence for every counted `PASS` correction case.

The gate reports `PASS_PRODUCT_GATE` only when every requirement is satisfied. Missing authentic evidence reports `HOLD_EVIDENCE_GAP`; malformed, overlapping or contradictory evidence reports `FAIL_INVALID_EVIDENCE`.

## Current evidence result

- unique real MusicXML: **20 / 20 minimum**;
- verified real MusicXML: **20 / 20**;
- real teacher-correction cases: **0 / 3 minimum**;
- real Stage 08 correction status coverage: **none yet**;
- required real correction representation coverage: **not yet demonstrated**.

Therefore **Stage 09 is not COMPLETE**. The remaining blocker is authentic teacher-correction evidence, not Tier-A corpus size and not missing product-gate code.

## Safety invariants

Corpus work must not:

- mutate original source bytes or source musical facts;
- use filename, SHA, composer or corpus identity as a production dispatch key;
- silently route true polyphonic corrected material to `MONO_V1`;
- treat `REVALIDATED_REVISION + VALID`, a UI event or editor state as canonical approval;
- invent missing pitch, onset, duration, voice, staff, tie or chord semantics;
- change solver ranking, cost, tie-break or physical rules to make a corpus case pass;
- raise fixed resource ceilings as a corpus workaround;
- count synthetic, no-correction or regression-only fixtures as real correction evidence.

A legitimate `BLOCKED` result is evidence about the current product boundary, not a test failure that justifies weakening the boundary.

## Verification files

- `verification/stage09-real-corpus-product-gate-manifest.json`
- `verification/guitar-tech-real-corpus-manifest.json`
- `verification/stage09-additional-real-musicxml-corpus.json`
- `verification/stage09-additional-real-corpus-reviewed-audit.json`
- `verification/stage09-real-teacher-correction-corpus.json`
- `verification/stage09-teacher-correction-evidence-candidates.json`
- `scripts/stage09-real-corpus-product-gate.js`
- `scripts/stage09-teacher-correction-evidence-intake.js`
- `tests/stage09RealCorpusProductGate.test.js`
- `tests/stage09TeacherCorrectionEvidenceIntake.test.js`

The next Stage 09 work is exclusively genuine Tier-B evidence acquisition: obtain at least three authentic OMR cases where a teacher actually makes non-empty corrections, preserve exact original/corrected/revision provenance, and run them twice through Stage 08 to obtain `PASS`, `REVIEW_REQUIRED` and `BLOCKED` plus the required representation coverage.
