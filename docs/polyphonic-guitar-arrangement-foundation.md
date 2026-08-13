# Polyphonic MusicXML → Guitar Arrangement Foundation

## Status

- Planning gate: `PA-0`
- PA-0 status: `DOCUMENTATION_ONLY` architecture foundation merged
- PA-1 `PolyphonicSourceModel 1.0.0`: `MERGED_INTERNAL`
- PA-1 merge: PR #73, rebase-merged to `main` on 2026-08-11
- PA-1 post-merge Tests #488: `SUCCESS`
- PA-2.1 projection contract: `MERGED_DOCUMENTATION_ONLY` through PR #75 on 2026-08-12; see `docs/polyphonic-projection-contract.md`
- PA-2.2 red-first vectors: `MERGED_TESTS_ONLY` through PR #77 on 2026-08-12
- PA-2.3 minimal internal basic note/rest projector: `MERGED_INTERNAL` through PR #78 on 2026-08-12
- PA-2.4 `backup` / `forward` cursor semantics: `MERGED_INTERNAL` through PR #80 on 2026-08-12
- PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection: `MERGED_INTERNAL` through PR #81 on 2026-08-12
- PA-2.6 hostile/budget/deadline/cancellation negatives: `MERGED_TESTS_ONLY` through PR #83 on 2026-08-12
- PA-2.7 full regression + monophonic compatibility: `VERIFIED`
- PA-2.8 GitHub CI + independent review: `VERIFIED`; no P1/P2 blocker found
- PA-2 sequence: `CLOSED`
- PA-3 `SimultaneousEventModel 1.0.0`: `MERGED_INTERNAL` through PR #85 on 2026-08-12
- PA-3 exact-head Tests #622: `SUCCESS`
- PA-3 exact-head MusicXML Compatibility #442: `SUCCESS`
- PA-3 post-merge Tests #623 on `main`: `SUCCESS`
- PA-3 independent review: no P1/P2 blocker found
- PA-4 `GuitarArrangementPlan 1.0.0`: `MERGED_INTERNAL` through PR #87 on 2026-08-12
- PA-4 exact-head Tests #633: `SUCCESS`
- PA-4 exact-head MusicXML Compatibility #451: `SUCCESS`
- PA-4 post-merge Tests #634 on `main`: `SUCCESS`
- PA-4 independent final review: no remaining P1/P2 blocker found
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: `MERGED_INTERNAL` through PR #89 on 2026-08-12
- PA-5 exact-head Tests #640: `SUCCESS`
- PA-5 exact-head MusicXML Compatibility #456: `SUCCESS`
- PA-5 post-merge Tests #641 on `main`: `SUCCESS`
- PA-5 independent final review: no remaining P1/P2 blocker found
- PA-6 `DeterministicReductionPlan 1.0.0`: `MERGED_INTERNAL` through PR #90 on 2026-08-13
- PA-6 exact-head Tests #645: `SUCCESS`
- PA-6 exact-head MusicXML Compatibility #460: `SUCCESS`
- PA-6 post-merge Tests #646 on `main`: `SUCCESS`
- PA-6 independent final review: no remaining P1/P2 blocker found
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: `MERGED_INTERNAL` through PR #92 on 2026-08-13
- PA-7 exact-head Tests #652: `SUCCESS` on Node.js 18/20/22
- PA-7 exact-head MusicXML Compatibility #465: workflow `SUCCESS`
- PA-7 runtime post-merge Tests #653 on exact `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`: `SUCCESS`
- PA-7 independent final review: no remaining P1/P2 blocker found
- PA-7 closure record: PR #93, documentation-only, rebase-merged on 2026-08-13
- PA-7 closure-record exact-head Tests #654 and MusicXML Compatibility #466: `SUCCESS`
- PA-7 closure-record post-merge Tests #655 on exact `main` SHA `6831047db24d2e69167219844b270533cde8e539`: `SUCCESS`
- PA-7 runtime closure tree: `2458bf228fe02ecb82359417b7bb5016b6c29f82`
- next separately approved polyphonic gate: PA-8 left-hand shape/finger assignment/barre/partial-barre
- Current merged public polyphonic runtime: **not implemented**
- Public API changes: **none**
- `CanonicalTabResult 1.0.0` changes: **none**
- Existing monophonic conversion changes: **none**
- Real uploaded-file PA-7 E2E: **not executed**

PA-1 remains present on the authoritative runtime line as an internal source-truth foundation. Its recovery branch was removed only after rebase merge and a read-only content-equivalence check. That historical cleanup does not authorize cleanup of later PA branches.

PA-2.1 defines the projection contract between `ParsedMusicXmlDocument 1.0.0` and `PolyphonicSourceModel 1.0.0`. PA-2.2 supplies merged red-first vectors. PA-2.3 implements the minimal internal note/rest slice, PA-2.4 adds `backup` / `forward` cursor semantics, PA-2.5 adds source `<chord/>`, multiple bounded voices and staff 1–2 projection, PA-2.6 adds hostile/budget/deadline/cancellation evidence, PA-2.7 verifies full regression/monophonic compatibility, and PA-2.8 verifies GitHub CI plus independent review. PA-3 adds `SimultaneousEventModel 1.0.0`; PA-4 adds `GuitarArrangementPlan 1.0.0`; PA-5 adds `DeterministicVoiceAnalysis 1.0.0`; PA-6 adds `DeterministicReductionPlan 1.0.0`; and PA-7 adds `GuitarVoicingCandidateModel 1.0.0`. These remain internal and do not expose public polyphonic conversion or authorize PA-8 behavior.

This document defines the approved architectural direction for extending the existing monophonic MusicXML-to-Guitar-TAB engine toward a separately gated polyphonic guitar-arrangement path.

Nothing in PA-0 through PA-7 makes multi-staff, multi-voice or chord conversion a current public package capability. PA-7 creates only internal deterministic string/fret alternatives and does not establish left-hand/full-playability/final-selection authority.

## Architectural objective

The long-term target is to support source scores such as piano MusicXML that may contain two staves, multiple voices and simultaneous notes, then create an explicit guitar arrangement before final physical/playability selection.

```text
Polyphonic / piano MusicXML
        ↓
secure XML parse
        ↓
polyphonic source projection
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
GuitarVoicingCandidateModel 1.0.0
        ↓
PA-8 left-hand shape/finger/barre/partial-barre
        ↓
PA-9 Physical Playability Validator v2
        ↓
deterministic arrangement / fingering optimization
        ↓
reviewed TAB-result boundary
```

The project must not obtain polyphonic support by weakening the current monophonic parser or bypassing existing validation.

## Existing monophonic path is preserved

The current authoritative conversion path remains:

```text
MusicXML
  ↓
XML normalization + safety + ProcessingBudget
  ↓
ParsedMusicXmlDocument 1.0.0
  ↓
monophonic structural/semantic validation
  ↓
CanonicalMusicDocument
  ↓
physical string/fret candidates
  ↓
deterministic cost model + DP optimizer
  ↓
CanonicalTabResult 1.0.0
  ↓
JSON / ASCII TAB / TAB MusicXML
```

Throughout PA-0 through PA-7 closure, the existing public `convertMusicXmlToCanonicalTab()` behavior remains the protected compatibility baseline.

The current public path continues to fail closed for chords, `backup` / `forward` polyphonic timing, multiple voices, multiple staves, multipart scores, grace notes, tuplets, unsupported rhythms such as 32nd notes and compressed `.mxl`. Future arrangement work must not make that path permissive.

## Safe parallel extension point

`ParsedMusicXmlDocument 1.0.0` is the approved branching point because it is an immutable XML representation created after XML safety/resource enforcement and before guitar fingering decisions.

```text
                         MusicXML
                            │
                            ▼
               XML Safety + ProcessingBudget
                            │
                            ▼
              ParsedMusicXmlDocument 1.0.0
                            │
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
       existing monophonic        PA-2 polyphonic
           projection                projection
               │                         │
               ▼                         ▼
     CanonicalMusicDocument      PolyphonicSourceModel 1.0.0
               │                         │
               │                         ▼
               │               SimultaneousEventModel 1.0.0
               │                         │
               │                         ▼
               │               GuitarArrangementPlan 1.0.0
               │                         │
               │                         ▼
               │               DeterministicVoiceAnalysis 1.0.0
               │                         │
               │                         ▼
               │               DeterministicReductionPlan 1.0.0
               │                         │
               │                         ▼
               │               GuitarVoicingCandidateModel 1.0.0
               │                         │
               │                         ▼
               │               PA-8 Left-Hand Model
               │                         │
               │                         ▼
               │               PA-9 Playability Validator v2
               │                         │
               └───────────────┐         │
                               ▼         ▼
                          reviewed TAB-result gate
```

The two projections remain explicit and separately versioned. PA-3 adds a distinct source-simultaneity view; PA-4 adds explicit arrangement-decision/provenance; PA-5 adds deterministic onset-local register analysis; PA-6 executes its approved deterministic reduction/octave subset; PA-7 enumerates exact-target-MIDI, distinct-string standard-guitar alternatives. None changes public monophonic conversion or creates public polyphonic output authority.

## Initial target musical scope

Early PA work remains narrow:

- MusicXML `score-partwise`,
- one selected piano-like part,
- one or two staves,
- multiple voices,
- simultaneous/chord note events,
- rests and supported rhythmic timing,
- explicit source identity/location for every projected event.

Deferred to later gates: arbitrary multipart/orchestral reduction, grace-note semantics, tuplets beyond separately reviewed support, compressed `.mxl`, public polyphonic conversion and production AI arrangement authority.

## Source truth and arrangement truth

The original MusicXML remains immutable source truth. PA-3 adds only deterministic derived source grouping of notes sharing exact measure/onset.

PA-4 `GuitarArrangementPlan 1.0.0` records an **already-chosen** arrangement decision using the fixed decision vocabulary:

- `PRESERVED`,
- `OMITTED`,
- `OCTAVE_DISPLACED`,
- `VOICE_REDISTRIBUTED`,
- `CHORD_REDUCED`,
- `REVOICED`,
- `ARPEGGIATED`.

PA-4 requires complete exactly-once source-note coverage and exact provenance. It does not automatically choose a policy.

PA-5 provides deterministic onset-local register candidates only; its labels are not semantic melody/bass truth. PA-6 executes only the separately approved deterministic subset `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED` and conservative `CHORD_REDUCED`; `VOICE_REDISTRIBUTED`, `REVOICED` and `ARPEGGIATED` remain fail-closed/deferred in PA-6 v1.

PA-7 uses PA-6 `KEEP` target MIDI values exactly and enumerates standard-guitar positions with distinct strings for simultaneous active notes. It preserves PA-3 group provenance and PA-6 omission provenance. More than six active simultaneous notes or lack of an injective distinct-string assignment produces zero candidates rather than silent note dropping.

These transformations must never be hidden inside parsing, PA-3 grouping or public monophonic fingering.

## Authority boundaries

- Parsing establishes source structure/content; it does not decide guitar arrangement.
- PA-3 grouping establishes source simultaneity by exact onset; it does not decide a guitar voicing or arrangement.
- PA-4 establishes immutable explicit arrangement-decision/provenance; it does not choose policy.
- PA-5 establishes deterministic source register-role candidates only; it is not semantic melody/bass truth.
- PA-6 executes only its approved deterministic reduction/octave subset and does not prove per-note/per-chord physical playability.
- PA-7 enumerates exact-target-MIDI, distinct-string standard-guitar alternatives; it is not preference ranking, final voicing selection, left-hand fingering or full physical-playability approval.
- PA-8 left-hand shape/finger/barre/partial-barre authority is not started and requires separate Stage Start Approval.
- Only later approved physical/playability layers may establish full left-hand validity.
- Writers serialize an approved canonical result and must not perform arrangement or rerun optimization.
- Teacher review may approve pedagogical choices but cannot override physical impossibility.

## Canonical result compatibility

`CanonicalTabResult 1.0.0` remains unchanged through PA-7. Chord/polyphonic fields must not be inserted into v1 merely to avoid a new contract.

A later PA-10 compatibility gate will decide whether a backward-compatible adapter is sufficient or whether a separately versioned chord-aware result contract is required.

## AI boundary

Current LR-S0 remains shadow-only and applies to existing physically valid monophonic candidate sets. Future arrangement AI is a separate domain and must begin shadow-only after separately approved dataset, provenance, lawful-use/privacy, model-lifecycle and independent-evaluation gates.

AI must not alter the original MusicXML artifact, bypass source validation, fabricate source notes or physical guitar positions, bypass physical validation, silently change canonical output, or treat TeacherFeedback as training consent.

PA-4 through PA-7 are deterministic internal layers, not AI decision authority. Their existence does not authorize learned systems to populate or override arrangement decisions or candidate selection.

## Safe development gates

| Gate | Scope | Runtime authority |
|---|---|---|
| `PA-0` | Documentation + architecture planning | merged documentation; none |
| `PA-1` | `PolyphonicSourceModel 1.0` contract/foundation | merged internal; source truth only |
| `PA-2.1` | `ParsedMusicXmlDocument` → `PolyphonicSourceModel` projection contract | merged documentation-only; none |
| `PA-2.2` | Valid polyphonic red-first fixtures/tests | merged tests-only through PR #77; no runtime authority |
| `PA-2.3` | Minimal internal note/rest projector | merged internal through PR #78; no public authority |
| `PA-2.4` | `backup` / `forward` cursor semantics | merged internal through PR #80; no public authority |
| `PA-2.5` | `<chord/>`, multiple voice, staff 1–2 projection | merged internal through PR #81; no public authority |
| `PA-2.6` | Hostile/budget/deadline/cancellation negatives | merged tests-only through PR #83; no new runtime authority |
| `PA-2.7` | Full regression + monophonic compatibility | verified |
| `PA-2.8` | GitHub CI + independent review | verified; no public activation |
| `PA-3` | `SimultaneousEventModel 1.0.0` source grouping | merged internal through PR #85; no arrangement/public authority |
| `PA-4` | `GuitarArrangementPlan 1.0.0` decision + provenance | merged internal through PR #87; no automatic policy/public authority |
| `PA-5` | `DeterministicVoiceAnalysis 1.0.0` | merged internal through PR #89; deterministic register candidates only |
| `PA-6` | `DeterministicReductionPlan 1.0.0` | merged internal through PR #90; approved deterministic subset only |
| `PA-7` | `GuitarVoicingCandidateModel 1.0.0` | merged internal through PR #92; distinct-string candidate alternatives only |
| `PA-8` | Left-hand shape, finger assignment, barre/partial-barre | `NOT_STARTED`; separate Stage Start Approval required |
| `PA-9` | Physical Playability Validator v2 | internal only after separate approval |
| `PA-10` | Canonical result v1/v2 compatibility review | separate architecture approval |
| `PA-11` | Teacher-approved arrangement benchmark | evaluation only |
| `PA-12` | Internal polyphonic E2E + monophonic compatibility | no public activation |
| `PA-13` | Public arrangement API review | separate public-contract approval |
| `PA-14` | ScoreMosaic/SesliTab adapter integration | external adapter only |
| `AI-A1+` | Learned arrangement ranking | shadow-first, separately gated |

Completion of one gate does not authorize later gates. Completion of PA-7 does not authorize PA-8.

## PA-2.1 projection contract boundary

The authoritative detailed PA-2.1 contract is `docs/polyphonic-projection-contract.md`.

It fixes the initial projection semantics for:

- source-order versus musical-onset order,
- normal note/rest cursor advancement,
- `backup` cursor rewind,
- `forward` cursor advance,
- source `<chord/>` onset reuse without additional cursor advancement,
- voice preservation as a bounded string,
- staff 1–2 projection,
- inherited but measure-stable divisions/time signature,
- deterministic source IDs/provenance,
- note/rest/pitch/tie source facts,
- existing ProcessingBudget/deadline/cancellation reuse,
- fail-closed unsupported or malformed source conditions.

PA-2.1 itself is documentation-only; corresponding internal runtime slices are implemented through PA-2.5 and hardened/verified through PA-2.8. PA-3 consumes validated `PolyphonicSourceModel 1.0.0`; PA-4 adds explicit arrangement-decision records; PA-5 adds deterministic source analysis; PA-6 adds deterministic reduction execution; PA-7 adds deterministic voicing candidates. These gates still do not add package-root exports or public polyphonic conversion.

## PA-1 closure record

PA-1 was recovered from historical divergent work onto a fresh branch based on the then-current `main`, hardened with fail-closed negative tests, independently reviewed and rebase-merged through PR #73. The final P2 aggregate-event-budget finding was reproduced red-first, fixed before per-event validation/allocation, re-reviewed, and its review thread resolved before merge.

The approved recovery sequence was completed:

```text
read-only historical PA-1 diff
      ↓
current-main contract compatibility review
      ↓
exact PA-1 file scope
      ↓
fresh recovery branch from current main
      ↓
focused + negative/fail-closed tests
      ↓
full repository regression
      ↓
monophonic compatibility evidence
      ↓
GitHub-hosted CI
      ↓
independent review
      ↓
rebase merge
      ↓
post-merge Tests #488
      ↓
content-equivalence check + branch cleanup
```

That historical cleanup authorizes only the completed PA-1 branch cleanup. Cleanup of PA-7 or documentation branches remains separately gated.

## High-risk controls

High-risk areas include the current monophonic projection, `convertMusicXmlToCanonicalTab()`, `CanonicalMusicDocument`, `CanonicalTabResult 1.0.0`, deterministic monophonic optimizer, package-root public API, writer authority and physical validation rules.

Before any approved high-risk integration change, require exact baseline identification, focused tests, negative/fail-closed tests, full regression, monophonic E2E compatibility, deterministic-output comparison where applicable, GitHub-hosted required CI and separate merge approval.

If existing supported monophonic inputs change unexpectedly, the gate fails.

## PA-0 through PA-7 boundary

PA-0 remains architecture/documentation. PA-1 adds only internal source truth. PA-2 projects/hardens supported polyphonic source facts. PA-3 adds source simultaneity. PA-4 adds explicit arrangement-decision/provenance. PA-5 adds deterministic onset-local register analysis. PA-6 executes the approved reduction/octave subset. PA-7 adds deterministic distinct-string standard-guitar voicing alternatives.

None of these gates adds package-root polyphonic exports, public polyphonic conversion, left-hand finger/barre/hand-position authority, full Physical Playability Validator v2 approval, final arrangement optimization, output-format authority or application behavior.

## Early-PA acceptance invariants

The documentation and runtime must consistently state that current monophonic conversion remains the only public conversion scope, current learning/shadow systems are non-authoritative, polyphonic arrangement is separately gated, current monophonic rejection rules remain intact, the polyphonic path is parallel and separately versioned, original MusicXML remains immutable source truth, arrangement transformations require provenance, `CanonicalTabResult 1.0.0` and public APIs are unchanged through PA-7, PA-7 candidates are not left-hand/full-playability/final-selection authority, and future high-risk integration requires regression/E2E/CI evidence plus separate approval.

PA-7 closure evidence does not constitute a real execution of previously uploaded Audiveris/Scarlatti MusicXML through the PA-7 runtime layer, and it does not verify MuseScore round-trip, production playback, PDF rendering, PA-8 left-hand modeling or public polyphonic conversion. Compatibility workflow success must not be interpreted as production playback readiness.

See `docs/pa-7-closure.md` for the exact PA-7 merge/evidence record, `docs/pa-7-guitar-voicing-candidate-contract.md` for the detailed PA-7 contract, and the earlier PA closure/contract documents for audit history.