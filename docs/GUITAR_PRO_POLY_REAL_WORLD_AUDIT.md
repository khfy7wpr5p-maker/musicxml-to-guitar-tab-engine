# Guitar Pro safe ingestion + direction compatibility — real-corpus result

**Date:** 2026-08-30
**Engine revision under test:** `f125e895365953aaef816527cefb0edba64bb1cb` (feature branch)
**Production entrypoint:** `processMusicXmlUpload()`

## Corpus and boundary

Nine uploaded XML files were used only from the local/external corpus and were not committed. The JSON artifact records hashes, sizes, producer evidence, structural profiles and results—not score bodies. All 9/9 contain `<software>Guitar Pro 7.6.0</software>`, are `score-partwise version="2.0"`, and use the exact bounded declaration:

`<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 2.0 Partwise//EN' 'http://www.musicxml.org/dtds/2.0/partwise.dtd'>`

For each file, lexical inspection found exactly one DOCTYPE, no internal subset, no entity declaration, no parameter entity, no external general entity declaration, and no non-predefined entity reference. The source score body is not edited: the safety normalizer removes only the matched declaration before parsing. No DTD, entity, network URL, or local path is resolved.

## Implemented bounded changes

- **FIX-A — safe ingestion:** accepts only the exact MusicXML 2.0 `score-partwise` PUBLIC/SYSTEM identity above, then removes that declaration. Existing 3.1/4.0.3 handling remains. Internal subsets, entities, duplicate/malformed declarations, root mismatch, unknown versions/identifiers, `file://`, alternate hosts and deceptive suffixes remain `UNSAFE_XML_DECLARATION`.
- **FIX-B — direction compatibility:** accepts only the observed Guitar Pro display metronome form (`directive="yes"`; `parentheses="no"`; bounded numeric `default-y`; exact beat-unit/per-minute and matching sound tempo) and standalone `p`/`mf`/`f` dynamics. Both are retained as explicit ignored-feature provenance. Offset, octave-shift, navigation sound, unbounded dynamics and invalid layout stay fail-closed.

## Production funnel (original files; no diagnostic copy)

| Stage | Files remaining |
|---|---:|
| Original corpus | 9 |
| XML safety accepted | 9 |
| POLY_V2 route reached | 8 |
| Strict projector reached | 1 |
| Sustained/physical solver reached | 0 |
| POLY_V2 PASS | 0 |
| Legitimate BLOCKED | 7 |
| Accidental BLOCKED | 2 |

| File | Route | Exact first remaining blocker | Projector | Solver | Classification |
|---|---|---|---|---|---|
| [Air]てんとう虫(瓢虫).xml | POLY_V2 | staff-details | no | no | LEGITIMATE_BLOCKED |
| [Air]回想录.xml | POLY_V2 | staff-details | no | no | LEGITIMATE_BLOCKED |
| [Air]夢語り.xml | POLY_V2 | UNPLAYABLE_SOURCE_PITCH | yes | no | LEGITIMATE_BLOCKED |
| [Air]银色.xml | POLY_V2 | staff-details | no | no | LEGITIMATE_BLOCKED |
| [Air]鸟之诗.xml | POLY_V2 | notation:technical | no | no | LEGITIMATE_BLOCKED |
| [Angel Beats!]Brave Song.xml | POLY_V2 | staff-details | no | no | LEGITIMATE_BLOCKED |
| [Angel Beats!]一番の宝物.xml | UNRESOLVED | XML_ELEMENT_LIMIT_EXCEEDED | no | no | LEGITIMATE_BLOCKED |
| [Beck]Face.xml | POLY_V2 | note-child:play | no | no | ACCIDENTAL_BLOCKED |
| [CLANNAD]メグメル(幻想).xml | POLY_V2 | note-child:play | no | no | ACCIDENTAL_BLOCKED |

All 9 original inputs were run twice and were deterministic: same status, route, reason and result digest. No MONO_V1 result was counted as a POLY success.

## Before / after this change

| Metric | Before | After |
|---|---:|---:|
| XML safety accepted | 0 | 9 |
| POLY_V2 route reached | 0 | 8 |
| Strict projector reached | 0 | 1 |
| Sustained solver reached | 0 | 0 |
| POLY_V2 PASS | 0 | 0 |
| BLOCKED | 9 | 9 |
| accidental BLOCKED | 4 (direction) | 2 |

The four former direction-blocked files now pass direction normalization and expose their next concrete blockers: F1 below range (one), a harmonic technical semantic (one), and `<play><mute>straight</mute></play>` provenance (two). No solver behavior was changed or inferred.

## Remaining real BLOCKED

| Primary root cause | Files | Classification |
|---|---:|---|
| Capo/custom tuning in `staff-details` | 4 | LEGITIMATE_BLOCKED |
| XML 100,000-element resource boundary | 1 | LEGITIMATE_BLOCKED |
| Explicit F1 / MIDI 29 outside standard guitar range | 1 | LEGITIMATE_BLOCKED |
| Harmonic `notation/technical` semantic | 1 | LEGITIMATE_BLOCKED |
| `play/mute=straight` provenance representation | 2 | ACCIDENTAL_BLOCKED |

## ✅ Tamamlandı

- Feature branch implementation and production-entrypoint real-corpus rerun.
- Exact bounded DTD compatibility with external DTD/entity resolution disabled.
- Bounded, timing-neutral Guitar Pro direction normalization plus hostile direction regression tests.
- Original corpus determinism verified 9/9.

## ⚠️ Kalan gerçek BLOCKED

All nine remain BLOCKED, but for explicit post-ingestion reasons above. The scope intentionally leaves capo/custom tuning, the XML resource limit, technical harmonic semantics, source-pitch range policy and solver behavior unchanged.

## ❌ Bilinçli olarak yapılmayanlar

- Capo/custom-tuning implementation; XML resource-limit relaxation; solver rewrite.
- External DTD/entity resolution, entity expansion, network/file access, or semantic guessing.

REAL GUITAR PRO RESULT: 0 / 9 POLY_V2 PASS

REACH SOLVER: 0 / 9

LEGITIMATE BLOCKED: 7 / 9

ACCIDENTAL BLOCKED: 2 / 9

SECURITY: EXTERNAL DTD/ENTITY RESOLUTION DISABLED
