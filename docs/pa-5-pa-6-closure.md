# PA-5 + PA-6 Closure and Documentation Convergence

Date: 2026-08-13

This document closes the documentation gap that existed after PA-5 merged and records the verified PA-6 runtime closure baseline. It does not create a public polyphonic conversion API and does not authorize PA-7.

## Authoritative runtime line

- branch: `main`
- PA-5 merged runtime SHA: `c9cc504558630b48e34c1fb0e0753963b24d181e`
- PA-6 merged runtime SHA: `f4055e42d2cd364060e7d99a4efc2add3d8817bd`
- latest merged runtime-changing PR: #90 — PA-6 internal `DeterministicReductionPlan 1.0.0`
- package-root public monophonic conversion API: unchanged
- `CanonicalTabResult 1.0.0`: unchanged

## PA-5 closure

PA-5 adds internal deterministic source-score voice/register analysis only.

Verified evidence:

- PR #89 — `feat(PA-5): add deterministic melody bass voice analysis`
- final PR head: `c44758274778d81b226186ac363cfd7a5149d8d5`
- `DeterministicVoiceAnalysis 1.0.0`
- fixed analysis basis: `ONSET_LOCAL_REGISTER_1.0`
- exact-head Tests #640: `SUCCESS` on Node.js 18/20/22
- exact-head MusicXML Compatibility #456: `SUCCESS`
- rebase-merged to `main` as `c9cc504558630b48e34c1fb0e0753963b24d181e`
- post-merge Tests #641: `SUCCESS`, event `push`, exact `main` SHA `c9cc504558630b48e34c1fb0e0753963b24d181e`
- independent review at the PA-5 candidate found no remaining P1/P2 blocker

PA-5 labels are deterministic onset-local register candidates, not semantic melody/bass truth. PA-5 does not execute PA-4 decisions and does not choose guitar string/fret/finger/barre/voicing.

## PA-6 closure

PA-6 adds an internal deterministic execution layer for the narrow approved arrangement subset.

Verified evidence:

- PR #90 — `feat(PA-6): add deterministic reduction and octave rules`
- red-first head: `fa7172e46525fd2c92f1b3bd7508cf8a9d728302`
- red-first Tests #642 failed only because the PA-6 production module did not yet exist
- first implementation head: `c7aea71a5a2af3aa9b4fea55adc3fc8681ee5a5b`
- final candidate head: `4f932e230587d0e832af4116d2011bd7b58e58b4`
- `DeterministicReductionPlan 1.0.0`
- fixed policy: `STANDARD_GUITAR_REGISTER_20_FRET_1.0`
- fixed standard-tuning/default-0–20-fret register envelope: MIDI 40–84
- fixed octave tie-break: `DOWNWARD_TIE_BREAK_1.0`
- executable PA-6 subset: `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED`, conservative `CHORD_REDUCED`
- deferred/fail-closed in PA-6 v1: `VOICE_REDISTRIBUTED`, `REVOICED`, `ARPEGGIATED`
- exact-head Tests #645: `SUCCESS` on Node.js 18/20/22
- exact-head MusicXML Compatibility #460: `SUCCESS`
- independent PA-6 contract/code/test review found no remaining P1/P2 blocker
- rebase-merged to `main` as `f4055e42d2cd364060e7d99a4efc2add3d8817bd`
- post-merge Tests #646: `SUCCESS`, event `push`, exact `main` SHA `f4055e42d2cd364060e7d99a4efc2add3d8817bd`

The PA-6 register envelope is a deterministic register policy, not physical playability proof. PA-6 does not choose strings, frets, fingers, barre shapes, hand positions, or chord voicings.

## Current polyphonic internal path

```text
ParsedMusicXmlDocument 1.0.0
        ↓
PolyphonicSourceModel 1.0.0
        ↓
SimultaneousEventModel 1.0.0
        ↓
GuitarArrangementPlan 1.0.0
        ↓
DeterministicVoiceAnalysis 1.0.0
        ↓
DeterministicReductionPlan 1.0.0
        ↓
PA-7 guitar chord/voicing candidates — NOT STARTED
```

## Public-boundary statement

PA-5 and PA-6 are internal parallel-path foundations only.

They do not:

- weaken the current public monophonic rejection rules;
- expose a public polyphonic conversion API;
- alter `src/index.js` package-root exports;
- alter `CanonicalTabResult 1.0.0`;
- make PDF, UI, playback, teacher score editing, or learned/AI arrangement authority production-ready;
- prove real uploaded-file PA-5/PA-6 end-to-end conversion.

## Gate status after this closure

- PA-5: `CLOSED / MERGED_INTERNAL / VERIFIED`
- PA-6: `CLOSED / MERGED_INTERNAL / VERIFIED`
- PA-7: `NOT_STARTED / REQUIRES_SEPARATE_STAGE_START_APPROVAL`

PA-7 must not begin from this document or from PA-6 merge approval alone.
