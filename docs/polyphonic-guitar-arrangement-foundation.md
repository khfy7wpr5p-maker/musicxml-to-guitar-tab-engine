# Polyphonic MusicXML → Guitar Arrangement Foundation

## Status

- Planning gate: `PA-0`
- PA-0 status: `DOCUMENTATION_ONLY` architecture foundation merged
- PA-1 `PolyphonicSourceModel 1.0.0`: `MERGED_INTERNAL`
- PA-1 merge: PR #73, rebase-merged to `main` on 2026-08-11
- Current PA-1-bearing `main` head at PA-2.0 convergence: `2260ea071c08ef07a99a2dc577baa17c4d6dd08a`
- Post-merge Tests #488: `SUCCESS`
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
- PA-4 runtime closure baseline on `main`: `a04f37f84bc825580cadfd972de30ad4c7b206cb`
- closure tree: `59675efbbc00d88e836e58331dc16cc9bcf5ceb9`
- PA-4 exact-head Tests #633: `SUCCESS`
- PA-4 exact-head MusicXML Compatibility #451: `SUCCESS`
- PA-4 post-merge Tests #634 on `main`: `SUCCESS`
- PA-4 independent final review: no remaining P1/P2 blocker found
- next separately approved polyphonic gate: PA-5 deterministic melody/bass/voice analysis
- Current merged public polyphonic runtime: **not implemented**
- Public API changes: **none**
- `CanonicalTabResult 1.0.0` changes: **none**
- Existing monophonic conversion changes: **none**
- Real uploaded-file PA-4 E2E: **not executed**

PA-1 is present on the authoritative runtime line as an internal source-truth foundation. Its recovery branch was removed only after the rebase merge and a read-only content-equivalence check. PA-1 does not expose polyphonic conversion publicly.

PA-2.1 defines the projection contract between `ParsedMusicXmlDocument 1.0.0` and `PolyphonicSourceModel 1.0.0`. PA-2.2 supplies merged red-first vectors. PA-2.3 implements the minimal internal basic one-voice/staff-1 note/rest slice, PA-2.4 adds `backup` / `forward` cursor semantics, PA-2.5 adds source `<chord/>`, multiple bounded voices and staff 1–2 projection, PA-2.6 adds hostile/budget/deadline/cancellation negative evidence, PA-2.7 verifies full regression/monophonic compatibility, and PA-2.8 verifies GitHub CI plus independent review. PA-3 adds deterministic source simultaneity grouping through `SimultaneousEventModel 1.0.0`. PA-4 adds deterministic arrangement-decision/provenance representation through `GuitarArrangementPlan 1.0.0`. These remain internal and do not expose public polyphonic conversion or authorize PA-5 behavior.

This document defines the approved architectural direction for extending the existing monophonic MusicXML-to-Guitar-TAB engine toward a separately gated polyphonic guitar-arrangement path.

Nothing in PA-0 through PA-4 makes multi-staff, multi-voice, chord, barre, or polyphonic conversion a current public capability.

## Architectural objective

The long-term target is to support source scores such as piano MusicXML that may contain two staves, multiple voices, and simultaneous notes, then create an explicit guitar arrangement before physical string/fret selection.

```text
Polyphonic / piano MusicXML
        ↓
secure XML parse
        ↓
polyphonic source projection
        ↓
source simultaneity grouping
        ↓
GuitarArrangementPlan 1.0.0
        ↓
PA-5 source-score melody/bass/voice analysis
        ↓
PA-6 deterministic reduction/octave rules
        ↓
guitar-compatible musical score
        ↓
chord / left-hand candidate model
        ↓
physical playability validator v2
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

Throughout PA-0 through PA-4 closure, the existing public `convertMusicXmlToCanonicalTab()` behavior remains the protected compatibility baseline.

The current public path continues to fail closed for chords, multiple voices, multiple staves, and multipart scores. Future arrangement work must not make that path permissive.

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
               │               PA-5 source-score analysis
               │                         │
               │                         ▼
               │               PA-6 reduction/octave rules
               │                         │
               │                         ▼
               │             Guitar-Compatible Score
               │                         │
               │                         ▼
               │              Chord / Left-Hand Model
               │                         │
               │                         ▼
               │              Playability Validator v2
               │                         │
               └───────────────┐         │
                               ▼         ▼
                          reviewed TAB-result gate
```

The two projections remain explicit and separately versioned. PA-2.1 specifies the right-hand projection contract; its internal runtime slices are merged through PA-2.5 and the PA-2.6–PA-2.8 hardening/verification sequence is closed. PA-3 adds a distinct versioned internal source-simultaneity view after `PolyphonicSourceModel 1.0.0`. PA-4 then adds a distinct internal arrangement-decision/provenance record. Neither layer changes public monophonic conversion or creates guitar fingering authority.

## Initial target musical scope

Early PA work remains narrow:

- MusicXML `score-partwise`,
- one selected piano-like part,
- one or two staves,
- multiple voices,
- simultaneous/chord note events,
- rests and supported rhythmic timing,
- explicit source identity/location for every projected event.

Deferred to later gates: arbitrary multipart/orchestral reduction, grace-note semantics, tuplets beyond separately reviewed support, compressed `.mxl`, and production AI arrangement authority.

## Source truth and arrangement truth

The original MusicXML remains immutable source truth. PA-3 adds only a deterministic derived source grouping of notes sharing exact measure/onset.

PA-4 `GuitarArrangementPlan 1.0.0` records an **already-chosen** arrangement decision using the fixed decision vocabulary:

- `PRESERVED`,
- `OMITTED`,
- `OCTAVE_DISPLACED`,
- `VOICE_REDISTRIBUTED`,
- `CHORD_REDUCED`,
- `REVOICED`,
- `ARPEGGIATED`.

PA-4 requires complete exactly-once source-note coverage. Single-note decisions reference exactly one source note and no source-group ID. Group decisions bind the exact source-event membership and deterministic group ID of one PA-3 simultaneous group. Decision/member ordering is canonical source order. Unknown, duplicate, overlapping, missing or non-note references fail closed.

PA-4 records decision type and provenance only. It does **not** decide which action should be selected automatically and does not yet encode target octave/voice, surviving chord tones, generated revoiced pitches, arpeggio timing, guitar strings/frets/fingers/barres or left-hand shapes. Those executable semantics remain later gates.

These transformations must never be hidden inside parsing, PA-3 grouping, or fingering.

## Authority boundaries

- Parsing establishes source structure/content; it does not decide guitar arrangement.
- PA-3 grouping establishes which source note events are simultaneous by exact onset; it does not decide a guitar voicing or arrangement.
- PA-4 establishes an immutable explicit arrangement-decision/provenance record; it does not choose policy or execute the transformation.
- PA-5 may add separately approved deterministic melody/bass/voice analysis but is not authorized by PA-4 closure.
- Arrangement logic may create explicit alternatives only in later approved gates and must preserve source provenance.
- Only the guitar physical layer determines physical string/fret/left-hand validity.
- Writers serialize an approved canonical result and must not perform arrangement or rerun optimization.
- Teacher review may approve pedagogical choices but cannot override physical impossibility.

## Canonical result compatibility

`CanonicalTabResult 1.0.0` remains unchanged through PA-4. Chord/polyphonic fields must not be inserted into v1 merely to avoid a new contract.

A later PA-10 compatibility gate will decide whether a backward-compatible adapter is sufficient or whether a separately versioned chord-aware result contract is required.

## AI boundary

Current LR-S0 remains shadow-only and applies to existing physically valid monophonic candidate sets. Future arrangement AI is a separate domain and must begin shadow-only after separately approved dataset, provenance, lawful-use/privacy, model-lifecycle, and independent-evaluation gates.

AI must not alter the original MusicXML artifact, bypass source validation, fabricate source notes or physical guitar positions, bypass physical validation, or silently change canonical output.

PA-4 is not an AI decision layer. Its existence does not authorize a learned system to populate or override arrangement decisions.

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
| `PA-4` | `GuitarArrangementPlan 1.0.0` arrangement-decision + provenance contract | merged internal through PR #87; explicit record only, no automatic policy/public authority |
| `PA-5` | Deterministic melody/bass/voice analysis | next separate gate; internal only after explicit approval |
| `PA-6` | Deterministic reduction / octave rules | internal only |
| `PA-7` | Guitar chord/voicing candidate generation | internal only |
| `PA-8` | Left-hand shape, finger assignment, barre/partial-barre | internal only |
| `PA-9` | Physical Playability Validator v2 | internal only |
| `PA-10` | Canonical result v1/v2 compatibility review | separate architecture approval |
| `PA-11` | Teacher-approved arrangement benchmark | evaluation only |
| `PA-12` | Internal polyphonic E2E + monophonic compatibility | no public activation |
| `PA-13` | Public arrangement API review | separate public-contract approval |
| `PA-14` | ScoreMosaic/SesliTab adapter integration | external adapter only |
| `AI-A1+` | Learned arrangement ranking | shadow-first, separately gated |

Completion of one gate does not authorize later gates. Completion of PA-4 does not authorize PA-5.

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

PA-2.1 itself is documentation-only; the corresponding internal runtime slices are implemented through PA-2.5 and hardened/verified through PA-2.8. PA-3 consumes the resulting validated `PolyphonicSourceModel 1.0.0` and adds only source simultaneity grouping. PA-4 consumes validated source truth, recomputes PA-3 grouping internally for provenance, and adds only explicit arrangement-decision records. These gates still do not add package exports, public polyphonic conversion, guitar fingering, or canonical-result changes.

## PA-1 closure record

PA-1 was recovered from the historical divergent work onto a fresh branch based on the then-current `main`, hardened with fail-closed negative tests, independently reviewed, and rebase-merged through PR #73. The final P2 aggregate-event-budget finding was reproduced red-first, fixed before per-event validation/allocation, re-reviewed, and its review thread resolved before merge.

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

This closure authorizes only the internal PA-1 foundation. Later PA gates remain separately gated.

## High-risk controls

High-risk areas include the current monophonic projection, `convertMusicXmlToCanonicalTab()`, `CanonicalMusicDocument`, `CanonicalTabResult 1.0.0`, the deterministic monophonic optimizer, package-root public API, writer authority, and physical validation rules.

Before any approved high-risk integration change, require exact baseline identification, focused tests, negative/fail-closed tests, full regression, monophonic E2E compatibility, deterministic-output comparison where applicable, GitHub-hosted required CI, and separate merge approval.

If existing supported monophonic inputs change unexpectedly, the gate fails.

## PA-0 / PA-1 / PA-2 / PA-3 / PA-4 boundary

PA-0 remains architecture/documentation. PA-1 adds only the internal `PolyphonicSourceModel 1.0.0` source-truth foundation. PA-2.1 is merged documentation-only and adds only a projection contract. PA-2.3 through PA-2.5 implement internal projection slices under that contract, PA-2.6 adds tests-only hardening evidence, and PA-2.7/PA-2.8 close regression/CI/review. PA-3 adds only the internal `SimultaneousEventModel 1.0.0` source-simultaneity layer. PA-4 adds only the internal `GuitarArrangementPlan 1.0.0` arrangement-decision/provenance representation. None of these gates adds package exports, public polyphonic conversion, executable arrangement transformation, guitar fingering authority, output-format changes, or application behavior.

## Early-PA acceptance invariants

The documentation and runtime must consistently state that current monophonic conversion remains the only public conversion scope, current learning/shadow systems are non-authoritative, polyphonic arrangement is separately gated, current monophonic rejection rules remain intact, the polyphonic path is parallel and separately versioned, original MusicXML remains immutable source truth, arrangement transformations require provenance, `CanonicalTabResult 1.0.0` and public APIs are unchanged through PA-4, and future high-risk integration requires regression/E2E/CI evidence plus separate approval.

PA-4 closure evidence does not constitute a real execution of previously uploaded Audiveris/Scarlatti MusicXML through the PA-4 runtime layer, and it does not verify MuseScore round-trip, production playback, PDF rendering, PA-5 analysis, or public polyphonic conversion.

See `docs/pa-4-closure.md` for the exact PA-4 merge/evidence record and `docs/pa-4-arrangement-decision-provenance-contract.md` for the detailed PA-4 contract.