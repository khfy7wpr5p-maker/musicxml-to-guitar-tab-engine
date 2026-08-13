# PA-9 Physical Playability Validator v2 Contract

## Status

- Gate: `PA-9`
- Scope: internal deterministic static physical-playability validation over PA-8 left-hand shape candidates
- Public API change: none
- `CanonicalTabResult 1.0.0` change: none
- PA-10 canonical compatibility review: not included
- Candidate ranking/final selection: not included
- Transition/path optimization: not included

PA-9 consumes the approved internal pipeline through PA-8 and deterministically classifies each PA-8 structural shape candidate as accepted or rejected under one fixed conservative static-guitar policy.

## Upstream authority

PA-9 recomputes and validates upstream facts from the same trusted inputs. It does not accept caller-supplied PA-8 or PA-7 model blobs as authority:

```text
PolyphonicSourceModel 1.0.0
        ↓
GuitarArrangementPlan 1.0.0
        ↓
DeterministicVoiceAnalysis 1.0.0
        ↓
DeterministicReductionPlan 1.0.0
        ↓
GuitarVoicingCandidateModel 1.0.0
        ↓
LeftHandShapeModel 1.0.0
        ↓
PhysicalPlayabilityValidation 2.0.0
```

The original MusicXML/source model remains immutable source truth.

## Contract identity

- document type: `PhysicalPlayabilityValidation`
- contract version: `2.0.0`
- policy: `CONSERVATIVE_STATIC_LEFT_HAND_2.0`
- accepted status: `PLAYABLE_WITHIN_POLICY`
- rejected status: `REJECTED`
- maximum static fret span: `4`
- maximum extra fret reach beyond finger-number distance: `1`
- maximum shape validations: inherited PA-8 aggregate ceiling of `20,000`

`PLAYABLE_WITHIN_POLICY` means that the candidate satisfies this fixed deterministic static policy. It is not a claim that every player can perform the shape comfortably, at tempo, or in every musical context.

## Existing physical authority reused

PA-9 must reuse the existing guitar position validator for each PA-8 finger assignment. It must not duplicate or weaken single-position physical truth.

For every assignment:

- string must remain 1..6;
- fret must remain inside the standard configured 0..20 range used by PA-7/PA-8;
- string/fret must reproduce exact `targetMidi`;
- source-event identity and PA-8 shape identity must not be mutated.

Any malformed or pitch-inconsistent recomputed upstream fact is a fail-closed contract error, not a candidate-level `REJECTED` verdict.

## Static chord-aware policy

After upstream structural and single-position validation succeeds, each PA-8 shape candidate is checked independently.

### Rule P9-1 — static fret span

Ignore open strings when determining the fretted hand window.

- `maximumFrettedFret - minimumFrettedFret <= 4` is allowed.
- A larger span is `REJECTED` with reason `FRET_SPAN_EXCEEDED`.

This is a deliberately conservative fixed policy bound, not a universal anatomical theorem.

### Rule P9-2 — pairwise finger reach

For each pair of distinct fretting fingers used at different frets:

```text
fretDistance <= fingerNumberDistance + 1
```

If this inequality fails, the shape is `REJECTED` with reason `FINGER_REACH_EXCEEDED`.

Open-string finger `0` is excluded from this calculation. Repeated use of one finger at one fret is handled as PA-8 barre geometry and is not treated as a distinct-finger reach pair.

### Rule P9-3 — PA-8 structural invariants remain mandatory

PA-9 revalidates the recomputed PA-8 identity and shape facts before issuing any verdict. It must fail closed rather than reinterpret:

- open string finger `0` semantics;
- fretted finger range `1..4`;
- one finger / one fret;
- ordered finger relation across different frets;
- explicit `PARTIAL_BARRE` / `FULL_BARRE` records;
- barre span interference rules;
- exact PA-7 source/MIDI/string/fret provenance.

PA-9 does not repair a malformed PA-8 shape.

## Verdict vocabulary

Candidate-level status is exactly one of:

- `PLAYABLE_WITHIN_POLICY`
- `REJECTED`

Candidate-level rejection reason vocabulary is fixed to:

- `FRET_SPAN_EXCEEDED`
- `FINGER_REACH_EXCEEDED`

Reason codes are emitted in the order above. A shape may carry both reasons.

A PA-8 voicing may therefore have:

- one or more accepted shapes;
- only rejected shapes;
- zero PA-8 shape candidates.

Zero accepted shapes never authorize note removal, pitch mutation, new voicing generation, arrangement mutation, or public output.

## Output shape

```text
PhysicalPlayabilityValidation
├── documentType = "PhysicalPlayabilityValidation"
├── contractVersion = "2.0.0"
├── policy = "CONSERVATIVE_STATIC_LEFT_HAND_2.0"
├── leftHand
│   ├── documentType = "LeftHandShapeModel"
│   ├── contractVersion = "1.0.0"
│   └── policy = "ORDERED_FRET_FINGER_BARRE_1.0"
├── configuration
│   ├── maximumStaticFretSpan = 4
│   └── maximumExtraFretReach = 1
├── groupCount
├── voicingCandidateCount
├── shapeCandidateCount
├── playableShapeCount
├── rejectedShapeCount
└── groups[]
    ├── sourceGroupId
    ├── voicingCandidateCount
    └── voicingCandidates[]
        ├── voicingCandidateId
        ├── shapeCandidateCount
        ├── playableShapeCount
        ├── rejectedShapeCount
        └── shapeVerdicts[]
            ├── shapeCandidateId
            ├── status
            ├── reasonCodes[]
            ├── fretSpan
            ├── usedFingerCount
            └── barreCount
```

All returned arrays and records are deeply immutable. Verdict order is the exact PA-8 group / voicing / shape candidate order and is not preference ranking.

## Non-authority boundary

PA-9 does **not** decide:

- ergonomic comfort or player-specific anatomy;
- wrist/posture quality;
- finger pressure or fatigue;
- performance tempo;
- transition cost between consecutive shapes;
- pedagogical preference;
- candidate ranking;
- final voicing/fingering selection;
- deterministic arrangement optimization;
- canonical v1/v2 migration;
- public polyphonic output.

Those remain separately gated later authorities. PA-10 is not authorized by PA-9 completion.

## Resource and failure behavior

PA-9 reuses the existing optional `ProcessingRuntime` for deadline/cancellation checkpoints. It introduces no second runtime/budget API.

PA-9 fails closed when:

- upstream source/arrangement/reduction/voicing/left-hand recomputation fails;
- recomputed PA-8 model identity or counts are inconsistent;
- a PA-8 assignment or barre record is malformed;
- existing single-position physical validation fails;
- more than 20,000 shape validations would be observed;
- processing deadline or cancellation is reached.

## Required evidence

PA-9 cannot be considered merge-ready without:

- red-first evidence;
- existing position-validator reuse / pitch mismatch fail-closed evidence;
- accepted all-open/static shapes;
- maximum-fret-span boundary tests;
- pairwise finger-reach boundary tests;
- multi-reason rejection ordering;
- preservation of PA-8 candidate identity and order;
- zero-shape / zero-accepted-shape behavior;
- deep immutability;
- inherited PA-8 resource-ceiling evidence;
- deadline/cancellation coverage;
- hostile upstream fail-closed coverage;
- no rank/score/final-selection fields;
- full repository regression;
- MusicXML Compatibility evidence;
- package-root API compatibility evidence;
- independent code/test review.

Completion of PA-9 does not authorize PA-10.
