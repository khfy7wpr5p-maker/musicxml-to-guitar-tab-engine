# Polyphonic Guitar Arrangement Foundation

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-01 -->

## Purpose and boundary

This is the active architecture view for the internal/application polyphonic-arrangement path. It does not replace or silently widen the public monophonic package API. `CanonicalTabResult 1.0.0` remains ordinary package-root TAB authority; the bounded Standard-tuning source-capo extension uses `CanonicalTabResult 1.1.0`. `CanonicalTabResult 2.0.0` / `2.1.0` remain internal/application authority.

Package context: version `0.1.0`, `private: true`, `SEE LICENSE IN LICENSE`, Node.js >=18.

## Implemented internal chain

```text
Polyphonic MusicXML
 ↓
XML safety + shared ProcessingRuntime
 ↓
source guitar configuration provenance / authority
 ↓
representation compatibility normalizers
 ↓
PA-1 PolyphonicSourceModel 1.0.0
 ↓
PA-2 bounded polyphonic projection
 ↓
PA-3 SimultaneousEventModel 1.0.0
 ↓
PA-4 GuitarArrangementPlan 1.0.0
 ↓
PA-5 DeterministicVoiceAnalysis 1.0.0
 ↓
PA-6 DeterministicReductionPlan 1.0.0
 ↓
PA-7 GuitarVoicingCandidateModel 1.0.0 using resolved configuration
 ↓
authentic immutable single-generation PA-7 handoff
 ├─→ PA-8 LeftHandShapeModel 1.0.0
 │    ↓
 │   PA-9 PhysicalPlayabilityValidation 2.0.0
 │    ↓
 │   deterministic ordinary final selection
 │
 └─→ detached deeply frozen PA-7 read-copy
      ↓
     GuitarSet v2 runtime-shadow evidence only

retained sustain/tie fallback when exact unsupported reason applies:
PS-2 SustainTieGraph 1.2.0
 ↓
PS-3 logical continuity
 ↓
PS-4A active sonority
 ↓
sustained position states using resolved configuration
 ↓
PS-4C shared PA-8 / PA-9 physical enumeration
 ↓
sustained path solver
 ↓
PA-12 sustained canonical final selection

PA-10 canonical-v2 compatibility/design through PA-10.5
PA-11 teacher-approved evaluation through PA-11.4A
internal CanonicalTabResult 2.0.0 / 2.1.0 runtime/writer
PA-12 internal E2E
future public/package-root PA-13 polyphonic API
```

## Source guitar configuration foundation

`src/parser/musicXmlGuitarConfigurationProvenance.js` extracts explicit MusicXML tuning/capo evidence before the internal arrangement path is allowed to treat it as executable configuration.

A complete executable tuning requires exactly six unique `staff-tuning` lines, valid step/alter/octave values, physically consistent six-string ordering, at most one capo, and successful immutable configuration construction.

The first executable configuration must be established before immutable solve scope begins. Current provenance records `afterSolveStart` when the declaration appears after measure index 0 or after a `note`, `backup`, or `forward` has already appeared earlier in measure 0. Genuine later tuning/capo changes remain fail-closed as `UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE`.

A capo-only declaration may inherit only a prior complete configuration on the same part/staff. Identical later declarations are restatements rather than new configuration authority.

Historical producer TAB tuning metadata is not automatically executable. The legacy fallback is admitted only for the exact reviewed partial or physically reversed complete TAB presentation shape, at the exact parser-error location in measure 0, on the matching TAB staff/clef, before any earlier `note`/`backup`/`forward`, with exactly one compatible presentation block and no conflicting executable configuration/capo evidence. When admitted it remains `TAB_PRESENTATION_PROVENANCE_ONLY` and falls back to `STANDARD_DEFAULT`. A lone legacy declaration after solve start remains fail-closed.

See `stage-03-source-guitar-configuration-closeout.md`.

## Stage responsibilities

### PA-1 / PA-2

Preserve bounded source truth, timing, voices, staves, chord/source relationships, and exact provenance. Representation compatibility may normalize only a separately proven producer representation before projection; it may not invent semantics or executable guitar configuration.

### PA-3

Groups exact simultaneous pitched source events. Grouping is source evidence, not guitar-selection authority.

### PA-4

Represents explicit arrangement decisions/provenance. It does not autonomously invent final policy.

### PA-5

Provides deterministic onset-local register roles. These are analysis facts/candidates, not semantic melody/bass truth.

### PA-6

Executes the approved deterministic subset. Deferred semantics remain fail-closed rather than guessed. Stage 03 did not change PA-6 ranking, reduction policy, or tie-break behavior.

### PA-7

Enumerates exact-target-MIDI distinct-string positions under the immutable guitar configuration supplied by the owning bounded pipeline, with the same candidate-order semantics and fret domain. Candidate order is enumeration, not preference. Zero candidates never authorize silent note dropping. Package-root Standard behavior remains separately bounded.

### PA-7 handoff

`DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_V1` generates PA-7 exactly once and preserves authentic immutable group/candidate identity, order, and position facts through PA-8/PA-9.

### PA-8

Builds structural left-hand finger/barre candidates while preserving PA-7 positions. Fixed ceilings remain 20,000 generated shapes and 100,000 complete assignment attempts **per independently processed source group**. The sustained PS-4C adapter treats one PS-4A sonority point as one such enforcement group across its ordered position states. These are not whole-score aggregate ceilings.

### PA-9

Replays/revalidates PA-8 under `CONSERVATIVE_STATIC_LEFT_HAND_2.0`. `PLAYABLE_WITHIN_POLICY` is a bounded static-policy verdict, not universal comfort/anatomy/tempo truth.

### PA-10 / PA-11 / PA-12

PA-10.0–PA-10.5 define canonical-v2 compatibility/design. PA-11 remains independent evaluation infrastructure through PA-11.4A. PA-12 implements the bounded internal/application end-to-end path and does not create package-root/public v2 authority.

Internal output may remain `CanonicalTabResult 2.0.0` for Standard configuration or use the admitted configuration-aware `CanonicalTabResult 2.1.0` extension where required.

## Sustain / tie foundation

PS-2 `SustainTieGraph 1.2.0` preserves exact source tie facts and derives exact chains by `(staff, voice, MIDI pitch, written pitch)`. It may reconnect only the reviewed exact contiguous closed-stop representation. A genuine unmatched stop remains fail-closed as `INVALID_SUSTAIN_TIE_GRAPH` / `ORPHAN_TIE_STOP`.

PS-3 follows sealed chain order. PS-4A carries attacks/holds/releases into later sonority points. PS-4C reuses the PA-8/PA-9 physical stack. The sustained path solver chooses only among already validated physical states.

No stage synthesizes pitch, octave, onset, duration, voice, staff, source tie facts, executable source guitar configuration, or an implicit voice split.

## Same-voice chord boundary

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE.**

An exact MusicXML `<chord/>` member in a validated staff/voice lane belongs to the preceding attack group rather than advancing the lane as an independent event. The lane occupancy cursor is nevertheless the maximum end of every member of that chord group.

A later independent non-chord attack before that maximum end is rejected as `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` / `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`. No implicit voice split is created to make it fit.

## MusicXML compatibility foundation

Compatibility is a representation adapter, not a file exception system. Current exact contracts include the Stage 03 legacy TAB presentation-only fallback, reviewed Guitar Pro grace (`eighth` and `32nd` nominal types), exact bracketed-below 3:2 triplet display backed by validated timing semantics, exact normalized TAB staff mirror collapse, and bounded closed sustain-stop continuation.

Valid explicit custom tuning/capo evidence is executable configuration authority and is never downgraded through legacy TAB compatibility.

Every rule must remain filename-independent, SHA-independent, bounded, deterministic, fail-closed, and source-immutable.

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

## Runtime shadow in relation to PA-7

Stage: `ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1`.

Runtime shadow connection: internal default-off.

The reviewed runtime bridge uses the same authentic PA-7 handoff consumed by deterministic PA-8/PA-9 selection, but learned code receives only a detached, deeply frozen plain-data read-copy preserving exact candidate group IDs, candidate IDs, and sourceEventId/targetMidi/string/fret facts.

Authority boundary:

- live/user input: false
- learned candidate generation/mutation/filter/deletion: false
- optimizer/final-selection effect: false
- authoritative optimizer/canonical/TAB effect: false
- checkpoint mutation/refit/retraining: false
- `fret20QualityAuthority=false`
- production: false
- public package-root exposure: false

Model/artifact/scoring errors are isolated and cannot replace deterministic selection.

## Learned fingering evidence

Historical retained model identity is `GUITARSET-OBSERVED-VOICING-MODEL.v2`; controlled offline status is `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE`.

Sealed evidence remains at:

`evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json`

Observed positive GuitarSet gold remains frets 0..19 while candidate domain is 0..20, therefore `fret20QualityAuthority=false`.

This evidence is historical scientific material; it does not grant live/user or canonical authority.

## Internal final-selection boundary

The deterministic ordinary selector chooses from physically validated candidates under explicit PA-4 decisions. The sustained selector is a narrow fallback only for the specifically recognized retained-sustain/tie unsupported reasons and requires exact preserved projection.

Neither selector may use compatibility as a way to alter guitar configuration, candidate ordering, physical rules, solver ranking/cost, or tie-breaks. Unsupported or ambiguous semantics remain fail-closed.

## Remaining public path

```text
implemented internal/application deterministic selection
 ↓
implemented internal CanonicalTabResult 2.0.0 / 2.1.0 validator/runtime/writer
 ↓
implemented PA-12 internal E2E
 ↓
future exact public version dispatcher
 ↓
PA-13 public polyphonic API
```

Runtime shadow does not authorize any of these public arrows.

## Security invariants

1. Original MusicXML bytes and source musical facts are immutable.
2. Public monophonic rejection rules remain unchanged until a separate public API is approved.
3. Compatibility normalizers do not guess missing semantics, invent executable tuning/capo, or branch on corpus identity.
4. Genuine tuning/capo changes after solve start remain fail-closed.
5. Candidate generation, left-hand modeling, physical validation, shadow scoring, and final selection remain distinct authorities.
6. Candidate enumeration order is not preference ranking.
7. Fixed PA-8 ceilings are not raised to make corpus cases pass.
8. Learned models cannot create/delete/filter/truncate/mutate PA-7 candidates.
9. Historical sealed evidence is immutable.
10. Runtime shadow is diagnostic/default-off and not learned-selection authority.
11. Renderer/writer layers do not become semantic authorities.
12. Deadline/cancellation and deep immutability remain active cross-cutting boundaries.
13. Live/user-input activation, production release, public polyphony, playback, and PDF remain separate consequential gates unless independently verified.
