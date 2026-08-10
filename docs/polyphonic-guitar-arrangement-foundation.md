# Polyphonic MusicXML → Guitar Arrangement Foundation

## Status

- Planning gate: `PA-0`
- Status: `DOCUMENTATION_ONLY`
- Runtime implementation: **not started**
- Public API changes: **none**
- `CanonicalTabResult 1.0.0` changes: **none**
- Existing monophonic conversion changes: **none**

This document defines the approved architectural direction for extending the existing monophonic MusicXML-to-Guitar-TAB engine toward a separately gated polyphonic guitar-arrangement path.

PA-0 is documentation and contract planning only. Nothing in this document makes multi-staff, multi-voice, chord, barre, or polyphonic conversion a current capability.

## Architectural objective

The long-term target is to support source scores such as piano MusicXML that may contain two staves, multiple voices, and simultaneous notes, then create an explicit guitar arrangement before physical string/fret selection.

```text
Polyphonic / piano MusicXML
        ↓
secure XML parse
        ↓
polyphonic source projection
        ↓
source-score analysis
        ↓
GuitarArrangementPlan
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

During PA-0 through the early polyphonic foundation gates, the existing public `convertMusicXmlToCanonicalTab()` behavior is a protected compatibility baseline.

The current public path continues to fail closed for chords, multiple voices, multiple staves, and multipart scores. Future arrangement work must not make that path permissive.

## Safe parallel extension point

`ParsedMusicXmlDocument 1.0.0` is the planned branching point because it is an immutable XML representation created after XML safety/resource enforcement and before guitar fingering decisions.

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
       existing monophonic        future polyphonic
           projection                projection
               │                         │
               ▼                         ▼
     CanonicalMusicDocument      PolyphonicSourceModel
               │                         │
               │                         ▼
               │               GuitarArrangementPlan
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

The two projections must remain explicit and separately versioned.

## Initial target musical scope

Early PA work should remain narrow:

- MusicXML `score-partwise`,
- one selected piano-like part,
- one or two staves,
- multiple voices,
- simultaneous/chord note events,
- rests and supported rhythmic timing,
- explicit source identity/location for every projected event.

Deferred to later gates: arbitrary multipart/orchestral reduction, grace-note semantics, tuplets beyond separately reviewed support, compressed `.mxl`, and production AI arrangement authority.

## Source truth and arrangement truth

The original MusicXML remains immutable source truth. A future `GuitarArrangementPlan` must explicitly record arrangement decisions such as:

- `PRESERVED`,
- `OMITTED`,
- `OCTAVE_DISPLACED`,
- `VOICE_REDISTRIBUTED`,
- `CHORD_REDUCED`,
- `REVOICED`,
- `ARPEGGIATED`.

Exact field names and schemas are deferred to a later contract gate. These transformations must never be hidden inside parsing or fingering.

## Authority boundaries

- Parsing establishes source structure/content; it does not decide guitar arrangement.
- Arrangement logic may create explicit alternatives but must preserve source provenance.
- Only the guitar physical layer determines physical string/fret/left-hand validity.
- Writers serialize an approved canonical result and must not perform arrangement or rerun optimization.
- Teacher review may approve pedagogical choices but cannot override physical impossibility.

## Canonical result compatibility

`CanonicalTabResult 1.0.0` is unchanged during early PA gates. Chord/polyphonic fields must not be inserted into v1 merely to avoid a new contract.

A later compatibility gate will decide whether a backward-compatible adapter is sufficient or whether a separately versioned chord-aware result contract is required.

## AI boundary

Current LR-S0 remains shadow-only and applies to existing physically valid monophonic candidate sets. Future arrangement AI is a separate domain and must begin shadow-only after separately approved dataset, provenance, lawful-use/privacy, model-lifecycle, and independent-evaluation gates.

AI must not alter the original MusicXML artifact, bypass source validation, fabricate source notes or physical guitar positions, bypass physical validation, or silently change canonical output.

## Safe development gates

| Gate | Scope | Runtime authority |
|---|---|---|
| `PA-0` | Documentation + architecture planning | none |
| `PA-1` | `PolyphonicSourceModel 1.0` contract | internal only |
| `PA-2` | `ParsedMusicXmlDocument` → polyphonic projection | parallel internal path |
| `PA-3` | Simultaneous-event / chord contract | internal only |
| `PA-4` | Arrangement-decision + provenance contract | internal only |
| `PA-5` | Deterministic melody/bass/voice analysis | internal only |
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

Completion of one gate does not authorize later gates.

## High-risk controls

High-risk areas include the current monophonic projection, `convertMusicXmlToCanonicalTab()`, `CanonicalMusicDocument`, `CanonicalTabResult 1.0.0`, the deterministic monophonic optimizer, package-root public API, writer authority, and physical validation rules.

Before any approved high-risk integration change, require exact baseline identification, focused tests, negative/fail-closed tests, full regression, monophonic E2E compatibility, deterministic-output comparison where applicable, GitHub-hosted required CI, and separate merge approval.

If existing supported monophonic inputs change unexpectedly, the gate fails.

## PA-0 boundary

PA-0 may update documentation only: `README.md`, `AI_CONTEXT.md`, `docs/current-status.md`, `docs/package-status.md`, `docs/ARCHITECTURE.md`, and this document.

PA-0 must not modify `src/**`, `tests/**`, `schemas/**`, package metadata/lockfiles, workflows, `Integration Contract v1`, public exports, or runtime conversion behavior.

## PA-0 acceptance criteria

PA-0 documentation must consistently state that current monophonic conversion remains the only public conversion scope, LR-S0 is merged but non-authoritative, polyphonic arrangement is planned rather than implemented, current monophonic rejection rules remain intact, the polyphonic path is parallel and separately versioned, original MusicXML remains immutable source truth, arrangement transformations require provenance, `CanonicalTabResult 1.0.0` and public APIs are unchanged, and future high-risk integration requires regression/E2E/CI evidence plus separate approval.
