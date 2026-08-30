# Guitar Pro harmonic + play provenance post-#225 audit

Nine uploaded Guitar Pro 7.6.0 MusicXML 2.0 files were re-run twice through `processMusicXmlUpload()`. They remain external-only and are not committed. Their SHA-256 values match the #225 baseline artifact.

## Forensics before the change

| Corpus file | Exact structure | Proven impact |
|---|---|---|
| `[Air]鸟之诗.xml` | `<technical><harmonic/></technical>`, optionally followed by explicit `<string>` and `<fret>` | Empty, attribute-free harmonic marker; no natural/artificial, sounding-pitch, timing or position transformation is supplied. |
| `[Beck]Face.xml`, `[CLANNAD]メグメル(幻想).xml` | `<play><mute>straight</mute></play>` | Attribute-free, one-child note-level performance/timbre provenance; no pitch, onset, duration, voice, staff or tie authority. |

## Bounded normalization

- Empty, attribute-free `technical/harmonic` is accepted only beside the existing bounded `string`/`fret` profile and is recorded as `notation:technical:harmonic-provenance`.
- Only attribute-free `play > mute` with exact text `straight` is accepted and recorded as `note:play:straight-mute-provenance`.
- No note, pitch, octave, duration, onset, voice, staff, tie, chord membership, grace identity, or technical string/fret source fact is synthesized or changed. Production-entrypoint regression tests compare those facts against the same source without this metadata.
- Non-empty harmonic, unknown mute, duplicate mute, unknown play children, attributes and foreign technical children remain blocked.

## Original-corpus funnel

| Metric | #225 baseline | Post-fix |
|---|---:|---:|
| XML safety accepted | 9/9 | 9/9 |
| POLY route reached | 8/9 | 8/9 |
| Strict projector reached | 1/9 | 1/9 |
| Sustained solver reached | 0/9 | 0/9 |
| POLY_V2 PASS | 0/9 | 0/9 |
| Target accidental blockers visible | 2/9 | 0/9 |

## Newly visible blockers

| File | Exact next blocker | Classification | Layer |
|---|---|---|---|
| `[Air]鸟之诗.xml` | `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE: notation:technical` caused by `hammer-on` after accepted empty harmonic markers | UNKNOWN_NEEDS_REVIEW | runtime compatibility normalizer |
| `[CLANNAD]メグメル(幻想).xml` | `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE: notation:technical` caused by artificial harmonic structures containing base/touching/sounding pitch | LEGITIMATE_BLOCKED | runtime compatibility normalizer |
| `[Beck]Face.xml` | `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE: direction` caused by rehearsal text after accepted straight-mute entries | ACCIDENTAL_BLOCKED, outside this PR | runtime compatibility normalizer |

Unchanged blockers: 4 `staff-details` capo/custom-tuning files, one `XML_ELEMENT_LIMIT_EXCEEDED` file, and the explicit F1 `UNPLAYABLE_SOURCE_PITCH` file. No solver, candidate-generation, physical-guitar, sustain, tie, grace, capo/tuning, F1 or XML resource-limit behavior changed.

## Verification

- Focused runtime/POLY/XML security/sustained/grace tests: 46/46 PASS.
- Full suite: 1203/1203 PASS.
- Original files: two equivalent runs each; 9/9 deterministic.
