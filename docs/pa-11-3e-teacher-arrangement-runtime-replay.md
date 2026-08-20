# PA-11.3E Teacher Arrangement Runtime Replay

## Status

- Gate: `PA-11`
- Slice: `PA-11.3E`
- Scope: evaluation-only PA-8 / PA-9 runtime replay
- Authority: none
- Current benchmark review state: `proposed`
- Public API / writer / canonical-output change: none
- Production selection authority: none

## Purpose

PA-11.3E converts the earlier seed-only PA-8/PA-9 reproduction test into a reusable fail-closed evaluator boundary.

Before runtime replay, the evaluator requires PA-11.3D source replay to pass. It then reconstructs the current runtime path from the exact bound MusicXML source bytes and each accepted arrangement decision set.

For every stored selected shape it requires:

- the source group to be reproduced by current PA-8;
- the exact target MIDI / string / fret positions to be reproduced by current PA-8;
- the exact finger assignments and deterministic barre facts to be reproduced by current PA-8;
- a corresponding PA-9 verdict for the reproduced runtime shape;
- PA-9 status `PLAYABLE_WITHIN_POLICY`;
- an empty PA-9 rejection-reason list.

Singleton arrangements with no selected multi-note shape are recorded explicitly as `NO_SELECTED_MULTI_NOTE_SHAPE`; they are not promoted into invented shape facts.

## Evidence output

The internal report is immutable and records:

- benchmark identity and current review state;
- `authority: none`;
- source-replay status per case;
- arrangement replay status;
- benchmark shape identity;
- runtime PA-8 voicing/shape candidate identities;
- PA-9 status and reason codes.

The report is evaluation evidence only. Runtime-generated candidate IDs do not replace benchmark IDs.

## Failure behavior

The evaluator fails closed when:

- PA-11.3D source replay fails;
- PA-8 no longer reproduces an expected source group, position set, fingering, or barre;
- PA-9 does not produce a verdict for the reproduced shape;
- PA-9 rejects a benchmark-selected shape.

A benchmark shape can therefore be structurally self-consistent under PA-11.3C yet still fail PA-11.3E if the current physical policy rejects it.

## Deliberate exclusions

PA-11.3E does not:

- change `reviewStatus`;
- infer `teacher-approved` from conversational approval;
- rewrite the current exact-pitch seed from pedagogical C-major / Cmaj7 design input;
- score or rank arrangements;
- train a model;
- alter PA-4 through PA-9 production behavior;
- expose a package-root API;
- activate PA-12.

Teacher-approved scoring remains a later, separately gated PA-11.3 slice.
