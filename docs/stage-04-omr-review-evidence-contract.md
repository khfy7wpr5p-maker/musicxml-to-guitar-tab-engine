# Stage 04 — OMR Review Evidence Contract

Status: Stage 04 application contract. Internal/non-package-root.

This contract turns **trusted, evidence-backed OMR uncertainty** into the Stage 01 score-state model without turning parser, safety, structural, capability, playability, resource or physical failures into automatic review cases.

It is intentionally not an OMR recognizer, automatic correction engine, MusicXML rewriter, fingering policy, solver policy or editor implementation.

## Runtime boundary

Implementation:

- `src/app/omrReviewEvidence.js`
- `src/app/reviewableScoreState.js`

The Stage 04 producer accepts explicit OMR evidence, validates it against a narrow allow-list, and delegates final `PASS` / `REVIEW_REQUIRED` / `BLOCKED` precedence to the Stage 01 score-state contract.

The package-root API is unchanged.

## Required evidence payload

Every Stage 04 OMR issue must contain exactly these fields:

```text
issue_id
category
code
severity
measure
staff
voice
event_id_or_location
observed_value
confidence_or_evidence_if_available
suggested_review_action
source_provenance
```

The producer copies and freezes evidence. Producer-owned input objects are not mutated.

`observed_value` may be `null`. `confidence_or_evidence_if_available` may also be `null`. Missing semantic information is therefore representable without inventing a replacement value.

`suggested_review_action` is a workflow instruction only. It is not semantic authority and must not encode an automatically accepted replacement pitch, duration, onset, voice, staff, tie or chord answer.

## Reviewable OMR codes

The following codes are explicitly reviewable when they use a Stage 01 reviewable category (`content`, `semantic`, or `quality`) and have a stable measure or event/location reference:

- `OMR_SUSPECTED_PITCH`
- `OMR_MISSING_NOTE`
- `OMR_SUSPECTED_DURATION`
- `OMR_MISSING_OR_UNCERTAIN_DURATION`
- `OMR_VOICE_CONFLICT`
- `OMR_MEASURE_DURATION_MISMATCH`
- `OMR_AMBIGUOUS_TIE`
- `OMR_AMBIGUOUS_CHORD_GROUPING`
- `OMR_MISSING_REST`
- `OMR_STAFF_ASSIGNMENT_CONFLICT`

For these issues, the producer adds the trusted backend disposition `REVIEW_REQUIRED`. Stage 01 then returns `REVIEW_REQUIRED` only when the immutable source is safely available to open.

`sourceReviewAvailability` is mandatory input to the Stage 04 state builder. There is no implicit `SAFE_TO_OPEN` default; the caller must explicitly prove or declare the Stage 01 source-review availability state.

A reviewable issue without a stable measure or event/location reference is rejected instead of being silently generalized to the whole score.

## Hard-block OMR codes

These remain hard blocks and never receive a review disposition:

- `OMR_UNSAFE_XML`
- `OMR_UNPARSEABLE_DOCUMENT`
- `OMR_RESOURCE_SAFETY_VIOLATION`
- `OMR_CORRUPTED_STRUCTURE_WITHOUT_STABLE_LOCATION`
- `OMR_EXECUTION_CANNOT_CONTINUE_SAFELY`

They must use a Stage 01 hard-block category (`safety`, `parse`, `structure`, or `transport`). A hard block wins if it appears together with reviewable OMR evidence.

## Unknown and mismatched issues fail closed

Stage 04 is allow-list based:

- unknown OMR codes are rejected;
- a reviewable code cannot be smuggled through a hard-block/capability category;
- a hard-block code cannot be relabeled as semantic/content review;
- severity must be `error` for this contract;
- the exact required payload shape is enforced;
- opaque evidence is bounded and restricted to JSON-like data values.

This prevents `REVIEW_REQUIRED` from becoming a catch-all bypass around existing engine safety.

## No semantic guessing

Stage 04 does not create or infer:

- replacement pitch or octave;
- replacement duration;
- onset/timeline values;
- voice or staff reassignment;
- missing-note pitch/duration;
- tie endpoints;
- chord membership;
- string/fret assignment;
- solver ranking/cost/tie-break changes.

A missing or uncertain value remains missing/uncertain evidence until a later teacher-correction revision supplies an explicit edit.

## State flow

```text
OMR / imported MusicXML evidence
  → trusted Stage 04 evidence producer
  → bounded allow-list + payload validation
  → explicit source-review availability gate
  → Stage 01 buildScoreState()
  → PASS | REVIEW_REQUIRED | BLOCKED
```

Typical repairable flow:

```text
POLY_V2 + safe immutable source
  + OMR_MISSING_OR_UNCERTAIN_DURATION
  + observed_value = null
  → REVIEW_REQUIRED
  → editor may open later under Stage 05–07 contracts
```

Hard-block example:

```text
OMR_UNPARSEABLE_DOCUMENT
  → BLOCKED
```

## Compatibility boundary

Stage 04 does **not** retroactively relabel current `processMusicXmlUpload()` failures. The existing upload runtime continues to classify its own parser, capability, playability, physical and resource failures under their existing contracts.

The new producer is the explicit integration boundary for an OMR-aware backend/host that possesses trusted OMR provenance and stable review location evidence. A future host integration may call this producer, but it may not bypass the allow-list or invent semantic values.
