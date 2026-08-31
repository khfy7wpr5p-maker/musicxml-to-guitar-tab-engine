# Guitar Pro harmonic + play provenance post-#225 audit

> **HISTORY / SUPERSEDED CURRENT STATUS**  
> This is a revision-specific corpus audit from the post-#225 compatibility stage. Its `0/9 POLY_V2 PASS` totals and named next blockers are historical observations and must not be read as current production status. Subsequent generic compatibility/sustain work through PR #261 superseded the tracked Air blocker chain. Preserve this file as evidence; use [`current-status.md`](current-status.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) for live behavior.

Nine uploaded Guitar Pro 7.6.0 MusicXML 2.0 files were re-run twice through `processMusicXmlUpload()`. They remained external-only and were not committed. Their SHA-256 values matched the #225 baseline artifact.

## Forensics at that revision

| Corpus file | Exact structure | Proven impact |
|---|---|---|
| `[Air]鸟之诗.xml` | `<technical><harmonic/></technical>`, optionally followed by explicit `<string>` and `<fret>` | Empty, attribute-free harmonic marker; no natural/artificial, sounding-pitch, timing or position transformation was supplied. |
| `[Beck]Face.xml`, `[CLANNAD]メグメル(幻想).xml` | `<play><mute>straight</mute></play>` | Attribute-free, one-child note-level performance/timbre provenance; no pitch, onset, duration, voice, staff or tie authority. |

## Bounded normalization established by this historical stage

- Empty, attribute-free `technical/harmonic` was accepted only beside the bounded `string`/`fret` profile and recorded as `notation:technical:harmonic-provenance`.
- Only attribute-free `play > mute` with exact text `straight` was accepted and recorded as `note:play:straight-mute-provenance`.
- No note, pitch, octave, duration, onset, voice, staff, tie, chord membership, grace identity, or technical string/fret source fact was synthesized or changed.
- Non-empty harmonic, unknown mute, duplicate mute, unknown play children, attributes, and foreign technical children remained blocked.

## Historical corpus funnel

| Metric | #225 baseline | Post-fix |
|---|---:|---:|
| XML safety accepted | 9/9 | 9/9 |
| POLY route reached | 8/9 | 8/9 |
| Strict projector reached | 1/9 | 1/9 |
| Sustained solver reached | 0/9 | 0/9 |
| POLY_V2 PASS | 0/9 | 0/9 |
| Target accidental blockers visible | 2/9 | 0/9 |

## Blockers newly visible at that revision

| File | Exact next blocker | Classification | Layer |
|---|---|---|---|
| `[Air]鸟之诗.xml` | `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE: notation:technical` caused by `hammer-on` after accepted empty harmonic markers | UNKNOWN_NEEDS_REVIEW | runtime compatibility normalizer |
| `[CLANNAD]メグメル(幻想).xml` | `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE: notation:technical` caused by artificial harmonic structures containing base/touching/sounding pitch | LEGITIMATE_BLOCKED | runtime compatibility normalizer |
| `[Beck]Face.xml` | `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE: direction` caused by rehearsal text after accepted straight-mute entries | ACCIDENTAL_BLOCKED, outside this historical stage | runtime compatibility normalizer |

Those first-blocker observations were subsequently superseded. They are retained only to show the evidence sequence that led to later generic contracts.

## Historical verification

- Focused runtime/POLY/XML security/sustained/grace tests: 46/46 PASS.
- Full suite: 1203/1203 PASS.
- Original files: two equivalent runs each; 9/9 deterministic.

## Enduring rule

The valid lesson from this audit is methodological, not corpus-specific: source bytes remain immutable, normalization must be bounded and semantics-preserving, newly exposed blockers must be reviewed by shape/meaning, and production code must never branch on corpus filename or SHA.
