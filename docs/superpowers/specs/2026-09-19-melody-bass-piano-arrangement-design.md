# R9 Melody–Bass Piano-to-Guitar Arrangement Design

Date: 2026-09-19

Status: proposed for user review

Scope: application-only, deterministic, review-required arrangement policy

## 1. Intent

The product must turn safe, parseable polyphonic MusicXML—including piano music—into a visible, playable, and teacher-editable provisional guitar TAB whenever a physically valid reduction can be found. Imperfect musical choices are acceptable because the teacher will correct them. Silent note loss, invented source facts, nondeterministic output, and unsafe guesses are not acceptable.

R9 improves the existing dense-score recovery path. It does not replace MusicXML parsing, source projection, physical guitar validation, the writer, or the R8 teacher-edit bridge.

## 2. Current failure and root cause

The current `PartialGuitarTabArrangement 1.0.0` recovery policy tries fixed retained-note caps in this order: `3, 2, 1`. This deliberately sparse policy often produces usable output, but it discards inner chord tones before the physical selector is allowed to test whether four, five, or six notes are playable. The system therefore behaves more conservatively than the six-string instrument requires.

R9 addresses that policy gap. It does not claim that every source simultaneity can fit on guitar. More than six independent simultaneous pitches, duplicate-string conflicts, impossible stretches, unsupported tie structures, and notes outside the contracted register may still require explicit reduction or review.

## 3. Chosen approach

Use a deterministic melody–bass-first maximization policy.

For each onset, the arranger prioritizes:

1. forced teacher assignments from R8;
2. complete active tie chains;
3. the highest distinct target pitch as the melody anchor;
4. the lowest distinct target pitch as the bass anchor;
5. remaining distinct target pitches in deterministic outer-to-inner order;
6. existing source order as the final tie-break.

The arranger attempts the largest bounded texture first, up to six distinct target pitches, then reduces one voice at a time only when the existing physical pipeline rejects the candidate. The retry order is `6, 5, 4, 3, 2, 1`. A lower cap is accepted only after all higher caps fail under the same fixed resource ceilings.

Caps two through six retain both anchors when they are distinct. Cap one is the last-resort melody-only fallback; dropping the bass at that point is explicit in its disposition and never presented as a full melody–bass realization.

This approach was selected over:

- a fixed three- or four-voice texture, because it needlessly discards playable material;
- multiple style/player-level profiles, because they add product choices before the base engine is reliable;
- AI or learned ranking, because current correctness needs deterministic, auditable behavior and the repository already contains physical validators and teacher-review infrastructure.

## 4. Architecture

R9 introduces one policy unit and connects it to the existing recovery orchestrator:

```text
immutable PolyphonicSourceModel
        + DeterministicReductionPlan
        + R8 position overrides
                     |
                     v
MelodyBassArrangementPolicy 2.0
  - rank source notes per onset
  - preserve forced/tied units
  - propose caps 6 -> 1
                     |
                     v
existing PA-7/8/9 physical pipeline
  - string/fret candidate generation
  - shape selection
  - physical validation
                     |
          +----------+----------+
          |                     |
          v                     v
 playable candidate       retry lower cap
          |
          v
PartialGuitarTabArrangement 1.1
  + explicit per-note reason
  + ReviewEditableTabProjection
  + provisional score/TAB MusicXML
```

### 4.1 Policy unit

The new unit has one responsibility: given validated source/reduction facts and a requested cap, return the exact source-event identities proposed for retention plus a reason for every decision. It does not select string/fret positions, alter source timing, write MusicXML, or decide canonical authority.

The unit must be independently testable and must not read filenames, source hashes, teacher benchmark answers, renderer output, or mutable UI state.

### 4.2 Recovery orchestrator

`recoverPartialGuitarArrangement()` remains responsible for bounded retries. It asks the policy unit for a candidate at each cap and sends that candidate through the existing canonical-v2 physical selector and writer. It must not bypass or weaken existing attempt, deadline, stretch, collision, or validation limits.

### 4.3 Existing editor bridge

R8 remains the correction surface. R9 output stays on the same Workbench page as score and TAB. Unassigned notes remain visible in the source-bound list and can be assigned by exact string/fret commands when eligible. R9 does not add a separate notation editor or a second source of truth.

## 5. Musical selection rules

### 5.1 Melody and bass

At each onset, melody is the highest distinct target pitch and bass is the lowest distinct target pitch. These are deterministic register anchors, not a claim of semantic musicological truth. When only one distinct pitch exists, it is the single anchor.

### 5.2 Inner voices

After melody and bass, remaining notes are considered by alternating from the upper and lower edges toward the center. Duplicate target pitches do not consume additional capacity unless a teacher-forced assignment requires the exact source event. This preserves register coverage and pitch-class diversity without inventing harmony labels.

Basic MusicXML harmony labels may continue to be displayed, but they are not selection authority in R9. Root/third/seventh inference is excluded because an incorrect inferred chord must not silently remove a source note.

### 5.3 Ties

A valid tie chain is indivisible: all segments are retained or all are unassigned. A forced assignment may not split a chain. Existing invalid-tie review behavior remains unchanged.

### 5.4 Register and octave displacement

R9 does not introduce free octave rewriting. It reuses only the existing contracted nearest-in-register whole-octave rule. Source pitch and source MusicXML remain immutable, and any target octave displacement remains explicit in arrangement provenance.

### 5.5 Timing and voices

R9 does not change onset, duration, staff, voice, measure structure, repeats, tuplets, or grace-note semantics. It does not arpeggiate a chord. Those are separate future policies because they change time rather than merely choose a playable simultaneous subset.

## 6. Result contract and provenance

The provisional artifact is versioned to `PartialGuitarTabArrangement 1.1.0` and records policy `MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0`.

Every source note still receives exactly one disposition. R9 adds exact retention/reduction reasons:

| Disposition | Reason code | Meaning |
|---|---|---|
| `KEPT` | `MELODY_ANCHOR_RETAINED` | Highest distinct onset pitch retained. |
| `KEPT` | `BASS_ANCHOR_RETAINED` | Lowest distinct onset pitch retained. |
| `KEPT` | `INNER_VOICE_RETAINED` | Inner pitch retained by deterministic order. |
| `KEPT` | `TEACHER_ASSIGNMENT_RETAINED` | R8 exact position override retained. |
| `OCTAVE_SHIFTED` | `OCTAVE_NEAREST_IN_REGISTER` | Existing bounded register rule applied. |
| `UNASSIGNED` | `GUITAR_CAPACITY_REDUCTION` | Excluded after higher-cap physical attempts failed. |
| `UNASSIGNED` | `DUPLICATE_TARGET_PITCH_REDUCTION` | Redundant target pitch not retained. |
| `UNASSIGNED` | `GRACE_TIMING_REQUIRES_REVIEW` | Existing unsupported grace timing. |
| `OMITTED` | `SOURCE_REPRESENTATION_NORMALIZATION` | Proven representation-only duplicate. |

The artifact also records the successful retained-note cap and ordered failed attempts with bounded error codes. It must not copy arbitrary error messages or sensitive input into the artifact.

`ReviewEditableTabProjection` stays backward-compatible unless tests prove a new field is necessary. The UI may map the new exact reason codes to concise Turkish/English labels without changing their machine values.

## 7. Authority and failure behavior

R9 output remains:

- `REVIEW_REQUIRED`;
- renderer-visible and playable;
- manually editable through validated R8 commands;
- non-canonical and non-exportable under the existing authority rules;
- bound to the immutable upload SHA and exact source-event identities.

The engine returns the best validated candidate it actually found. It must never fabricate an impossible position, silently move a note, weaken a physical constraint, or relabel a hard safety/parser failure as a review result.

If no cap from six through one passes the existing physical pipeline, the current fail-closed result remains. Cancellation and deadline exhaustion stop immediately and are never converted into a lower-cap retry success.

## 8. Data flow

1. Existing safety and compatibility checks admit the upload.
2. Existing projection builds immutable source, simultaneity, tie, and reduction facts.
3. The complete physical selector runs unchanged.
4. Only an allow-listed recoverable physical-selection failure enters R9.
5. R9 proposes cap six, preserving forced assignments and tie units.
6. Existing physical selection validates the proposed subset.
7. On a bounded playability failure, R9 retries cap five, then continues to one.
8. The first valid result is serialized as provisional score-plus-TAB MusicXML.
9. Every original source note is mapped to an explicit disposition/reason.
10. The same-page review projection exposes kept TAB and eligible unassigned notes for teacher correction.

## 9. Compatibility and migration

- Existing `PartialGuitarTabArrangement 1.0.0` validators remain readable where historical artifacts are accepted.
- New runtime output uses `1.1.0`; consumers must dispatch explicitly by version and reject unknown major versions.
- Package-root monophonic APIs and `CanonicalTabResult 1.x` do not change.
- Canonical-v2 physical selection, writer semantics, and solver ordering do not change.
- R8 edit replay reruns R9 from the immutable source and must preserve every prior exact position override.
- No database migration is required because upload results are request-scoped artifacts in the current architecture.

## 10. Testing strategy

Implementation follows red-green-refactor and adds these layers:

### 10.1 Policy unit tests

- six playable distinct pitches retain all six;
- seven pitches retain melody and bass and reduce deterministically;
- four- and five-note playable chords are no longer prematurely capped at three;
- duplicate target pitches have stable reasons;
- source-order ties resolve identically across repeated runs;
- complete tie chains are all retained or all unassigned;
- forced R8 assignments are retained or fail explicitly.

### 10.2 Integration tests

- higher caps fail physically and the first lower playable cap wins;
- no lower cap is tried after a successful higher cap;
- cancellation/deadline errors do not retry;
- source model, source bytes, timing, voices, and staff are unchanged;
- artifact counts, coverage, dispositions, renderer hash, and reason codes validate;
- replaying an R8 edit preserves earlier exact positions.

### 10.3 Application and browser tests

- a dense piano MusicXML upload returns `REVIEW_REQUIRED`, visible score, visible TAB, playback data, and an unassigned-note list;
- the same upload produces byte-identical arrangement metadata and MusicXML on repeat;
- an eligible omitted note can be assigned on the same page;
- impossible/colliding assignments remain blocked with an actionable error;
- legacy monophonic and already-successful polyphonic paths are unchanged.

### 10.4 Regression evidence

- full Node test suite;
- MusicXML compatibility suite;
- Stage 09 real-corpus audit, two deterministic runs;
- runtime staging end-to-end workflow;
- before/after corpus metrics for assigned notes, unassigned notes, blocked files, and deterministic hashes.

R9 is successful only if assigned-note coverage increases or stays equal on every eligible corpus file, no previously usable file becomes blocked, and all safety/determinism gates pass.

## 11. Out of scope

- AI/learned arrangement authority;
- style or player-skill profiles;
- inferred harmonic-function authority;
- automatic arpeggiation or rhythm rewriting;
- voice/staff reassignment;
- note creation/deletion;
- arbitrary octave transposition;
- canonical export of unreviewed provisional TAB;
- a new standalone notation editor.

## 12. Delivery slices

1. Add the isolated melody–bass policy and failing unit tests.
2. Integrate six-to-one bounded retry into partial recovery and version its artifact.
3. Extend validators, upload schema mappings, and R8 replay compatibility.
4. Expose human-readable decision reasons on the existing Workbench page.
5. Run full, corpus, and staging verification; update architecture/status documents with measured evidence.

Each slice must preserve the previous slice's passing tests and must not claim completion before exact-head CI evidence is available.
