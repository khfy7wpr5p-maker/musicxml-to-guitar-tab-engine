# PA-10.2 Polyphonic Canonical Data Requirements

## Status

- Gate: `PA-10`
- Slice: `PA-10.2` — exact polyphonic canonical data requirements
- Status: `IN_PROGRESS_DOCUMENTATION_ONLY`
- Stage Start Approval: granted on 2026-08-13
- Authoritative base: `main` at `428a6624056893d4ff62f77e0f65999735d5fb34`
- Runtime change: none
- Test change: none
- Public API change: none
- Writer change: none
- `CanonicalTabResult 1.0.0` change: none
- `CanonicalTabResult 2.0.0` schema implementation: not authorized
- Final voicing/fingering selection: not authorized
- PA-10.3+: not authorized by this slice

This slice defines the information a future chord/polyphony-aware canonical result must be capable of representing without losing source truth, arrangement provenance, selected guitar realization, or validation provenance.

It is a requirements document, not the `CanonicalTabResult 2.0.0` schema. Exact object keys, nesting, validator code, public dispatch, writer support, and migration behavior remain later PA-10 slices.

## 1. Authority model

A future canonical v2 result must represent two kinds of truth without conflating them:

1. **immutable source truth** — what the validated MusicXML contained;
2. **approved final arrangement truth** — what an authorized later selection stage actually chose for guitar output.

Intermediate PA-3 through PA-9 candidate collections are evidence and derivation layers. They must not automatically become canonical output merely because they exist.

The source MusicXML and validated `PolyphonicSourceModel 1.0.0` remain the authority for source pitch, rhythm, timing, voice/staff identity, tie facts, and source ordering.

A future final-selection authority, not PA-9 and not this slice, must be the authority for the selected guitar realization.

## 2. Required source identity and score facts

A canonical v2 result must retain enough source information to trace every represented result fact back to the validated source without ambiguity.

For the selected source part, the future canonical result must be capable of representing:

- source format and MusicXML version identity;
- source part identity;
- deterministic measure identity;
- source measure index and visible measure number;
- implicit/pickup status;
- divisions and time signature;
- expected measure duration;
- deterministic source-event identity;
- original source order independent from musical onset order;
- event type: note or rest;
- source voice identifier;
- source staff identifier within the approved staff-1/staff-2 boundary;
- exact onset in divisions;
- exact duration in divisions;
- note pitch spelling and exact source MIDI for notes;
- tie-start and tie-stop facts;
- source `<chord/>` provenance where present.

These source facts must not be rewritten to describe the guitar arrangement. Source pitch and arrangement target pitch are separate facts.

### Source-order requirement

Polyphonic source order and musical onset order are not interchangeable. A future canonical result must preserve a deterministic source identity/order relation even when `backup`/`forward` caused later source events to begin at earlier musical onsets.

### Rest requirement

Rests are source timeline facts and remain part of the canonical musical timeline even though PA-4 arrangement decisions apply only to source notes. A future v2 design must not lose rests merely because guitar arrangement provenance is note-oriented.

## 3. Required simultaneity provenance

For source attacks that are simultaneous under PA-3 semantics, the future canonical result must be capable of preserving:

- deterministic simultaneous-group identity;
- measure identity;
- exact onset in divisions;
- exact source-event membership;
- deterministic member ordering;
- whether the group included source `<chord/>` evidence;
- whether the group spans multiple source voices;
- whether the group spans multiple source staves.

The authoritative grouping rule remains exact same-measure onset equality for note attacks. Rest events are not simultaneous-group members.

A source `<chord/>` marker alone is not the canonical definition of simultaneity, because equal-onset notes from separate voices/staves may belong to the same group.

### Sustained-note limitation

PA-3 groups note **attacks** at equal onset. It does not model a note sustained from an earlier onset as a new member of a later vertical sonority.

PA-10.2 therefore records a later-selection/design gap:

> a future final-selection/transition authority must not silently treat PA-3 attack groups as a complete sustained-sonority model when ties or overlapping durations matter physically.

This slice does not define a sustained-sonority model.

## 4. Required arrangement-decision provenance

Every source note represented in a final canonical v2 result must have exactly one explicit final arrangement disposition bound to source identity.

The result must be capable of representing:

- the deterministic arrangement decision identity that covered the note;
- the decision type;
- exact source-event membership covered by that decision;
- simultaneous-group identity for group decisions, otherwise no group identity;
- deterministic ordering of decision membership;
- the final per-source-note disposition after executable arrangement rules.

The PA-4 decision vocabulary currently includes:

- `PRESERVED`;
- `OMITTED`;
- `OCTAVE_DISPLACED`;
- `VOICE_REDISTRIBUTED`;
- `CHORD_REDUCED`;
- `REVOICED`;
- `ARPEGGIATED`.

However, PA-6 v1 executes only `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED`, and its conservative `CHORD_REDUCED` subset.

Therefore PA-10.2 does **not** declare target-voice, revoiced-pitch, or arpeggio-timing semantics for the deferred decision kinds. A future canonical v2 result may represent such decisions only after their executable semantics are separately approved and versioned.

### No silent musical change

Any source note that is omitted, octave-displaced, chord-reduced, revoiced, redistributed, or arpeggiated by a future approved policy must retain explicit provenance. Writers must never be forced to infer that a missing/changed note was an intentional arrangement decision.

## 5. Required per-source-note final disposition

For every source note, the future canonical result must be able to distinguish at least:

- retained without pitch change;
- retained with an explicitly approved target pitch transformation;
- explicitly omitted.

For each source note, final canonical data must preserve the relation:

```text
sourceEventId
  -> arrangement decision provenance
  -> final disposition
  -> target pitch if retained
  -> selected guitar realization if retained
```

For retained notes, the canonical result must carry an exact target MIDI pitch separate from source MIDI.

For omitted notes, target pitch and guitar-position selection must be absent/null by contract rather than synthesized.

When an octave displacement is used, the future result must be capable of representing the exact semitone displacement so the relation between source MIDI and target MIDI is auditable.

For the currently executable PA-6 rules, the result must be able to preserve the responsible deterministic transformation rule/policy identity where that identity is necessary to explain the final musical change.

## 6. Required selected guitar-position facts

A final canonical v2 result must contain one selected physical guitar position for every retained note that appears in output.

For each retained note, it must be capable of representing:

- source-event identity;
- exact target MIDI;
- selected string;
- selected fret;
- deterministic relation proving the selected position reproduces the target MIDI under the approved guitar configuration.

For simultaneous retained notes in the same selected voicing:

- every retained source event appears exactly once;
- no two active notes use the same string;
- source-event membership is unchanged by the physical placement stage;
- the selected positions collectively correspond to the approved final voicing, not merely the first generated PA-7 candidate.

### Guitar configuration provenance

The future canonical result must identify the guitar configuration/policy needed to interpret selected positions, including the relevant tuning/string count/fret range contract identity.

PA-10.2 does not authorize custom tuning or fret-range behavior beyond already approved contracts.

## 7. Required selected left-hand facts

Where a retained note belongs to a final selected left-hand shape, canonical v2 must be capable of representing the selected structural fingering, including:

- finger assignment per retained note;
- open-string finger `0` semantics;
- fretting fingers `1..4` under the current PA-8 policy;
- barre/partial-barre records when present;
- exact barre finger, fret, string span, and kind;
- sufficient identity to bind the selected fingering to the selected voicing and source events.

A canonical result must describe **the selected final shape**, not every PA-8 shape candidate.

Fields such as fret span, used-finger count, or barre count may be stored if later schema design needs them for validation/audit, but their presence must not replace the underlying selected assignments/barres that establish the physical fact.

## 8. Required physical-validation provenance

If a final selected shape is claimed to be accepted under PA-9-style static playability validation, the canonical result must preserve:

- the exact physical-validation policy/version identity;
- the selected shape identity or equivalent binding to the final selected fingering;
- a positive accepted status equivalent to `PLAYABLE_WITHIN_POLICY`;
- enough policy/configuration provenance to reproduce the static verdict.

A final canonical result must never label a shape as universally comfortable/playable merely because it passed `CONSERVATIVE_STATIC_LEFT_HAND_2.0`.

Rejected PA-9 shape candidates and their rejection reasons are not required canonical result data unless a later diagnostic/audit contract explicitly chooses to expose them. They remain candidate-validation evidence, not final arrangement truth.

## 9. Canonical completeness and conservation rules

A future v2 validator must eventually be able to enforce conservation across source truth and final arrangement truth.

At minimum, the later schema/validator design must support these invariants:

1. every source event has one deterministic identity;
2. every source note is covered by exactly one approved arrangement decision;
3. rests are never arrangement-decision subjects;
4. every source note has exactly one final disposition;
5. omitted notes have no selected guitar position/fingering;
6. retained notes have an exact target MIDI;
7. every retained output note has exactly one selected string/fret position;
8. simultaneous selected notes do not duplicate strings;
9. source MIDI is never overwritten by target MIDI;
10. octave-change provenance agrees exactly with source MIDI and target MIDI;
11. group decisions match exact source-group membership;
12. selected fingering assignments match selected positions exactly;
13. barre records agree with selected assignments;
14. a claimed accepted physical verdict is bound to the exact selected shape;
15. all deterministic counts and ordering rules are internally consistent;
16. successful canonical output is deeply immutable and deterministic.

The exact error vocabulary and validator implementation remain PA-10.4/PA-10.5 or later implementation slices.

## 10. Facts that must not become canonical merely because PA-1 through PA-9 produce them

The future canonical result is not a dump of the whole internal search graph.

The following are **not automatically required canonical truth**:

- every PA-3 descriptive flag if the same fact can be deterministically reconstructed and the final schema does not need it;
- PA-5 `MELODY_CANDIDATE`, `BASS_CANDIDATE`, `INNER_VOICE_CANDIDATE`, `SOLE_NOTE`, or `OUTER_VOICE_AMBIGUOUS` labels as semantic musical roles;
- PA-5 voice-summary statistics;
- every PA-7 voicing candidate;
- PA-7 candidate enumeration order as preference ranking;
- every PA-8 shape candidate;
- PA-8 candidate enumeration order as preference ranking;
- PA-9 rejected candidate records;
- PA-9 rejection reason arrays for candidates that were not selected;
- candidate counts or search ceilings as musical result data;
- temporary optimizer scores, search traces, or learned ranking values;
- player-specific comfort claims not established by an approved contract.

PA-5 roles may be retained as optional analysis provenance only if a later schema decision demonstrates a concrete audit requirement. They must never be reinterpreted as semantic melody/bass truth.

## 11. Final-selection gaps that PA-10.2 must preserve rather than invent

The existing PA-1 through PA-9 stack stops before final selection. PA-10.2 records these unresolved requirements so later work cannot hide them.

### 11.1 Candidate choice gap

PA-7 candidate order, PA-8 shape order, and PA-9 verdict order are deterministic enumeration order only. None is a ranking.

A future canonical v2 producer therefore requires a separately gated final-selection authority that chooses among accepted alternatives without treating “first candidate” as canonical.

### 11.2 Transition/path gap

PA-9 validates shapes independently. It does not optimize transitions between consecutive shapes.

A future final-selection authority must address sequence/path effects before claiming that a whole arrangement is the selected canonical guitar realization.

### 11.3 Singleton-retained-note gap

PA-7 creates voicing groups only when at least two notes remain active in a simultaneous source group. A simultaneous source group reduced to one retained note therefore does not automatically receive a PA-7/PA-8/PA-9 final shape candidate.

Canonical v2 nevertheless requires one selected guitar position for every retained output note. A later selection design must explicitly cover these singleton survivors instead of inventing missing PA-7 authority.

### 11.4 Sustained-sonority gap

As recorded above, PA-3 groups attacks, not all sounding notes. Later physical/transition selection must explicitly decide how ties and overlapping durations affect simultaneous hand occupancy where relevant.

### 11.5 Deferred-arrangement-semantics gap

`VOICE_REDISTRIBUTED`, `REVOICED`, and `ARPEGGIATED` do not yet have executable target semantics in PA-6 v1. PA-10.2 must not invent target voice, replacement pitch, or arpeggio timing fields as if those behaviors were already approved.

## 12. Deterministic ordering requirements

A future v2 contract must define deterministic ordering rather than rely on object iteration or candidate-generation accidents.

Later schema work must preserve at least these ordering concepts:

- measures by source measure index;
- source events by source order where source provenance is listed;
- simultaneous groups by musical onset;
- group members by source order;
- arrangement decisions by earliest covered source event;
- selected positions/finger assignments by a declared deterministic order tied to source membership;
- barres by a deterministic explicit rule if more than one exists.

Exact array layout belongs to PA-10.4.

## 13. Version and policy provenance requirements

A future canonical v2 result must carry sufficient version identity to avoid semantic guessing.

Later schema design must provide explicit identities for the applicable canonical contract and, where material to interpreting the final result, the approved upstream policy/configuration contracts used for:

- arrangement/reduction behavior;
- guitar position interpretation;
- structural fingering/barre semantics;
- physical playability validation;
- future final-selection policy.

Consumers must not infer compatibility merely because two versions share similarly named fields.

## 14. Writer-facing requirements

A future v2 writer must be able to serialize the already-approved canonical result without rerunning arrangement, candidate generation, fingering, playability validation, or final selection.

Therefore the canonical data must be sufficient for a writer to determine, without optimization:

- which source events remain in the arranged result;
- exact output pitch for each retained note;
- exact output timing/rhythm/rest facts;
- exact selected string/fret for every retained note;
- exact selected fingering/barre facts when the target format supports them;
- explicit provenance for omitted/transformed source notes where the output/audit format exposes it.

This slice does not modify any writer and does not define a v2 MusicXML serialization format.

## 15. Security and hostile-data requirements for later schema work

The future canonical v2 contract must preserve the repository's existing fail-closed contract discipline.

Later validator implementation must continue to reject, as applicable:

- unknown fields under an exact versioned schema;
- unsupported schema versions;
- cycles/shared hostile graph structures where forbidden;
- accessors/proxies/non-plain semantic objects;
- sparse/custom arrays;
- symbol/hidden semantic properties;
- `NaN`, infinities, unsafe integers, and canonical numeric `-0` where governed by safe-integer rules;
- inconsistent deterministic IDs;
- mismatched source/group/decision memberships;
- target pitch/position mismatches;
- duplicate simultaneous strings;
- malformed finger/barre bindings;
- invalid policy/version combinations.

PA-10.2 specifies the requirement only. It does not implement a v2 validator.

## 16. Minimum requirement map from PA-1 through PA-9

| Upstream gate | Canonical-v2 requirement contribution | Must not be promoted automatically |
|---|---|---|
| PA-1 | source event identity, source order, voice/staff, pitch, timing, ties, source provenance | arrangement or guitar meaning |
| PA-3 | exact-onset simultaneous-group identity/membership | preferred chord/voicing meaning |
| PA-4 | explicit arrangement decision identity/type/source coverage | automatic decision choice |
| PA-5 | optional analysis provenance only when justified | semantic melody/bass truth |
| PA-6 | final keep/omit/target-MIDI transformation provenance for executable rules | physical playability or candidate choice |
| PA-7 | valid distinct-string position alternatives and selected-position constraints | first-candidate preference/final selection |
| PA-8 | structural finger/barre representation for a selected shape | ergonomic/full-playability claim |
| PA-9 | fixed-policy accepted verdict provenance for selected shape | universal comfort, ranking, or final selection |

## 17. Requirements carried forward to PA-10.3 / PA-10.4

PA-10.3 migration/compatibility work must account for the fact that v1 cannot represent:

- multiple source voices/staves;
- simultaneous retained notes as one canonical onset structure;
- source-to-arrangement disposition provenance;
- multiple selected positions at one onset;
- selected chord fingering/barre facts;
- polyphonic physical-validation provenance.

PA-10.4 schema design must define the smallest exact v2 object model that satisfies this document without copying the complete PA-1→PA-9 intermediate search graph.

## 18. Acceptance criteria for PA-10.2

PA-10.2 is complete when review confirms that this requirements set:

- preserves complete source traceability for notes and rests;
- preserves source voice/staff/timing/pitch without overwriting source truth;
- preserves exact simultaneity provenance;
- preserves explicit arrangement decision and transformation provenance;
- requires a selected guitar position for every retained output note;
- requires selected fingering/barre facts where a final shape is selected;
- preserves physical-validation policy provenance without claiming universal playability;
- prevents candidate enumeration from becoming implicit final selection;
- records singleton, sustained-sonority, transition, and deferred-decision gaps explicitly;
- distinguishes required canonical truth from optional/intermediate diagnostic facts;
- does not define or implement the exact v2 schema;
- does not modify runtime, tests, writers, workflows, package metadata, public API, or `CanonicalTabResult 1.0.0`;
- passes exact-head repository CI;
- receives independent scope/architecture review;
- remains separately merge-gated.

## 19. Non-authority statement

This slice does not authorize:

- implementation of `CanonicalTabResult 2.0.0`;
- any v2 validator or schema module;
- version dispatch changes;
- v1→v2 upgrade or v2→v1 downgrade logic;
- public polyphonic conversion;
- changes to `src/index.js`;
- changes to the public monophonic parser/preflight boundary;
- writer behavior changes;
- final candidate ranking;
- final voicing/fingering selection;
- transition/path optimization;
- executable semantics for `VOICE_REDISTRIBUTED`, `REVOICED`, or `ARPEGGIATED`;
- PA-11 benchmark work;
- PA-12 E2E work;
- PA-13 public API work;
- branch cleanup or merge without separate Merge Approval.
