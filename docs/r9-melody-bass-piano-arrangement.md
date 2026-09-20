# R9 Melody/Bass Piano Arrangement

Status: local implementation and real-corpus verification complete; protected CI and merge evidence pending.

Implementation branch: `r9/melody-bass-arrangement-implementation`

Reviewed implementation evidence commit: `8a6d4b1c05f0920a1535a91b0f6a19a801ac6627`

## Goal and boundary

R9 makes dense piano MusicXML produce a useful, editable guitar-TAB starting point instead of ending at a recoverable physical-selection block. It does not claim that arbitrary piano notation can be transferred to guitar without musical judgment. The output is deliberately `REVIEW_REQUIRED`, non-canonical and non-exportable until teacher edits and the normal validation path succeed.

The immutable source MusicXML remains authoritative. The arrangement artifact records which source notes were assigned, which were left for review, why each decision was made, and which bounded attempts were tried.

## Deterministic policy

`MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0` tries retained-note caps in the fixed order `6, 5, 4, 3, 2, 1`.

For each attack it:

1. preserves valid teacher-forced string/fret assignments;
2. retains the melody and bass anchors where capacity permits;
3. adds playable inner voices deterministically;
4. keeps complete supported tie chains together;
5. reduces duplicate target pitches and excess voices with explicit reason codes;
6. reruns the existing physical selector and provisional MusicXML writer;
7. records the outcome before trying the next smaller cap.

The cap-one fallback also checks sustained overlap, so it is monophonic over time rather than merely selecting one note at each onset.

## Contracts and presentation

- `PartialGuitarTabArrangement 1.1.0` carries policy and attempt evidence.
- `ReviewEditableTabProjection 1.1.0` preserves source-note identity and eligible editing state.
- Stage 09 audit contract `1.3.0` records artifact document type, version and arrangement policy.
- The existing same-page Workbench shows melody, bass, inner-voice, teacher-assignment, capacity and duplicate-pitch explanations.
- Teacher edits replay from immutable source bytes and rerun the bounded production path; the browser never becomes semantic authority.

## Real-corpus evidence

The pinned eleven-file AnimeTAB corpus at commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a` was executed twice locally. The audit JSON outputs were byte-identical.

| Measure | R8 baseline | R9 candidate |
|---|---:|---:|
| Source files with provisional TAB | 11/11 | 11/11 |
| Hard blocks | 0 | 0 |
| Source notes | 6,631 | 6,631 |
| Assigned notes | 2,794 | 2,801 |
| Explicit unassigned notes | 3,837 | 3,830 |
| Assigned coverage | 42.13% | 42.24% |

Nine files retain exactly the R8 assigned-note count. `[CLANNAD]汐.xml` increases from 89 to 90 assigned notes and `[Fate Stay Night]光.xml` increases from 580 to 586. No audited file regresses.

The CLI corpus audit reports teacher-editability as `0/11` because that audit runner does not instantiate a Stage 06 review-editor session adapter. This is a product-evidence gap, not a TAB-generation block; browser/adapter capability is tested separately. Tier-B still requires authentic teacher-correction evidence.

## Local verification

- `npm test`: 1,674 passed, 0 failed, 0 skipped after rebasing onto A3-enabled `main` at `be7b77e7cc26669559b0da3965604a9484f50986`.
- Focused R9 policy, candidate-limit and sustained-complexity recovery, artifact, R8 edit, runtime-host, Workbench and A3 integration tests: 65 passed, 0 failed.
- `alphaTabMusicXmlSmoke.mjs`: passed with alphaTab `1.8.4`.
- `alphaTabV2MusicXmlSmoke.mjs`: passed with `CanonicalTabResult 2.0.0` and rendered SVG fragments.
- `alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs` and `alphaTabRuntimeHostPolyV2E2e.mjs`: not executed locally because `puppeteer-core` is absent from this environment. These are not counted as local passes and remain required in protected CI.
- Two post-review Stage 09 runs produced byte-identical audit JSON with contract `1.3.0`, 11 deterministic files, 11 immutable sources, 11 valid output artifacts, 2,801 assigned notes, zero POLY-to-MONO downgrade and zero hard blocks.
- A3 candidate pre-count integration is covered explicitly: `GUITAR_VOICING_CANDIDATE_LIMIT_EXCEEDED` remains a bounded R9 retry reason, so a successfully recovered provisional artifact cannot be hidden by the capability validator.
- Sustained physical-search complexity uses the same fail-closed evidence rule: `SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW` is accepted only as a recorded rejected retry before a smaller cap is physically selected.

An independent read-only review found and caused two pre-PR corrections: incomplete ordinary tie chains now trigger deterministic re-ranking of every affected onset, and the `1.1.0` capability validator now recomputes disposition counts/coverage and validates exact reason, source-identity and retry-prefix evidence.

## Acceptance and remaining gate

Local acceptance requires deterministic artifact identity, immutable source bytes, no POLY-to-MONO routing downgrade, valid R9 reason/attempt evidence, renderer-visible TAB for all eleven pinned scores, and no per-file regression against R8. These conditions pass locally.

The remaining release step is protected CI on the exact pull-request head. Merge must not be represented as complete until required checks and branch policy permit it.
