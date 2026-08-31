# Sustained Polyphony Architecture

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

Status: ACTIVE INTERNAL/APPLICATION ARCHITECTURE / NON-PACKAGE-ROOT

This document describes the current sustained-note path. Earlier versions of this file described PS-3/PS-4/PS-5 as future work; that status is superseded by the merged implementation now used by the canonical-v2 sustained fallback.

## Stage map

```text
PolyphonicSourceModel
  ↓
PS-2 SustainTieGraph 1.2.0
  ↓
PS-3 logical sustain/tie continuity
  ↓
PS-4A Active Sonority Model
  ↓
PS-4B/position-state candidate construction
  ↓
PS-4C Sustained Left-Hand Physical State Model
      ├─ shared PA-8 finger/barre enumerator
      └─ shared PA-9 static physical validator
  ↓
sustained transition model / path solver
  ↓
PA-12 sustained canonical final selection
  ↓
CanonicalTabResult 2.0.0
```

The ordinary deterministic selector remains the first path. `src/tab/canonicalTabResultV2.js` routes only the specifically recognized retained-sustain/tie unsupported cases to the sustained selector. This is not a general catch-all fallback.

## PS-2 — source-derived sustain facts

`src/music/sustainTieGraph.js` derives immutable chains from exact source identity `(staff, voice, MIDI pitch, written pitch)`. The contract supports ordinary source ties and the bounded exact contiguous closed-stop representation documented in [`ps-sustain-tie-graph-contract.md`](ps-sustain-tie-graph-contract.md).

A true orphan stop, mismatch, non-contiguous continuation, ambiguous start, or unterminated chain remains fail-closed. PS-2 never synthesizes a source tie or note.

## PS-3 — logical continuity

Logical continuity follows sealed PS-2 chain order. Every non-final chain segment keeps the same logical note active through the successor. The final segment releases it. This avoids treating a representation-level closed-stop boundary as a new independent musical attack while preserving raw source flags unchanged.

## PS-4A — active sonority

The active-sonority layer turns source attacks plus sustained holds/releases into ordered time points. A note may therefore remain active at later sonority points without being re-attacked.

Same-voice MusicXML `<chord/>` members are not independent voice events. They belong to one validated attack group. The source-lane occupancy bound is nevertheless the maximum member end; a later independent non-chord event before that bound is invalid overlap, not a chord.

## PS-4C / PA-8 / PA-9 — physical state

`src/music/sustainedLeftHandPhysicalStateModel.js` consumes exact sustained position states, adapts them to the shared PA-8 enumerator, validates with PA-9, and converts only provenance-consistent playable shapes back into sustained physical candidates.

The PA-8 numerical ceilings are shared and unchanged:

- 20,000 shape candidates;
- 100,000 complete assignment attempts.

On this sustained path, the enforcement window is reset exactly once per PS-4A sonority point. Ordered position states inside that point share the point's fixed window. Earlier points cannot exhaust a later point's window. Aggregate counters are reporting only.

## Transition / path solver

The sustained transition/path stages choose among already constructed physically valid states. They do not gain authority to mutate source musical facts. Candidate traversal, physical rules, ranking/cost, and deterministic tie-break remain separate contracts and are not compatibility-normalization levers.

## Canonical final selection

`src/music/sustainedCanonicalFinalSelector.js` requires exact preserved projection for retained notes. It does not authorize a source pitch transformation or octave shift to make the score fit the guitar.

Before sustained selection it validates same-source-lane occupancy:

- exact `<chord/>` members are one attack group;
- chord members extend occupancy to the maximum member end;
- a later independent non-chord attack before that end throws `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` with reason `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`.

No implicit voice split is created.

## Cross-cutting invariants

The sustained path preserves:

- immutable source bytes and source facts;
- deep immutability of derived authoritative models;
- deterministic output;
- bounded resource use;
- shared runtime deadline/cancellation;
- fail-closed ambiguity/unsupported semantics;
- no filename/SHA special cases;
- no semantic guessing;
- no learned/shadow ranking authority;
- package-root API isolation.

## Relationship to real corpus

Real Guitar Pro corpus runs are regression evidence. They can prove that a generic representation contract is needed and can verify source-byte immutability/determinism after implementation. They are never runtime dispatch keys.

For live repository status see [`current-status.md`](current-status.md). Historical PS closure records remain evidence for the revision/stage they describe.
