# PA-8 Left-Hand Shape / Finger / Barre Contract

## Status

- Gate: `PA-8`
- Scope: internal structural left-hand shape candidates over PA-7 voicing candidates
- Public API change: none
- `CanonicalTabResult 1.0.0` change: none
- PA-9 full physical-playability authority: not included
- Final voicing/fingering selection: not included

PA-8 consumes the approved internal pipeline through PA-7 and deterministically enumerates structural left-hand finger assignments for each PA-7 guitar voicing candidate.

## Upstream authority

PA-8 recomputes and validates upstream facts from the same trusted inputs. It does not accept a caller-supplied PA-7 output blob as authority:

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
```

The original MusicXML/source model remains immutable source truth.

## Contract identity

- document type: `LeftHandShapeModel`
- contract version: `1.0.0`
- policy: `ORDERED_FRET_FINGER_BARRE_1.0`
- fretting fingers: `1..4`
- open-string marker: finger `0`
- fixed per-source-group shape-candidate ceiling: 20,000
- fixed per-source-group complete-assignment-attempt ceiling: 100,000

## Structural finger semantics

For every PA-7 voicing candidate:

1. Preserve exact PA-7 candidate identity, position order, source-event provenance, target MIDI, string and fret.
2. `fret = 0` receives `finger = 0` only.
3. `fret > 0` receives exactly one finger in `1..4`.
4. One finger may not be used at two different frets in one shape.
5. Across different frets, lower frets must use lower-numbered fingers than higher frets. Positions at the same fret may use the same or different fingers.
6. One finger assigned to two or more strings at the same fret creates a barre spanning the minimum through maximum assigned string number.
7. A barre is valid only when it does not alter another active PA-7 pitch inside its span:
   - an active position inside the span may not have a fret lower than the barre fret;
   - an active position at the same fret inside the span must use the same barre finger;
   - an active position at a higher fret inside the span is allowed.
8. A barre spanning strings `1..6` is `FULL_BARRE`; every other barre is `PARTIAL_BARRE`.
9. A finger used on one string only is not a barre.
10. Open-only voicings produce one structural shape candidate with finger `0` assignments and no barre.
11. A PA-7 voicing candidate may produce zero PA-8 shape candidates when no assignment satisfies this structural policy. Zero candidates never authorize note removal or pitch mutation.

Complete finger vectors are visited deterministically in PA-7 position order with fretting fingers `1,2,3,4`. Candidate IDs are deterministic within each PA-7 voicing candidate. Candidate order is not preference ranking.

## Non-authority boundary

PA-8 does **not** prove full physical playability and does not decide:

- anatomical reach or stretch comfort;
- wrist/hand posture;
- finger pressure or barre strength;
- transition cost between shapes;
- muted-string technique;
- ergonomic difficulty;
- pedagogical preference;
- final chord/voicing selection;
- arrangement optimization;
- public polyphonic output.

PA-9 remains the separately gated `Physical Playability Validator v2` authority. A PA-8 shape is a structurally consistent finger/barre description only.

## Output shape

```text
LeftHandShapeModel
├── documentType = "LeftHandShapeModel"
├── contractVersion = "1.0.0"
├── policy = "ORDERED_FRET_FINGER_BARRE_1.0"
├── voicing
│   ├── documentType = "GuitarVoicingCandidateModel"
│   ├── contractVersion = "1.0.0"
│   └── policy
├── configuration
│   ├── frettingFingerMinimum = 1
│   ├── frettingFingerMaximum = 4
│   └── openStringFinger = 0
├── groupCount
├── voicingCandidateCount
├── shapeCandidateCount
└── groups[]
    ├── sourceGroupId
    ├── voicingCandidateCount
    └── voicingCandidates[]
        ├── voicingCandidateId
        ├── positions[]
        ├── shapeCandidateCount
        └── shapeCandidates[]
            ├── shapeCandidateId
            ├── assignmentCount
            ├── fingerAssignments[]
            │   ├── sourceEventId
            │   ├── targetMidi
            │   ├── string
            │   ├── fret
            │   └── finger
            ├── usedFingerCount
            ├── minimumFrettedFret
            ├── maximumFrettedFret
            ├── fretSpan
            ├── barreCount
            └── barres[]
                ├── finger
                ├── fret
                ├── startString
                ├── endString
                ├── stringSpan
                └── kind = PARTIAL_BARRE | FULL_BARRE
```

All returned arrays and records are deeply immutable.

## Resource and failure behavior

PA-8 reuses the existing optional `ProcessingRuntime` for deadline/cancellation checkpoints. It introduces no second runtime/budget API.

PA-8 fails closed when:

- upstream source/arrangement/reduction/voicing recomputation fails;
- a recomputed PA-7 position has invalid identity, MIDI, string or fret facts;
- generated shape candidates in one source group would exceed 20,000;
- complete finger-assignment attempts in one source group would exceed 100,000;
- processing deadline or cancellation is reached.

The ceilings bound each independently processed source group even when attempted finger vectors are rejected. Aggregate work remains bounded by the authentic PA-7 candidate snapshot and the existing ProcessingRuntime deadline/cancellation boundary; it is not a second source of candidate ordering or selection authority.

## Required evidence

PA-8 cannot be considered merge-ready without:

- red-first evidence;
- open-string finger-0 tests;
- deterministic finger-assignment tests;
- ordered-fret policy tests;
- partial-barre and full-barre tests;
- barre/open-string interference rejection;
- zero-shape behavior where structurally unavailable;
- PA-7 position/provenance preservation;
- deep immutability;
- per-source-group shape and assignment-attempt ceiling coverage;
- deadline/cancellation coverage;
- hostile upstream fail-closed coverage;
- full repository regression;
- MusicXML Compatibility evidence;
- package-root API compatibility evidence;
- independent code/test review.

Completion of PA-8 does not authorize PA-9.
