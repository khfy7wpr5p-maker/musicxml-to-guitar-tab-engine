# PA-2.1 Polyphonic Projection Contract

## Status

- Gate: `PA-2.1`
- Scope: documentation / architecture contract only
- Runtime implementation: `NOT_IMPLEMENTED`
- Input contract: `ParsedMusicXmlDocument 1.0.0`
- Output contract: `PolyphonicSourceModel 1.0.0`
- Public package API: unchanged
- Existing monophonic projection: unchanged
- `CanonicalMusicDocument`: unchanged
- `CanonicalTabResult 1.0.0`: unchanged
- Arrangement authority: none
- Guitar fingering authority: none

PA-2.1 defines the contract for the future internal parallel projection from the already-safe immutable XML tree into the already-merged internal polyphonic source-truth model. It does not implement that projector and does not make polyphonic conversion public.

## Architectural position

```text
MusicXML
  ↓
normalizeXmlInput + XML structural safety
  ↓
ParsedMusicXmlDocument 1.0.0
  ↓
MusicXML semantic resource limits
  ↓
PA-2 projector — future implementation gate
  ↓
PolyphonicSourceModel 1.0.0
  ↓
PA-3 simultaneous-event / chord model
```

The current monophonic path remains a separate sibling projection:

```text
ParsedMusicXmlDocument 1.0.0
  ├─ existing monophonic adapter → CanonicalMusicDocument
  └─ PA-2 parallel projector     → PolyphonicSourceModel 1.0.0
```

PA-2 must not obtain polyphonic support by relaxing `musicxmlDocumentAdapter.js` or by making the current public monophonic path permissive.

## Source-truth boundary

The projector answers only:

> Which bounded musical source facts are present in the validated selected MusicXML part, and at what source-relative musical times?

It must not decide:

- melody, bass or inner-voice role,
- chord grouping beyond preservation of the source `<chord/>` marker,
- omission, reduction, octave displacement or revoicing,
- guitar string/fret/finger/barre placement,
- pedagogical preference,
- learned/AI ranking,
- public result serialization.

Those authorities remain in later PA gates.

## Input preconditions

The future projector accepts only a valid `ParsedMusicXmlDocument 1.0.0` produced by the existing XML safety/parser layer. It must not accept raw XML strings, Buffers, files, URLs or external callbacks at this layer.

Before detailed musical projection, the same caller-supplied processing runtime must pass through the existing MusicXML semantic resource-limit gate. That gate establishes the current structural baseline and enforces `maxMeasures` and aggregate `maxEvents` before projection work proceeds.

Because the downstream `PolyphonicSourceModel 1.0.0` contract retains the PA-1 fixed ceilings of 2,000 measures and 50,000 events, PA-2 must additionally derive the effective pre-projection ceilings from both boundaries:

```text
effectiveMaxMeasures = min(runtime.budget.limits.maxMeasures, 2000)
effectiveMaxEvents = min(runtime.budget.limits.maxEvents, 50000)
```

Those effective ceilings must be enforced before detailed measure/event projection begins. A caller-supplied runtime may lower either ceiling, but it must not raise the PA-2 projection ceiling above the PA-1 output-model boundary. These compatibility ceilings do not create a second ProcessingBudget authority: deadline, cancellation and runtime checkpoints continue to come from the same caller-supplied processing runtime.

PA-2 must not create an independent second budget/deadline/cancellation authority for the same conversion. The projection participates in the existing processing runtime and adds checkpoints during bounded measure/event/cursor processing.

## Structural scope

Initial PA-2 projection is deliberately narrow:

- MusicXML root: `score-partwise` only;
- exactly one `score-part` and one matching `part`;
- one selected source part per model;
- one or two staves only;
- multiple bounded non-empty voice identifiers allowed;
- notes and rests allowed;
- source `<chord/>` allowed under the rules below;
- `backup` and `forward` allowed only as bounded cursor operations;
- inherited `divisions` and time signature supported;
- measure `implicit="yes"` preserved;
- grace-note semantics rejected;
- tuplets / `time-modification` rejected;
- staff 3+ rejected;
- multipart/orchestral reduction rejected;
- compressed `.mxl` remains outside this layer.

This contract does not expand `PolyphonicSourceModel 1.0.0`.

## Projection invariants

For every successful projection:

1. output validates through `createPolyphonicSourceModel()` / `validatePolyphonicSourceModel()`;
2. output events remain in MusicXML source-note order, not onset-sorted order;
3. source identities are deterministic and derived only from selected part, measure index and source-note order;
4. source pitch is never transposed or respelled by arrangement logic;
5. cursor arithmetic is safe-integer bounded and cannot underflow below zero;
6. no projected event extends beyond the model's declared measure duration;
7. the source MusicXML and `ParsedMusicXmlDocument` remain immutable;
8. current monophonic conversion output is unaffected.

## Measure projection

Measures are projected in direct source order inside the selected `part`.

For measure index `i`:

```text
measureId = <partId>:measure:<i>
index = i
number = bounded non-empty source measure number
implicit = true only when source implicit="yes"
```

The projector carries forward active `divisions`, time signature and declared staff count between measures according to MusicXML inheritance rules.

A valid active `divisions` and time signature must exist before the first note/rest/timing cursor operation requiring them.

### Stable timing basis per measure

`PolyphonicSourceModel 1.0.0` has exactly one `divisions` value and one time signature per measure. Therefore PA-2.1 requires those timing values to be stable for the projected measure.

Direct `<attributes>` elements before the first note/backup/forward may establish or update the inherited values. A divisions or time-signature change after timing activity has begun is outside the PA-2 initial contract and must fail closed rather than being silently flattened into one measure-level value.

The expected measure duration is:

```text
expectedDurationDivisions = divisions × beats × 4 / beatType
```

The result must be a positive safe integer and must match the PA-1 model validator exactly.

PA-2.1 does not require the final cursor to equal the expected duration. This preserves pickup/implicit and valid multi-voice source layouts. It does require every cursor position and projected event end to stay inside the bounded measure timeline.

## Source-order rule

Only direct MusicXML `<note>` elements create `PolyphonicSourceModel.events[]` entries.

Within each measure:

```text
first source note  → sourceOrder 0
second source note → sourceOrder 1
third source note  → sourceOrder 2
...
```

`backup`, `forward`, `attributes` and other non-note source elements do not increment `sourceOrder`.

The deterministic event identity is:

```text
sourceEventId = <partId>:measure:<measureIndex>:note:<sourceOrder>
source.noteIndex = sourceOrder
```

The events array must remain in this source order even when later voice events move the musical cursor backward.

## Cursor semantics

Each measure starts with:

```text
cursor = 0
```

All cursor arithmetic must use safe integers. Negative zero, `NaN`, `Infinity`, unsafe integers, overflow and underflow are rejected fail closed.

### Normal note or rest

For a `<note>` without `<chord/>`:

```text
onsetDivisions = cursor
cursor = cursor + durationDivisions
```

The note/rest duration must be a positive safe integer.

### `backup`

For a direct `<backup>` element:

```text
cursor = cursor - duration
```

The duration must be a positive safe integer. If subtraction would move the cursor below zero, projection fails closed.

`backup` creates no source event.

### `forward`

For a direct `<forward>` element:

```text
cursor = cursor + duration
```

The duration must be a positive safe integer. If addition is unsafe or moves the cursor beyond the declared measure duration, projection fails closed.

`forward` creates no source event.

### Example: two voices

```text
note voice "1" onset 0 duration 4   → cursor 4
note voice "1" onset 4 duration 4   → cursor 8
backup duration 8                    → cursor 0
note voice "2" onset 0 duration 4   → cursor 4
note voice "2" onset 4 duration 4   → cursor 8
```

The projected event array remains source ordered:

```text
sourceOrder 0 → voice "1" → onset 0
sourceOrder 1 → voice "1" → onset 4
sourceOrder 2 → voice "2" → onset 0
sourceOrder 3 → voice "2" → onset 4
```

## `<chord/>` semantics

`<chord/>` is preserved only as `source.chordWithPrevious = true`.

It does not create a `ChordGroup`, guitar chord shape or arrangement decision.

For a note containing direct `<chord/>`:

- it must be a pitched note, not a rest;
- a source `<note>` must immediately precede it in the same measure with no intervening timing cursor operation;
- the preceding projected source event must be a note;
- voice and staff must match the preceding event;
- `onsetDivisions` equals the preceding event's onset;
- the chord note does not advance the cursor;
- its own positive `durationDivisions` is preserved;
- its end must remain within the declared measure duration.

These rules deliberately match the existing PA-1 validator requirement that `chordWithPrevious` can only refer to the immediately preceding same-voice/same-staff/same-onset note.

Simultaneity across separate voices without `<chord/>` remains source timing only. Grouping those events into a chord is PA-3 authority.

## Voice projection

`PolyphonicSourceModel.voice` is a bounded non-empty string.

PA-2 must not narrow voice IDs to integers.

Projection rule:

- zero direct `<voice>` elements → default voice `"1"`;
- exactly one direct `<voice>` → trim surrounding XML text whitespace and preserve the resulting non-empty source identifier;
- duplicate direct `<voice>` elements → fail closed;
- empty or over-limit voice identifiers → fail closed.

Numeric-looking identifiers remain strings. For example source `2` becomes `"2"`, not integer `2`.

## Staff projection

Projection rule:

- zero direct `<staff>` elements → staff `1`;
- exactly one direct `<staff>` → positive safe integer;
- duplicate direct `<staff>` elements → fail closed;
- accepted staff values are only `1` and `2`;
- staff 3+ fails closed;
- when an active `<staves>` declaration exists, an event may not reference a staff greater than that declaration;
- active `<staves>` itself may not exceed the PA-1 two-staff boundary.

The initial default active staff count is one until a valid source declaration establishes two staves.

## Note/rest projection

A projected source event must represent exactly one pitched note or one rest.

For every direct `<note>`:

- exactly one positive `<duration>` is required;
- `<grace>` is rejected;
- `<time-modification>` is rejected;
- exactly one of direct `<rest>` or direct `<pitch>` must be present;
- duplicate semantic singleton elements fail closed rather than using first/last-wins normalization.

The projector does not require the monophonic adapter's current rhythm-type whitelist merely to establish polyphonic source timing. PA-2 source timing authority is the validated positive MusicXML duration in the active divisions basis. Advanced notation whose semantics cannot be represented safely by `PolyphonicSourceModel 1.0.0` remains separately gated and must be rejected where required by this contract.

## Pitch projection

For note events:

- `step` must be `A` through `G`;
- missing `alter` means `0`;
- explicit `alter` must be an integer from -2 through 2;
- `octave` is required;
- MIDI is derived through the existing pitch utility;
- `written` is deterministically derived from step/alter/octave;
- no source MIDI/written value is trusted over those components.

Rest events contain no pitch.

PA-2 performs no transposition, enharmonic simplification or octave displacement.

## Tie projection

Tie source facts are normalized to the PA-1 booleans:

```text
tieStart
tieStop
```

Both direct `<tie>` and `<notations><tied>` source forms may contribute the same semantic flags. Supported source tie types remain `start`, `stop` and `continue`; malformed tie types fail closed.

A source rest containing any direct `<tie>` or `<notations><tied>` marker is malformed for PA-2 and must fail closed. The projector must reject that source rest before constructing the output event; it must not discard the marker by normalizing both tie flags to false.

Only rest events with no source tie markers produce `tieStart: false` and `tieStop: false`.

## Fields intentionally not created by PA-2

PA-2 must not add fields for:

- `ChordGroup`,
- melody/bass labels,
- arrangement action,
- omission reason,
- octave displacement,
- guitar string/fret,
- left-hand finger,
- barre/partial-barre,
- optimizer cost,
- teacher preference,
- AI/learned score.

It also must not expand the package-root API merely to expose the internal projector.

## Resource-safety requirements

The implementation gate must preserve the existing hostile-input posture:

- before detailed projection, effective measure/event ceilings are `min(runtime.budget.limits.maxMeasures, 2000)` and `min(runtime.budget.limits.maxEvents, 50000)` respectively;
- caller-supplied runtime limits may tighten those ceilings but may not raise projection work above the PA-1 `PolyphonicSourceModel 1.0.0` boundary;
- XML structural limits remain upstream authority;
- measure child scanning is bounded by the already-parsed XML tree limits;
- processing checkpoints are required at projection start, per measure, per timing operation/event, and completion;
- cancellation/deadline failure propagates through the existing processing runtime;
- no recursive unbounded source walk is required for normal projection;
- no network, filesystem, environment or external callback access is allowed;
- projector output must pass the hostile-graph-hardened PA-1 model constructor before return.

PA-2 must not duplicate large source subtrees in its result.

## Failure policy

Projection is fail closed. It must never guess missing timing, invent a voice or staff value other than the explicit contract-defined defaults (`<voice>` absent → `"1"`; `<staff>` absent → `1`), clamp a cursor, silently drop a note, silently repair malformed `<chord/>`, or normalize staff 3+ into the supported range.

Existing error categories should be reused where they already describe the same condition, including unsupported multipart, multistaff, grace and tuplet boundaries. Any new internal error code required specifically for PA-2 must be introduced only with focused negative tests and error-contract review during the implementation gate; PA-2.1 does not expand the public error API.

## Monophonic compatibility invariant

PA-2 implementation must be additive and parallel.

The following must remain unchanged unless a later separately approved high-risk gate explicitly changes them:

- `musicxmlDocumentAdapter.js` rejection of source `<chord/>` on the public monophonic path;
- rejection of multiple voices on the public monophonic path;
- rejection of staff > 1 on the public monophonic path;
- rejection of `backup` / `forward` polyphonic timing on the public monophonic path;
- `convertMusicXmlToCanonicalTab()` behavior;
- `CanonicalMusicDocument`;
- deterministic monophonic candidate/cost/optimizer behavior;
- `CanonicalTabResult 1.0.0`;
- public writer outputs for existing supported fixtures.

## Implementation-gate sequence

PA-2.1 contract completion does not authorize implementation automatically.

The approved follow-on sequence is:

1. `PA-2.2` — valid polyphonic red-first fixtures/tests for the contract;
2. `PA-2.3` — minimal internal projector skeleton and basic note/rest projection;
3. `PA-2.4` — `backup` / `forward` cursor semantics;
4. `PA-2.5` — `<chord/>`, multiple voice and staff 1–2 projection;
5. `PA-2.6` — hostile/budget/deadline/cancellation negative coverage;
6. `PA-2.7` — full regression + deterministic monophonic compatibility evidence;
7. `PA-2.8` — GitHub Tests + MusicXML Compatibility + independent review;
8. separate merge approval.

No later step is authorized by completion of an earlier step.

## PA-2.1 acceptance criteria

PA-2.1 is complete when the repository documentation consistently establishes that:

1. PA-2 is a separate internal projection after `ParsedMusicXmlDocument 1.0.0`;
2. the existing monophonic adapter remains unchanged and fail closed;
3. source-order and musical-onset order are distinct;
4. normal note, `backup`, `forward` and `<chord/>` cursor semantics are explicit;
5. voice is preserved as a bounded string and staff is limited to 1–2;
6. divisions/time-signature inheritance and per-measure stable timing basis are explicit;
7. projector output is exactly `PolyphonicSourceModel 1.0.0` source truth;
8. resource budgets, deadline/cancellation and hostile-input boundaries are inherited rather than bypassed, and effective pre-projection measure/event ceilings are the lower of the caller runtime limit and the PA-1 fixed model ceiling;
9. no arrangement, fingering, public API or canonical-result authority is introduced;
10. runtime implementation remains `NOT_IMPLEMENTED` until the separately approved PA-2.2+ gates.
