# Guitar Pro safe ingestion + direction compatibility — real-corpus result

> **HISTORY / SUPERSEDED CURRENT STATUS**  
> This document is an exact historical audit of engine revision `f125e895365953aaef816527cefb0edba64bb1cb` on 2026-08-30. Its blocker table and `0 / 9 POLY_V2 PASS` result are **not** the current production status. Later generic compatibility/sustain work through PR #261 cleared the tracked Air path to deterministic POLY_V2 PASS without filename/SHA dispatch. Preserve this file as evidence only; use [`current-status.md`](current-status.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) for live behavior.

**Date:** 2026-08-30
**Engine revision under test:** `f125e895365953aaef816527cefb0edba64bb1cb` (feature branch)
**Production entrypoint:** `processMusicXmlUpload()`

## Corpus and boundary

Nine uploaded XML files were used only from the local/external corpus and were not committed. The JSON artifact records hashes, sizes, producer evidence, structural profiles and results—not score bodies. All 9/9 contain `<software>Guitar Pro 7.6.0</software>`, are `score-partwise version="2.0"`, and use the exact bounded declaration:

`<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 2.0 Partwise//EN' 'http://www.musicxml.org/dtds/2.0/partwise.dtd'>`

For each file, lexical inspection found exactly one DOCTYPE, no internal subset, no entity declaration, no parameter entity, no external general entity declaration, and no non-predefined entity reference. The source score body is not edited: the safety normalizer removes only the matched declaration before parsing. No DTD, entity, network URL, or local path is resolved.

## Implemented bounded changes at this historical revision

- **FIX-A — safe ingestion:** accepted only the exact MusicXML 2.0 `score-partwise` PUBLIC/SYSTEM identity above, then removed that declaration. Existing 3.1/4.0.3 handling remained. Internal subsets, entities, duplicate/malformed declarations, root mismatch, unknown versions/identifiers, `file://`, alternate hosts and deceptive suffixes remained `UNSAFE_XML_DECLARATION`.
- **FIX-B — direction compatibility:** accepted only the observed Guitar Pro display metronome form (`directive="yes"`; `parentheses="no"`; bounded numeric `default-y`; exact beat-unit/per-minute and matching sound tempo) and standalone `p`/`mf`/`f` dynamics. Both were retained as explicit ignored-feature provenance.

## Historical production funnel

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

All nine original inputs were run twice and were deterministic at this revision. No MONO_V1 result was counted as a POLY success.

## Historical conclusion

This audit proved the ingestion/direction compatibility changes at the named revision and exposed the next blockers existing **at that time**. Later work must not be evaluated against this table as though it were live state.

The enduring evidence rules remain valid:

- corpus source files are external regression evidence;
- source bytes must remain immutable;
- repeat runs must be deterministic;
- a newly exposed blocker must be classified rather than guessed around;
- production code must not branch on corpus filename or SHA;
- external DTD/entity resolution remains disabled.
