# PA-9 Physical Playability Validator v2 — Closure

## Status

- Gate: `PA-9`
- Status: `CLOSED` after runtime merge, exact-head CI, post-merge `main` Tests, independent review and documentation convergence
- Runtime PR: #98 — `feat(PA-9): add physical playability validator v2`
- Merge method: rebase
- Runtime merge/result SHA on `main`: `9869b7ecf65c9c76da3a25c032f3026a48bce201`
- Runtime Git tree: `00141270f145699f01e5ff4aa0b55e5bf47dc58e`
- Public API change: none
- `CanonicalTabResult 1.0.0` change: none
- PA-10: `NOT_STARTED`; separate Stage Start Approval required
- Branch cleanup: not authorized by this closure

PA-9 adds an internal deterministic static physical-playability validation layer over PA-8 left-hand shape candidates. It does not make polyphonic conversion public and does not create ranking, final-selection, transition-optimization or canonical-output authority.

## Contract identity

- document type: `PhysicalPlayabilityValidation`
- contract version: `2.0.0`
- policy: `CONSERVATIVE_STATIC_LEFT_HAND_2.0`
- accepted status: `PLAYABLE_WITHIN_POLICY`
- rejected status: `REJECTED`
- maximum static fret span: `4`
- maximum extra fret reach beyond finger-number distance: `1`
- maximum shape validations: inherited PA-8 aggregate ceiling of `20,000`

`PLAYABLE_WITHIN_POLICY` means accepted by this fixed deterministic conservative policy only. It is not a claim that every player can perform the shape comfortably, at tempo, or in every musical context.

## Upstream and physical authority

PA-9 recomputes PA-8 internally from validated source truth plus arrangement decisions. Caller-supplied PA-7/PA-8 blobs are not authority.

The internal path through PA-9 is:

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

For every PA-8 assignment, PA-9 reuses the existing `validatePosition` single-position physical authority. It revalidates exact source-event / target-MIDI / string / fret provenance against the recomputed PA-8 voicing position and fails closed on malformed or pitch-inconsistent upstream facts.

## Fixed PA-9 policy

### Static fret span

Open strings are ignored when determining the fretted hand window.

- `maximumFrettedFret - minimumFrettedFret <= 4` is accepted by this rule.
- a larger span is `REJECTED` with `FRET_SPAN_EXCEEDED`.

### Pairwise distinct-finger reach

For distinct fretting fingers at different frets:

```text
fretDistance <= fingerNumberDistance + 1
```

A violation is `REJECTED` with `FINGER_REACH_EXCEEDED`.

Reason ordering is deterministic:

1. `FRET_SPAN_EXCEEDED`
2. `FINGER_REACH_EXCEEDED`

A shape may carry both reasons.

## Preserved PA-8 structural invariants

PA-9 revalidates rather than repairs:

- open-string finger `0` semantics;
- fretted finger range `1..4`;
- one finger / one fret;
- ordered finger relation across different frets;
- explicit `PARTIAL_BARRE` / `FULL_BARRE` records;
- barre span interference rules;
- exact PA-7 source/MIDI/string/fret provenance;
- PA-8 group/voicing/shape identity and order;
- PA-8 summary counts.

A PA-8 voicing with zero shape candidates remains zero-shape. A non-empty PA-8 voicing whose every shape is rejected remains intact with zero accepted PA-9 shapes. PA-9 never drops notes, mutates pitch, creates a new voicing, or chooses a final candidate in response to rejection.

## Resource and fail-closed behavior

PA-9 reuses the existing optional `ProcessingRuntime` and remains deadline/cancellation aware.

Verified inherited ceilings include:

- PA-8 complete finger-assignment attempt ceiling: `100,000`; fail closed at observed `100,001`;
- PA-8 aggregate shape-candidate ceiling: `20,000`; fail closed at observed `20,001`.

Hostile source and hostile arrangement-decision inputs remain fail closed through upstream validation. Returned PA-9 records and arrays are deeply immutable.

## Red-first evidence

Red-first head:

`a26b098b76db55b312f4941025c41a407f6695e0`

At that head the PA-9 production module intentionally did not exist.

- Tests #666: `FAILURE` on Node.js 18/20/22 as expected
- MusicXML Compatibility #473: `FAILURE` as expected
- the new PA-9 test failed on missing `../src/music/physicalPlayabilityValidatorV2`
- the pre-existing repository suite remained green before that new missing-module failure

This establishes genuine red-first evidence rather than a post-hoc failing assertion.

## Final candidate evidence

Final PR #98 head:

`9299cb6837c9c813f6217ba179501a3bc9490b22`

Exact changed surface before merge was four new files only:

1. `docs/pa-9-physical-playability-validator-v2-contract.md`
2. `src/music/physicalPlayabilityValidatorV2.js`
3. `tests/physicalPlayabilityValidatorV2.test.js`
4. `tests/physicalPlayabilityValidatorV2Hardening.test.js`

No existing runtime, package-root API, workflow, package metadata, parser, optimizer or writer file was modified by PR #98.

Final exact-head CI:

- Tests #671: `SUCCESS` on Node.js 18/20/22
- MusicXML Compatibility #478: `SUCCESS`
  - complete repository tests + alphaTab import/SVG on Node.js 18/20/22: `SUCCESS`
  - browser renderer/cursor job: `SUCCESS`
  - synth diagnostic job: `SUCCESS` at workflow/job level only
  - MuseScore availability check: `SUCCESS` as availability evidence only

The synth diagnostic does not establish production playback readiness. MuseScore command availability does not establish real MuseScore MusicXML import/re-export, semantic round-trip or PDF support.

## Runtime merge and post-merge evidence

PR #98 was marked Ready for Review only after exact-head evidence and independent review were complete.

It was then rebase-merged with an expected-head lock on:

`9299cb6837c9c813f6217ba179501a3bc9490b22`

GitHub merge/result SHA and authoritative runtime `main` became:

`9869b7ecf65c9c76da3a25c032f3026a48bce201`

Runtime tree:

`00141270f145699f01e5ff4aa0b55e5bf47dc58e`

`main` remained protected with the required Tests/Compatibility check contexts configured.

Post-merge push evidence on the exact runtime SHA:

- Tests #672
- event: `push`
- branch: `main`
- head SHA: `9869b7ecf65c9c76da3a25c032f3026a48bce201`
- conclusion: `SUCCESS`

No post-merge Compatibility run is claimed here; the verified Compatibility evidence is the exact PR-head #478 run above.

## Independent review result

Final independent review found no remaining P1/P2 blocker within the approved PA-9 scope.

Confirmed boundaries:

- existing single-position physical truth is reused rather than replaced;
- package-root public API is unchanged;
- `CanonicalTabResult 1.0.0` is unchanged;
- the public monophonic fail-closed boundary is unchanged;
- PA-9 output has no rank/score/cost/selected/preference/final-selection/transition authority;
- no PA-10 implementation exists in this closure;
- real uploaded MusicXML was not executed through PA-9 as genuine E2E evidence.

## Authority after closure

PA-9 is now an internal merged foundation only.

It may classify PA-8 structural shapes under the fixed static policy, but it cannot:

- change source pitch/rhythm/timing;
- drop notes or create new arrangement decisions;
- rank candidates;
- choose a final voicing/fingering;
- optimize transitions between shapes;
- mutate `CanonicalTabResult 1.0.0`;
- expose public polyphonic conversion;
- authorize PA-10 or any later gate.

The current public package-root conversion path remains the protected monophonic path.

## Next gate

The next roadmap gate is PA-10 canonical v1/v2 compatibility review. It is `NOT_STARTED` after PA-9 closure and requires a new explicit Stage Start Approval.

PA-9 closure does not authorize PA-10 work, public polyphonic output, branch deletion or cleanup.
