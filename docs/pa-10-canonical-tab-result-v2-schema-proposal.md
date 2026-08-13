# PA-10.4 Minimal CanonicalTabResult 2.0.0 Schema Proposal

## Status

- Gate: `PA-10`
- Slice: `PA-10.4` — minimal `CanonicalTabResult 2.0.0` schema proposal
- Status: `IN_PROGRESS_DOCUMENTATION_ONLY`
- Stage Start Approval: granted on 2026-08-13
- Authoritative base: `main` at `8cb6d4773a5777bd03d6820790a0cab9e7b1f959`
- Runtime change: none
- Test change: none
- Workflow change: none
- Public API change: none
- Writer change: none
- `CanonicalTabResult 1.0.0` change: none
- v2 validator/schema module implementation: not authorized
- Runtime version dispatch: not authorized
- Canonical migration implementation: not authorized
- Final voicing/fingering selector implementation: not authorized
- PA-10.5+: not authorized by this slice

This document proposes the smallest exact object model that can satisfy the PA-10.2 canonical-data requirements and the PA-10.3 compatibility/migration decisions without copying the PA-1 → PA-9 intermediate search graph into canonical output.

The proposal is a contract design, not executable code.

The central rule is:

> `CanonicalTabResult 2.0.0` represents validated source truth plus one already-selected final guitar arrangement and the provenance required to audit that selection. It does not contain every candidate that was considered.

## 1. Compatibility boundary

`CanonicalTabResult 1.0.0` remains frozen and authoritative for the current public monophonic path.

This proposal does not extend, mutate, reinterpret, or relax v1.

A future v2 artifact must use:

- `documentType: "CanonicalTabResult"`
- `schemaVersion: "2.0.0"`

A v1 validator must continue to reject `2.0.0`, and a future v2 validator must reject `1.0.0` when invoked directly. A later dual-version dispatcher may route exact versions to exact validators, but dispatch is PA-10.5 work.

There is no generic canonical v1 → v2 artifact upgrade and no canonical v2 → v1 downgrade.

## 2. Proposed exact root shape

The proposed root has exactly these keys:

```text
CanonicalTabResult 2.0.0
├─ documentType
├─ schemaVersion
├─ engine
├─ source
├─ review
├─ guitar
├─ policyProvenance
├─ measures
├─ simultaneousGroups
├─ arrangementDecisions
├─ noteDispositions
└─ selectedShapes
```

No candidate collections, search traces, ranking scores, PA-5 semantic-role claims, rejected shapes, or migration fields are part of the minimal v2 root.

### 2.1 Root field table

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `documentType` | string | yes | exactly `CanonicalTabResult` |
| `schemaVersion` | string | yes | exactly `2.0.0` |
| `engine` | object | yes | engine identity that produced the artifact |
| `source` | object | yes | authoritative source-model identity/metadata |
| `review` | object | yes | explicit human teacher-review state; separate from algorithmic selection |
| `guitar` | object | yes | exact guitar configuration needed to interpret selected positions |
| `policyProvenance` | object | yes | exact upstream policy/contract identities used to interpret canonical facts |
| `measures` | array | yes | canonical copy of required source score facts, including notes and rests |
| `simultaneousGroups` | array | yes | exact PA-3 attack-group provenance needed by arrangement/shape facts |
| `arrangementDecisions` | array | yes | exact arrangement decision provenance covering every source note once |
| `noteDispositions` | array | yes | one final outcome for every source note, including selected position when retained |
| `selectedShapes` | array | yes | only final selected multi-note shape/fingering/barre/validation facts |

The empty array is valid where no simultaneous groups or selected shapes exist.

## 3. `engine`

Exact keys:

```text
engine
├─ name
└─ version
```

Rules:

- `name` is the engine identity used by the existing canonical contract family.
- `version` is the producing package/runtime version.
- both are bounded non-empty strings.

The engine version is not the canonical schema version.

## 4. `source`

Exact keys:

```text
source
├─ documentType
├─ contractVersion
├─ format
├─ musicXmlVersion
└─ partId
```

Rules:

- `documentType` is exactly `PolyphonicSourceModel`.
- `contractVersion` is exactly the approved source-model contract version used by the producer; for the current upstream basis this is `1.0.0`.
- `format` is exactly `score-partwise` under the current PA-1 boundary.
- `musicXmlVersion` is a bounded string or `null` exactly as validated source truth provides.
- `partId` is the selected source part identity.

The canonical result does not embed the complete upstream `PolyphonicSourceModel` object. Required source score facts are copied into `measures` under the independent v2 canonical contract so v2 is not structurally coupled to every internal PA-1 implementation detail.

## 5. `review`

Exact keys:

```text
review
└─ teacherReviewStatus
```

Allowed values:

- `NOT_REVIEWED`
- `APPROVED`
- `REJECTED`

Rules:

1. Algorithmic final selection does not imply `APPROVED`.
2. Source-assisted reprocessing does not imply `APPROVED`.
3. A future initial algorithmic v2 producer must emit `NOT_REVIEWED` unless a separately authorized human-review authority supplies stronger evidence.
4. `APPROVED` and `REJECTED` are reserved contract states; PA-10.4 does not implement any workflow that may set them.
5. No user identity, free-text comment, timestamp, or mutable review history is included in minimal v2. Those belong to a future application/persistence audit contract if required.

This deliberately separates human judgment from final-selection policy provenance.

## 6. `guitar`

Exact keys:

```text
guitar
├─ contractVersion
├─ tuning
├─ minimumFret
└─ maximumFret
```

`contractVersion` identifies the guitar-configuration contract used to interpret positions. Under the current upstream basis it is `1.0.0`.

`tuning` is an ordinary dense array of exactly six entries under the current approved boundary. Each entry has exactly:

```text
tuningEntry
├─ number
├─ pitch
└─ midi
```

Rules:

- string numbers are unique integers `1..6`;
- `pitch` is the validated open-string scientific pitch spelling or `null` where the guitar contract permits it;
- `midi` is exact open-string MIDI;
- `minimumFret` and `maximumFret` are safe non-negative integers with minimum ≤ maximum;
- every selected `{string, fret}` must round-trip to the note disposition's target MIDI under this exact guitar object.

PA-10.4 does not expand custom-tuning or fret-range authority beyond already approved guitar configuration contracts.

## 7. `policyProvenance`

The minimal schema preserves only contract/policy identities that materially explain canonical output.

Exact keys:

```text
policyProvenance
├─ arrangement
├─ reduction
├─ voicing
├─ leftHand
├─ physicalValidation
└─ finalSelection
```

### 7.1 `arrangement`

Exact keys:

```text
arrangement
├─ documentType
└─ contractVersion
```

Current basis:

- `documentType: GuitarArrangementPlan`
- `contractVersion: 1.0.0`

### 7.2 `reduction`

Exact keys:

```text
reduction
├─ documentType
├─ contractVersion
├─ policy
└─ octaveTieBreak
```

Current basis:

- `documentType: DeterministicReductionPlan`
- `contractVersion: 1.0.0`
- `policy: STANDARD_GUITAR_REGISTER_20_FRET_1.0`
- `octaveTieBreak: DOWNWARD_TIE_BREAK_1.0`

### 7.3 `voicing`

Exact keys:

```text
voicing
├─ documentType
├─ contractVersion
└─ policy
```

Current basis:

- `documentType: GuitarVoicingCandidateModel`
- `contractVersion: 1.0.0`
- `policy: STANDARD_SIX_STRING_DISTINCT_STRING_1.0`

This identity does not make PA-7 candidate order a ranking.

### 7.4 `leftHand`

Exact keys:

```text
leftHand
├─ documentType
├─ contractVersion
└─ policy
```

Current basis:

- `documentType: LeftHandShapeModel`
- `contractVersion: 1.0.0`
- `policy: ORDERED_FRET_FINGER_BARRE_1.0`

### 7.5 `physicalValidation`

Exact keys:

```text
physicalValidation
├─ documentType
├─ contractVersion
├─ policy
└─ configuration
```

`configuration` has exactly:

```text
configuration
├─ maximumStaticFretSpan
└─ maximumExtraFretReach
```

Current basis:

- `documentType: PhysicalPlayabilityValidation`
- `contractVersion: 2.0.0`
- `policy: CONSERVATIVE_STATIC_LEFT_HAND_2.0`
- `maximumStaticFretSpan: 4`
- `maximumExtraFretReach: 1`

These values describe a conservative static validation policy. They do not assert universal anatomical comfort, tempo suitability, or performance suitability.

### 7.6 `finalSelection`

Exact keys:

```text
finalSelection
├─ policyId
└─ policyVersion
```

Both values are bounded non-empty strings supplied by a separately approved final-selection authority.

No current PA-1 → PA-9 stage may invent these values.

A valid v2 producer cannot exist until an approved final-selection stage defines a real policy identity and covers the unresolved candidate-choice, transition/path, singleton-retained-note, and sustained-sonority requirements from PA-10.2.

## 8. `measures`

`measures` is ordered by source measure index and preserves only canonical source facts required for traceability and writer reconstruction.

Each measure has exactly:

```text
measure
├─ measureId
├─ index
├─ number
├─ implicit
├─ divisions
├─ timeSignature
├─ expectedDurationDivisions
└─ events
```

`timeSignature` has exactly:

```text
timeSignature
├─ beats
└─ beatType
```

Rules:

- `measureId` is the deterministic source measure identity;
- `index` equals the array position;
- `number` preserves the visible source measure number;
- `implicit` preserves pickup/implicit status;
- `divisions`, time signature, and expected duration are exact source truth;
- polyphonic measure validity is not expressed by summing all event durations into a single cursor;
- each event must remain inside the measure boundary.

### 8.1 Source event shapes

Events remain ordered by original source order, not musical onset.

Every event has these base keys:

```text
sourceEventBase
├─ sourceEventId
├─ sourceOrder
├─ type
├─ voice
├─ staff
├─ onsetDivisions
├─ durationDivisions
├─ tieStart
├─ tieStop
└─ source
```

A note event additionally has:

```text
pitch
```

A rest must not have `pitch`.

`source` has exactly:

```text
sourceLocation
├─ partId
├─ measureIndex
├─ measureNumber
├─ noteIndex
└─ chordWithPrevious
```

`pitch` has exactly:

```text
pitch
├─ step
├─ alter
├─ octave
├─ midi
└─ written
```

Rules carried from validated source truth:

- event type is exactly `note` or `rest`;
- voice is a bounded non-empty source voice identifier;
- staff is within the separately approved PA-1 source boundary;
- onset is non-negative;
- duration is positive;
- `onsetDivisions + durationDivisions` does not exceed expected measure duration;
- rests cannot carry tie markers;
- source pitch components, MIDI, and written pitch must agree exactly;
- `source.chordWithPrevious` remains provenance only and is not itself the canonical definition of simultaneity.

## 9. `simultaneousGroups`

The array is ordered by measure index, then onset, and preserves PA-3 attack groups only.

Each entry has exactly:

```text
simultaneousGroup
├─ groupId
├─ measureId
├─ onsetDivisions
└─ sourceEventIds
```

Rules:

- every group contains at least two note source-event IDs;
- every member belongs to the same measure and exact onset;
- member order follows source order;
- rests are never members;
- group IDs are deterministic under the approved PA-3 identity rule;
- descriptive PA-3 flags such as `spansVoices`, `spansStaves`, or `hasSourceChordMarker` are not stored because they can be reconstructed from canonical source facts when needed.

This remains an attack-group model, not a complete sustained-sonority model.

## 10. `arrangementDecisions`

The array is ordered by earliest covered source note.

Each entry has exactly:

```text
arrangementDecision
├─ decisionId
├─ decisionType
├─ sourceEventIds
└─ sourceGroupId
```

For the initial `2.0.0` proposal, only decision types with currently executable target semantics are allowed:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- `CHORD_REDUCED`

The following PA-4 vocabulary values are deliberately not valid in initial canonical v2 because executable target semantics are not yet approved:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

Supporting those behaviors later requires a separately approved and explicitly versioned contract change; they must not be smuggled into `2.0.0` using guessed fields.

Decision invariants:

- every source note is covered by exactly one arrangement decision;
- rests are covered by none;
- `PRESERVED`, `OMITTED`, and `OCTAVE_DISPLACED` cover exactly one note and use `sourceGroupId: null`;
- `CHORD_REDUCED` references one known simultaneous group and its membership exactly matches that source group;
- `decisionId` values are deterministic and unique.

## 11. `noteDispositions`

This array is the canonical bridge from immutable source-note truth to the selected guitar output.

It contains exactly one entry per source note, globally ordered by source order across measures.

Each entry has exactly:

```text
noteDisposition
├─ sourceEventId
├─ decisionId
├─ disposition
├─ targetPitch
├─ octaveShiftSemitones
├─ ruleId
├─ selectedPosition
└─ selectedShapeId
```

Allowed `disposition` values:

- `KEEP`
- `OMIT`

### 11.1 `targetPitch`

`targetPitch` is either `null` or the same exact five-key pitch shape used for source notes:

```text
targetPitch
├─ step
├─ alter
├─ octave
├─ midi
└─ written
```

Rules:

- `OMIT` requires `targetPitch: null`;
- `KEEP` requires a complete exact target pitch;
- source pitch is never overwritten;
- for unchanged pitch, target pitch equals source pitch exactly;
- for an approved octave displacement, spelling remains auditable and `octaveShiftSemitones` exactly equals target MIDI minus source MIDI;
- current executable octave shifts must be non-zero multiples of 12;
- `CHORD_REDUCED` survivors/omissions preserve their exact PA-6 rule outcome.

### 11.2 `selectedPosition`

`selectedPosition` is either `null` or exactly:

```text
selectedPosition
├─ string
└─ fret
```

Rules:

- `OMIT` requires `selectedPosition: null`;
- `KEEP` requires exactly one selected position;
- the selected position must round-trip to `targetPitch.midi` under `guitar`;
- selected positions are final output truth, not candidate order;
- simultaneous retained notes that belong to one selected shape must use distinct strings.

This field is required even for singleton survivors that currently do not receive a PA-7 multi-note voicing group.

### 11.3 `selectedShapeId`

`selectedShapeId` is a bounded string or `null`.

Rules:

- omitted notes require `null`;
- retained notes that belong to a final selected multi-note shape reference exactly one `selectedShapes[].selectedShapeId`;
- singleton retained notes may use `null` because PA-10.2 requires a selected position for them but does not invent missing PA-8/PA-9 multi-note shape authority;
- a shape reference must never be synthesized merely to satisfy this field.

### 11.4 `ruleId`

`ruleId` preserves the deterministic executable rule identity that explains the disposition/target transformation where applicable.

For the currently executable PA-6 basis, known values include:

- `PRESERVE_IN_REGISTER`
- `OMIT_EXPLICIT`
- `OCTAVE_NEAREST_IN_REGISTER`
- `CHORD_REDUCTION_KEEP_OUTER`
- `CHORD_REDUCTION_OMIT_INNER`

The later validator may use an exact vocabulary tied to the recorded reduction policy rather than accepting arbitrary semantic claims.

## 12. `selectedShapes`

`selectedShapes` contains only final selected multi-note left-hand shapes. It is not the PA-8 candidate list and not the PA-9 verdict graph.

A selected shape has exactly:

```text
selectedShape
├─ selectedShapeId
├─ sourceGroupId
├─ sourceEventIds
├─ voicingCandidateId
├─ shapeCandidateId
├─ fingerAssignments
├─ barres
└─ physicalValidation
```

### 12.1 Identity and membership

Rules:

- at most one selected shape exists for one `sourceGroupId`;
- `selectedShapeId` is deterministic under the canonical producer's declared rule; the proposed initial rule is `${sourceGroupId}:selected-shape`;
- `sourceEventIds` contains exactly the retained members of that source group that participate in the selected multi-note shape;
- it contains at least two events;
- order follows source-group/source order;
- each member's `noteDispositions[].selectedShapeId` points back to this shape;
- no omitted source note may appear.

`voicingCandidateId` and `shapeCandidateId` preserve only the identities of the selected upstream PA-7/PA-8 candidates. No unselected candidate is copied into canonical v2.

### 12.2 `fingerAssignments`

Each assignment has exactly:

```text
fingerAssignment
├─ sourceEventId
└─ finger
```

Rules:

- assignments are in exactly the same source-event order as `selectedShape.sourceEventIds`;
- each retained shape member has exactly one assignment;
- finger `0` is required when that note's selected fret is open;
- fretted notes use fingers `1..4` under the current PA-8 policy;
- a finger assignment is interpreted against the note disposition's already-selected `{string, fret}` and target pitch; position data is not duplicated here.

### 12.3 `barres`

Each barre has exactly:

```text
barre
├─ finger
├─ fret
├─ startString
├─ endString
├─ stringSpan
└─ kind
```

Allowed `kind` values:

- `FULL_BARRE`
- `PARTIAL_BARRE`

Rules:

- finger is `1..4`;
- fret is positive;
- string range is inside the six-string configuration;
- `stringSpan === endString - startString + 1`;
- a full barre spans strings `1..6` under the current six-string boundary;
- a partial barre must not be equivalent to a full barre;
- every barre must agree with at least two selected shape finger assignments and with all active selected positions inside its span.

### 12.4 `physicalValidation`

Exact keys:

```text
physicalValidation
└─ status
```

The only allowed status for a selected canonical shape under this initial proposal is:

- `PLAYABLE_WITHIN_POLICY`

A rejected shape cannot be selected canonical truth.

The exact policy/version/configuration used to interpret this status is stored once in `policyProvenance.physicalValidation` and applies to every selected shape in the artifact.

Rejected candidates and rejection reason arrays remain non-canonical diagnostic evidence.

## 13. Cross-object conservation invariants

A future v2 validator must be able to enforce all of the following without rerunning candidate enumeration or final selection:

1. root keys are exact and schema identity is exactly `2.0.0`;
2. all objects/arrays satisfy the repository's hostile-safe plain-data rules;
3. measure IDs and source-event IDs are deterministic and unique;
4. events remain ordered by source order inside each measure;
5. simultaneous group membership points only to source notes at the same measure/onset and preserves source order;
6. every source note is covered by exactly one arrangement decision;
7. rests are covered by no arrangement decision and have no note disposition;
8. every source note has exactly one note disposition;
9. disposition `decisionId` references the exact decision covering that source note;
10. omitted notes have no target pitch, selected position, or selected shape;
11. retained notes have an exact target pitch and one selected string/fret;
12. source pitch and target pitch remain distinct facts;
13. octave-shift provenance exactly matches source/target MIDI;
14. each selected position round-trips to target MIDI under the recorded guitar configuration;
15. every selected shape references one known simultaneous group;
16. selected shape members are exactly retained members of that group participating in the selected multi-note shape;
17. simultaneous selected shape members use distinct strings;
18. finger assignments cover selected shape membership exactly once;
19. finger/open-string rules agree with selected frets;
20. barre facts agree with selected positions and finger assignments;
21. selected shape status is `PLAYABLE_WITHIN_POLICY` under the exact recorded physical policy;
22. no candidate enumeration order or first-accepted candidate is treated as selection provenance;
23. policy identities are exact and mutually compatible;
24. teacher review status is not inferred from algorithmic selection;
25. deterministic array ordering is enforced;
26. successful canonical output is deeply immutable and deterministic.

## 14. Deterministic ordering rules

The proposed contract uses these exact ordering concepts:

- `measures`: ascending `index`;
- `measure.events`: ascending `sourceOrder`;
- `simultaneousGroups`: ascending measure index, then `onsetDivisions`;
- `simultaneousGroup.sourceEventIds`: source order;
- `arrangementDecisions`: earliest covered source-note order;
- `arrangementDecision.sourceEventIds`: source order;
- `noteDispositions`: global source-note order, skipping rests;
- `selectedShapes`: source-group order as it appears in `simultaneousGroups`;
- `selectedShape.sourceEventIds`: source order;
- `fingerAssignments`: exactly parallel to `selectedShape.sourceEventIds`;
- `barres`: ascending fret, then finger, then start string, then end string.

Object-property order is not semantic authority; exact keys and array ordering are.

## 15. Hostile-data / fail-closed requirements

The future v2 validator must preserve the repository's current strict contract discipline.

At minimum it must reject, as applicable:

- unsupported or malformed `schemaVersion`;
- unknown fields at every exact object boundary;
- Proxy objects;
- accessors/getters/setters where plain data is required;
- non-plain semantic objects;
- cycles or forbidden shared object references;
- sparse arrays;
- custom/symbol array properties;
- symbol/hidden semantic object properties;
- non-enumerable semantic fields;
- `NaN` and infinities;
- unsafe integers;
- canonical numeric `-0` where safe-integer rules apply;
- inconsistent deterministic IDs;
- missing/duplicate source/group/decision/disposition memberships;
- target-pitch/position mismatches;
- duplicate strings inside a selected simultaneous shape;
- malformed finger/barre bindings;
- rejected selected shape status;
- incompatible policy/version combinations.

Exact runtime inspection mechanics and error vocabulary remain later implementation work.

## 16. Deliberately excluded from minimal `2.0.0`

The following are intentionally not proposed as canonical v2 fields:

- all PA-5 register-role labels and voice-summary statistics;
- every PA-7 voicing candidate;
- PA-7 candidate enumeration order;
- every PA-8 shape candidate;
- PA-8 candidate enumeration order;
- PA-9 rejected candidates;
- PA-9 rejection-reason arrays for unselected shapes;
- candidate counts/search ceilings as result data;
- temporary optimizer scores/costs/search traces;
- learned ranking scores;
- unsupported player-comfort/tempo claims;
- current v1 `alternativePositions` candidate list;
- current v1 monophonic `fingeringCost` and `totalFingeringCost` model;
- canonical v1/v2 migration metadata;
- persistence/cache IDs;
- UI/editor state;
- free-text teacher comments or audit history;
- lossy legacy export data;
- writer-specific MusicXML serialization choices.

Excluding these fields keeps canonical v2 focused on source truth and selected output truth rather than intermediate computation.

## 17. Deferred musical semantics remain fail-closed

The schema proposal does not invent output semantics for:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

In particular, `2.0.0` does not define target voice IDs, revoiced pitch substitutions, or arpeggio output onsets.

If those decisions are later implemented, their canonical representation must be designed and versioned explicitly. They must not be encoded through overloaded current fields.

## 18. Sustained-sonority and transition boundary

`simultaneousGroups` represents PA-3 attack simultaneity, not every sounding note at every time.

The minimal canonical schema therefore does not add a speculative sustained-sonority search graph.

However, a producer may not issue a valid v2 artifact until the separately approved final-selection authority has accounted for the PA-10.2 transition/path and sustained-hand-occupancy requirements strongly enough to justify its selected positions/shapes.

The canonical artifact records the final selected truth and final-selection policy identity; it does not record the entire transition search.

## 19. Singleton-retained-note boundary

A source simultaneous group may be reduced to one retained note, and a monophonic source note may never enter PA-7 grouping at all.

For both cases:

- `noteDispositions[].selectedPosition` remains mandatory for `KEEP`;
- `selectedShapeId` may be `null` when there is no authorized multi-note shape provenance;
- the final-selection policy must still choose the physical string/fret explicitly;
- the producer must not fabricate a PA-7 `voicingCandidateId`, PA-8 `shapeCandidateId`, finger assignment, barre, or PA-9 verdict for that singleton.

## 20. Writer sufficiency check

A future v2 writer, after exact v2 validation, can determine without optimization:

- complete source measure/timing/rest structure;
- exactly which source notes are omitted or retained;
- exact output pitch spelling/MIDI for every retained note;
- exact selected string/fret for every retained note;
- selected multi-note fingering and barres where present;
- exact teacher-review state;
- exact policy identities required to interpret selected guitar facts.

The writer does not need candidate generation, fingering enumeration, PA-9 recomputation, final selection, or canonical version migration.

Whether a target export format can express every provenance field is a writer/adapter issue and does not change canonical truth.

## 21. Relationship to v1

This proposal intentionally does not preserve v1's object layout as a structural subset.

Shared conceptual facts may have similar names, but schema compatibility is determined only by exact version identity and exact validation.

Notable v1 concepts that are deliberately not carried forward as-is:

- single linear measure cursor;
- staff exactly 1;
- zero/one logical voice;
- one event stream serving simultaneously as source truth and arranged output truth;
- `alternativePositions` as canonical candidate data;
- monophonic fingering-cost path as canonical authority.

This is why the proposed contract is major version `2.0.0`.

## 22. PA-10.5 requirements derived from this proposal

The next proposed PA-10 slice must define version dispatch/fail-closed behavior without implementing canonical migration.

PA-10.5 must be able to route:

- exact `1.0.0` → existing v1 validator/consumer;
- exact `2.0.0` → future v2 validator/consumer once implemented;
- every unsupported/malformed/missing version → fail closed.

It must not:

- delete fields and retry another validator;
- rewrite schema versions;
- auto-upgrade v1;
- downgrade v2;
- infer versions from object shape;
- let a v2 writer reselect an arrangement.

## 23. Implementation prerequisites after PA-10.4

This document does not mean runtime v2 can be safely implemented immediately.

Before a canonical v2 producer is authorized, at least these architecture gaps remain material:

1. final candidate/voicing/fingering selection authority;
2. transition/path policy across consecutive selected shapes;
3. singleton retained-note position selection authority;
4. sustained-sonority/hand-occupancy policy where overlapping durations matter;
5. final-selection policy identity/version;
6. separately reviewed v2 validator implementation and hostile-input tests;
7. PA-10.5 exact version-dispatch contract;
8. later teacher-approved benchmark/evaluation gate before public arrangement claims.

A schema can define the destination before the producer exists; it must not be used to pretend the producer already exists.

## 24. Acceptance criteria for PA-10.4

PA-10.4 is complete when independent review confirms that this proposal:

- defines one exact major-v2 object model rather than mutating v1;
- preserves required source note/rest/voice/staff/timing/pitch traceability;
- preserves exact attack-simultaneity provenance without claiming a sustained-sonority model;
- preserves exact arrangement decision provenance;
- defines one final disposition for every source note;
- stores exact target pitch separately from source pitch;
- requires one selected string/fret for every retained note, including singleton survivors;
- stores only selected multi-note fingering/barre/physical-validation facts;
- records exact guitar/upstream/final-selection policy identities;
- prevents intermediate candidate enumeration from becoming canonical truth;
- distinguishes algorithmic final selection from human teacher review status;
- excludes deferred arrangement semantics rather than inventing them;
- gives a future writer enough selected truth to serialize without optimization;
- remains compatible with PA-10.3's no-upgrade/no-downgrade matrix;
- preserves fail-closed hostile-data requirements;
- does not modify runtime, tests, workflows, package metadata, writers, public API, or `CanonicalTabResult 1.0.0`;
- passes exact-head repository CI;
- receives independent scope/architecture review;
- remains separately merge-gated.

## 25. Non-authority statement

This document does not authorize:

- creation of a runtime `CanonicalTabResult 2.0.0` module;
- a v2 constructor or validator;
- changes to `src/contracts/canonicalTabResultContract.js`;
- changes to current v1 canonical creation or validation;
- changes to current public serializers;
- changes to `src/index.js`;
- public polyphonic conversion;
- runtime version dispatch;
- canonical v1→v2 migration;
- canonical v2→v1 downgrade;
- source-assisted v2 production;
- final candidate ranking;
- final voicing/fingering selection;
- transition/path optimization;
- singleton selection implementation;
- sustained-sonority implementation;
- teacher review UI/persistence;
- executable semantics for deferred arrangement decision kinds;
- PA-10.5 implementation;
- PA-11 benchmark work;
- PA-12 E2E work;
- PA-13 public API work;
- branch cleanup;
- merge without separate Merge Approval.
