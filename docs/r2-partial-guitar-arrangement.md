# R2 Partial Guitar Arrangement

Status: implemented as an application-only, review-required recovery path.

## Problem

Dense piano sonorities can contain more simultaneously sounding notes than a six-string guitar can realize. The complete selector correctly stops at fixed physical/resource boundaries; increasing those limits would not make the chord playable and could create unbounded work.

## Result contract

`PartialGuitarTabArrangement 1.0.0` is a provisional artifact, never canonical authority. It is produced only after safe parsing and a successful source-model projection, and only for the allow-listed `LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED` boundary.

Every source note receives exactly one disposition:

| Disposition | Meaning |
|---|---|
| `KEPT` | Pitch retained and assigned to a validated string/fret. |
| `OCTAVE_SHIFTED` | Retained with the existing bounded whole-octave register rule and assigned. |
| `UNASSIGNED` | Excluded by the bounded guitar reduction; teacher attention is required. |
| `OMITTED` | Proven representation-only source note, such as an exact TAB mirror. |

The artifact includes source identity, original failure provenance, assigned/unassigned counts, coverage, per-note source pitch and selected physical position, and a SHA-256 binding to the provisional MusicXML/TAB writer output.

## Reduction and retry policy

The policy is deterministic and filename/SHA independent:

1. retain outer-register material in melody–bass order;
2. reject duplicate target pitches inside one attack;
3. preserve a complete tie chain or reduce the complete chain;
4. attempt at most 3, then 2, then 1 retained notes per onset;
5. reuse the existing register, physical validation, solver and writer;
6. keep fixed solver/resource ceilings unchanged.

The temporary reduced source model exists only to run the already-validated physical pipeline. It is not exposed as source truth. Original source identity and all dispositions remain in the partial artifact.

## Authority and UI behavior

- result status: `REVIEW_REQUIRED`;
- `canonicalTabResult`: `null`;
- `arrangementArtifact`: present and validated;
- provisional TAB MusicXML: present and renderer-visible;
- `generateTab`: true;
- `export`: false;
- canonical availability: false.

The existing source artifact remains immutable. Unsafe/unparseable input, unsupported projection semantics, grace recovery outside this bounded path, cancellation, and deadline exhaustion remain fail-closed.

## Current evidence

The pinned 11-file AnimeTAB Stage 09 corpus at commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a` changes as follows:

| Metric | R1 | R2 |
|---|---:|---:|
| Source-renderable files | 6/11 | 9/11 |
| Provisional TAB artifacts | 0/11 | 3/11 |
| Hard-blocked files | 5/11 | 2/11 |
| Assigned notes in recovered files | 0 | 1,267/2,090 (60.62%) |

The remaining two hard blocks are projection-level performance-direction cases. Six repeat-bearing files render their source but do not yet have provisional TAB. Teacher-edit capability remains a separate host/editor bridge gate.
