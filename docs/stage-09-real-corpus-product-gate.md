# Stage 09 — Real OMR/MusicXML Corpus + Product Gate

Status: ⚠️ IN PROGRESS — evidence gate implemented; authentic corpus requirements are not yet satisfied.

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

## Evidence tiers

### Tier A — authentic external MusicXML

The existing `verification/guitar-tech-real-corpus-manifest.json` pins nine real external MusicXML identities by SHA-256. The reviewed Stage 03 audit reuses those same identities, so it is revalidation evidence, not nine additional unique scores.

Current unique Tier A count: **9**.

Stage 09 target: **20–50 unique real MusicXML cases**. Repeated runs or repeated audits of the same SHA do not increase this count.

### Tier B — authentic OMR → teacher correction → Stage 08

Tier B requires real teacher-correction provenance. A counted case must carry exact original/corrected fingerprints, saved and revalidated revision identity, a non-empty patch ledger, `VALID` revalidation, two-run deterministic Stage 08 evidence, source immutability and a bounded Stage 08 outcome.

For a Tier B `PASS`, evidence must additionally prove canonical approval authority and a writer-output SHA. `REVIEW_REQUIRED` and `BLOCKED` cases must carry no canonical approval or writer output.

Synthetic Stage 08 fixtures are unit-test evidence only and **never** count as real Tier B corpus.

Current authentic Tier B count: **0**.

## Product gate thresholds

The committed `Stage09RealCorpusProductGateManifest 1.0.0` requires:

- at least 20 unique authentic MusicXML identities, with a target ceiling of 50 for this stage;
- at least 3 authentic teacher-correction cases;
- authentic Stage 08 outcome coverage for `PASS`, `REVIEW_REQUIRED` and `BLOCKED`;
- correction-corpus representation coverage for voice 2, voice 3/4, chord, tie, staff, duration/onset and difficult guitar-position cases;
- exact identity verification, two-run determinism and source-byte immutability;
- Stage 08 canonical/writer evidence for every counted `PASS` correction case.

The gate reports `PASS_PRODUCT_GATE` only when every requirement is satisfied. Missing authentic evidence reports `HOLD_EVIDENCE_GAP`; malformed or contradictory evidence reports `FAIL_INVALID_EVIDENCE`.

## Current evidence result

Repository evidence currently resolves to:

- unique real MusicXML: **9 / 20 minimum**;
- reviewed/verified real MusicXML identities: **9 / 9 available**;
- real teacher-correction cases: **0 / 3 minimum**;
- Stage 08 real correction status coverage: **none yet**;
- required real correction representation coverage: **not yet demonstrated**.

Therefore **Stage 09 is not COMPLETE** and product readiness must not be claimed from synthetic tests.

## Safety invariants

Corpus work must not:

- mutate original source bytes or source musical facts;
- use filename, SHA, composer or corpus identity as a production dispatch key;
- silently route true polyphonic corrected material to `MONO_V1`;
- treat `REVALIDATED_REVISION + VALID`, a UI event or editor state as canonical approval;
- invent missing pitch, onset, duration, voice, staff, tie or chord semantics;
- change solver ranking, cost, tie-break or physical rules to make a corpus case pass;
- raise fixed resource ceilings as a corpus workaround;
- count synthetic fixtures as real product evidence.

A legitimate `BLOCKED` result is evidence about the current product boundary, not a test failure that justifies weakening the boundary.

## Implemented verification files

- `verification/stage09-real-corpus-product-gate-manifest.json`
- `verification/stage09-real-teacher-correction-corpus.json`
- `scripts/stage09-real-corpus-product-gate.js`
- `tests/stage09RealCorpusProductGate.test.js`

The next Stage 09 work is evidence acquisition: add at least eleven additional unique authentic MusicXML cases and at least three authentic teacher-correction cases with the required status/representation coverage, then run them through the existing production path and record exact audited outcomes.
