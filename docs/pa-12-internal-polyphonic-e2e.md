# PA-12 Internal Polyphonic End-to-End Gate

## Scope

PA-12 is the internal/application integration boundary from bounded MusicXML through the deterministic polyphonic guitar stack to exact `CanonicalTabResult 2.0.0` and internal TAB MusicXML serialization.

It does not expose PA-12 or v2 conversion through the package root. Any broader public polyphonic API remains separately gated.

## Current internal path

```text
raw MusicXML bytes/string
  → shared ProcessingRuntime 1.0.0
  → ParsedMusicXmlDocument 1.0.0
  → representation compatibility normalizers where the application route requires them
  → PolyphonicSourceModel 1.0.0
  → explicit caller-supplied arrangement decisions
  → deterministic reduction
  → ordinary deterministic final selector
      ↘ only recognized retained-sustain/tie unsupported reasons
        PS-2 SustainTieGraph
        → PS-3 logical sustain continuity
        → PS-4A active sonority
        → sustained guitar position states
        → PS-4C shared PA-8 / PA-9 physical enumeration
        → sustained transition/path solver
        → sustained canonical final selector
  → CanonicalTabResult 2.0.0 producer + validator
  → canonical-v2 MusicXML writer
  → MusicXML 4.0 standard-notation + TAB output
```

`src/core/internalPolyphonicConversionPipelineV2.js` reuses one caller/runtime budget across parsing, projection, canonical production, selection, and writer loops. `src/tab/canonicalTabResultV2.js` controls the narrow sustained fallback trigger.

## Arrangement and semantic authority

PA-12 does not invent arrangement decisions. It does not authorize:

- learned/shadow ranking as canonical authority;
- automatic teacher-policy inference;
- candidate deletion/reordering by model scores;
- source pitch/onset/duration/voice/staff/tie/chord rewrite;
- automatic octave shift to make a source playable;
- implicit voice split;
- ambiguous sustain continuation;
- solver ranking override.

Unsupported or ambiguous semantics remain fail-closed.

## Sustain / tie boundary

Sustain handling is no longer described as blanket “retained ties unsupported.” The current boundary is layered and exact:

- PS-2 v1.2.0 builds exact source-derived sustain chains and supports only the reviewed contiguous closed-stop representation;
- a genuine unmatched stop remains `ORPHAN_TIE_STOP` and fails closed;
- PS-3 carries sealed logical continuity;
- PS-4A carries active notes through later sonority points;
- PS-4C performs bounded physical enumeration per sonority point;
- sustained path selection chooses only from exact physically validated states;
- exact preserved projection is required by the sustained canonical selector.

No layer may synthesize missing source semantics.

## Same-voice chord boundary

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE.**

Exact MusicXML `<chord/>` members in the same validated staff/voice lane form one attack group. They are not independent advancing voice events.

The occupancy cursor is extended to the maximum end of all members in that attack group. This is important when a chord member has a longer duration than the anchor.

A later independent non-chord event beginning before that maximum member end remains fail-closed:

```text
code   = UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION
reason = OVERLAPPING_NOTES_WITHIN_ONE_VOICE
```

PA-12 does not invent a voice split to accept that overlap.

## PA-8 resource boundary inside PA-12

PA-8 fixed ceilings remain unchanged:

- 20,000 left-hand shape candidates;
- 100,000 complete finger-assignment attempts.

They are enforced per independently processed group. On the sustained PS-4C path one group is exactly one PS-4A sonority point across its ordered position states. A prior point cannot exhaust a later point's fixed counter window.

This resource-scope correction does not alter candidate order, physical rules, ranking/cost, or tie-break behavior.

## Output boundary

Successful PA-12 conversion returns an immutable envelope containing:

- validated `PolyphonicSourceModel`;
- exact validated `CanonicalTabResult 2.0.0`;
- deterministic canonical-v2 MusicXML.

`src/core/internalPolyphonicConversionPipelineV2.js` keeps a fixed 64 MiB internal MusicXML output boundary. Writers consume canonical selected truth and never rerun final selection.

## Required verification

PA-12 changes must prove, on one exact head as applicable:

1. raw multi-voice MusicXML reaches canonical v2 deterministically;
2. simultaneous independent voices remain separate source lanes/groups;
3. exact same-voice `<chord/>` members remain one attack group;
4. unequal-duration chord occupancy extends to the longest member end;
5. later independent same-voice overlap remains fail-closed with the exact error/reason above;
6. retained sustain/tie paths use sealed PS facts and physically validated states only;
7. every retained note has exact selected string/fret truth;
8. repeated execution yields identical canonical and MusicXML output;
9. one shared `ProcessingRuntime` spans parser through writer;
10. source bytes/model facts are not silently mutated;
11. package-root exports remain unchanged and expose no PA-12/v2 conversion function;
12. required alphaTab/import/render and protected Node.js checks are green;
13. no unresolved P0/P1 review thread remains.

## Non-authority statement

PA-12 proves a bounded deterministic internal/application polyphonic path. It does **not** mean every MusicXML/polyphonic notation is supported, that ambiguous semantics may be guessed, that learned scoring is authoritative, or that product hosting/playback/PDF/persistence/release gates are complete.
