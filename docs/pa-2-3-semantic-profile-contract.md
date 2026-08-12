# PA-2.3S-0 Semantic Profile Contract

## Status

- Gate: `PA-2.3S-0`
- Scope: documentation / architecture contract only
- Runtime implementation: unchanged by this gate
- Tests: unchanged by this gate
- Public package API: unchanged
- Existing monophonic conversion: unchanged
- Existing PA-2.3 projector implementation: unchanged
- PR metadata / review threads: unchanged
- Merge: not authorized by this gate
- PA-2.3S-1 / PA-2.3S-2: not authorized by this gate

This document is a normative addendum to `docs/polyphonic-projection-contract.md` for the PA-2.3 minimal projector. It narrows how MusicXML constructs are classified before projection so that unsupported musical meaning cannot be accepted merely because there is no dedicated rejection branch.

The governing rule is:

> A PA-2.3 source construct must be explicitly classified as `SUPPORTED`, `SAFE_IGNORE`, `LATER_GATE`, or `REJECT`. Unknown same-profile MusicXML semantics default to `REJECT`.

This gate deliberately changes documentation only. It does not claim that the current runtime already enforces every rule below.

## Standards baseline

PA-2.3S-0 uses MusicXML 4.0 as the final published normative format baseline.

The MusicXML 4.0 W3C XSD has no target namespace. The schema states that the MusicXML 4.0 DTD has no namespace and that the 4.0 XSD also has no namespace for compatibility. MusicXML 4.1 is still a draft / future-format signal and is not a runtime support promise in this gate.

Canonical references:

- MusicXML 4.0 XSD: `https://www.w3.org/2021/06/musicxml40/listings/musicxml.xsd/`
- MusicXML 4.0 note: `https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/note/`
- MusicXML 4.0 attributes: `https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/attributes/`
- MusicXML 4.0 staff-details: `https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/staff-details/`
- MusicXML 4.0 measure-style: `https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/measure-style/`
- MusicXML 4.0 sound: `https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/sound/`

## Namespace profile

### STANDARD_MUSICXML_4_0

Standard MusicXML 4.0 elements are unnamespaced:

```text
uri == ""
```

This is the normative standards profile for PA-2.3S.

### NONSTANDARD_NAMESPACED_COMPAT

The current repository also accepts the URI:

```text
http://www.musicxml.org/ns/musicxml
```

This URI is **not** the standard MusicXML 4.0 namespace. PA-2.3S-0 records it only as an existing non-standard compatibility behavior. This gate neither removes nor expands that compatibility.

A later explicit compatibility decision must either:

1. preserve it as a separately tested compatibility profile; or
2. remove it with migration / regression evidence.

It must not be described as the official MusicXML 4.0 namespace.

### FOREIGN_NAMESPACE

An element whose URI differs from the active MusicXML profile is not MusicXML authority for this projector.

A foreign-namespace element:

- must not satisfy required MusicXML structural descendants;
- must not create a projected source event;
- must not increment MusicXML measure or event budgets;
- must not alter pitch, timing, voice, staff, tie, chord, or source identity facts;
- may be skipped as extension content only because it is not MusicXML authority.

A foreign lookalike such as `<x:note>` or `<x:measure>` must never become equivalent to the corresponding MusicXML element by local name alone.

## Semantic classifications

### SUPPORTED

`SUPPORTED` means the construct contributes directly to `PolyphonicSourceModel 1.0.0` or to the deterministic source timing required to create it.

The PA-2.3 minimal subset is:

#### Structure

- `score-partwise` root;
- exactly one selected `score-part` / matching `part` under the active profile;
- direct selected-part `measure` elements in source order;
- bounded part / measure identifiers required by the existing PA contracts.

#### Measure

- `measure@number`;
- `measure@implicit` with exactly `yes`, `no`, or absence;
- direct `attributes` before timing activity;
- direct `note` events.

#### Attributes

- direct `divisions`;
- simple direct `time` with exactly one `beats` and one `beat-type`;
- `staves=1` for PA-2.3.

#### Note / rest source facts

- exactly one direct `pitch` or `rest`;
- positive direct `duration`;
- absent `voice` or voice `"1"`;
- absent `staff` or staff `1`;
- direct `pitch/step`;
- optional direct `pitch/alter` within the existing bounded range;
- direct `pitch/octave`;
- supported tie facts described below.

#### Tie facts

For standard MusicXML 4.0:

- direct `<tie>` sound semantics are `type="start"` or `type="stop"`;
- direct `<notations><tied>` supports `start`, `stop`, and `continue` for PA source-fact normalization;
- `time-only` on either tie form is conditional playback semantics and is not supported by PA-2.3;
- `tied type="let-ring"` is not equivalent to a normal tie and is not supported by PA-2.3.

### Existing compatibility debt: direct `tie type="continue"`

Earlier PA fixtures / contracts accepted direct `<tie type="continue">`. MusicXML 4.0 defines direct `<tie>` with start/stop semantics, while `<tied>` has the broader notation type set.

PA-2.3S-0 records this as existing compatibility debt only. It does not silently redefine it as MusicXML 4.0 standard behavior and does not change runtime behavior or fixtures. PA-2.3S-1 must make this distinction explicit in tests before PA-2.3S-2 changes any behavior.

### SAFE_IGNORE

`SAFE_IGNORE` is an explicit allowlist, not a fallback.

A construct may enter this class only when its omission is known not to change any source fact represented by the PA-2 / PA-1 contract: selected-part structure, measure timing basis, cursor position, note/rest identity, pitch, duration, voice, staff, source chord relation, or tie facts.

For PA-2.3S-0, the initial safe-ignore set is deliberately small.

#### Note notation that is redundant with authoritative duration / pitch facts

- `type` — graphic note type; PA source timing authority remains positive MusicXML `duration` in the active `divisions` basis;
- `dot` — augmentation-dot notation; PA source timing authority remains `duration`;
- `stem` — engraving direction only;
- `beam` — beaming / engraving grouping only for this source-fact contract;
- `notehead` / `notehead-text` — notehead presentation only;
- `accidental` — displayed accidental information; PA pitch authority remains direct `pitch/step`, `pitch/alter`, and `pitch/octave`.

#### Presentation-only note attributes

Presentation / positioning attributes may be ignored when they do not alter the represented source facts, including the MusicXML print-style / positioning family such as:

- `color`;
- `default-x`, `default-y`;
- `relative-x`, `relative-y`;
- font-style attributes;
- print-control attributes;
- unique presentation identifier metadata.

#### Editorial-only content

`footnote` / `level` may be ignored only where they are editorial metadata and cannot stand in for a required semantic child.

Every `SAFE_IGNORE` item must receive positive evidence in PA-2.3S-1. Adding another ignored category later requires a contract change plus focused tests; a missing handler is never evidence that a construct is safe to ignore.

### LATER_GATE

`LATER_GATE` means the semantics are known and intentionally deferred to an already planned gate. PA-2.3 must reject them until that gate is implemented and authorized.

- direct `backup` / `forward` cursor operations → `PA-2.4`;
- direct note `<chord/>` source relation → `PA-2.5`;
- voice identifiers other than `"1"` → `PA-2.5`;
- staff `2` / `staves=2` → `PA-2.5`;
- hostile-input / expanded budget / deadline / cancellation hardening → `PA-2.6`;
- grace-note coverage → later Musical Notation Coverage gate;
- tuplet / `time-modification` coverage → later Musical Notation Coverage gate;
- advanced notation / ornaments / articulations / slurs → later Musical Notation Coverage gates.

`LATER_GATE` is still fail-closed in PA-2.3. It is not permission to partially interpret the construct early.

### REJECT

`REJECT` means PA-2.3 must fail closed because the construct can change musical / playback meaning, introduces source semantics that `PolyphonicSourceModel 1.0.0` cannot preserve, or has not been proven safe to ignore.

This includes, at minimum:

#### Measure-level semantic children

- `direction`;
- `harmony`;
- `figured-bass`;
- `sound`;
- `listening`;
- `barline` when it carries repeat / ending / playback structure;
- `grouping` and other same-profile musical semantics not explicitly listed as `SUPPORTED` or `SAFE_IGNORE`.

A presentation-only measure child may become `SAFE_IGNORE` only through a later explicit contract/test decision.

#### Attributes-level semantic children

- `key`;
- `part-symbol`;
- `instruments`;
- `clef`;
- `staff-details`;
- `transpose`;
- `for-part`;
- `directive`;
- `measure-style`.

`staff-details` is particularly important for guitar / tablature because it can contain `staff-tuning` and `capo`; discarding it can cause downstream interpretation under the wrong tuning.

`transpose` changes the relationship between written and sounding pitch and cannot be silently discarded.

`measure-style` can encode multiple rests, repeated measures / beats, and slash notation and therefore cannot be flattened into an ordinary measure.

#### Note-level semantic children

- `grace` until its later gate;
- `cue`;
- `chord` until PA-2.5;
- `unpitched`;
- `instrument`;
- `time-modification` until its later gate;
- `play`;
- `listen`;
- `lyric`;
- any `notations` child other than the explicitly supported `tied` form.

#### Note-level semantic attributes

- `attack`;
- `release`;
- `dynamics`;
- `end-dynamics`;
- `time-only`;
- `pizzicato`.

These attributes affect performance timing, velocity, repeat-pass applicability, or playing technique and therefore cannot be flattened into an unconditional basic note.

#### Unknown same-profile content

Any same-profile MusicXML child or unqualified semantic attribute not explicitly classified by this document defaults to:

```text
REJECT
```

This is the central PA-2.3S rule that replaces the fragile "add another `if` when a review finds another tag" pattern.

## Protected semantic surfaces

PA-2.3S-1 / PA-2.3S-2 must enforce explicit semantic profiles at least at these surfaces:

1. selected `score-partwise` structure;
2. selected `part` direct children;
3. `measure` direct children;
4. `attributes` direct children;
5. `time` direct children;
6. `note` direct children;
7. `note` unqualified semantic attributes;
8. `pitch` direct children;
9. direct `tie` attributes;
10. `notations` direct children;
11. `tied` attributes.

A generic gate may be implemented as tables / sets or another deterministic representation, but its behavior must follow this contract rather than ad-hoc per-bug branching.

## PA-2.3S-1 red-first test contract

PA-2.3S-1, if separately authorized, must be tests-only and table-driven where practical.

It must prove at least:

### Positive / compatibility-preserving vectors

- current basic pitched note / rest projection still passes;
- existing `type` is accepted as `SAFE_IGNORE`;
- existing dotted-rest fixture using `dot` remains accepted;
- selected presentation-only safe-ignore attributes do not alter source facts;
- standard unnamespaced MusicXML is accepted;
- the existing non-standard namespaced compatibility profile is tested separately and clearly labeled as compatibility, not standard MusicXML.

### Negative semantic vectors

- note child `play`;
- note attribute `pizzicato`;
- note attributes `dynamics` / `end-dynamics`;
- note `listen`;
- unknown same-profile note child;
- unknown same-profile note semantic attribute;
- `attributes/staff-details` with `staff-tuning`;
- `attributes/key`;
- `attributes/clef`;
- `attributes/instruments`;
- `attributes/transpose`;
- `attributes/measure-style`;
- unknown same-profile `attributes` child;
- unsupported `notations` child;
- conditional tie / note playback cases already discovered;
- foreign namespace lookalikes cannot satisfy structure or consume semantic budgets.

### Compatibility-debt vector

Direct `<tie type="continue">` must be tested separately from standard MusicXML 4.0 behavior so a later decision can preserve or remove that compatibility intentionally.

PA-2.3S-1 must not change production code.

## PA-2.3S-2 implementation contract

PA-2.3S-2, if separately authorized after red-first evidence, may introduce one generic semantic gate that implements the tables above.

Required properties:

- default for unknown same-profile semantics is reject;
- `SAFE_IGNORE` requires exact allowlist membership;
- foreign namespace extensions cannot become MusicXML authority by local-name collision;
- `LATER_GATE` constructs fail closed with stable feature identifiers;
- public package API remains unchanged;
- original parsed source remains immutable;
- no guitar arrangement, fingering, TAB, AI, UI, OMR, persistence, or public polyphonic authority is introduced;
- current monophonic behavior must not be weakened merely to make PA-2.3 permissive.

## Resource / deadline boundary

The fresh Codex finding concerning deadline / cancellation observation during `createPolyphonicSourceModel` output-graph validation is **not** solved by this semantic profile.

PR #78 already declares hostile / budget / deadline / cancellation expansion as PA-2.6 non-scope. Therefore PA-2.3S keeps resource/deadline policy separate from semantic classification.

Before PR #78 can be considered merge-ready, that open finding requires an explicit scope adjudication:

- either prove the existing PA-2.3 runtime contract already requires the missing checkpoint and remediate it under a separately authorized narrow package; or
- document and independently verify that the hardening belongs to PA-2.6 without weakening any currently promised deadline/cancellation guarantee.

The finding must not be hidden by the semantic-gate work.

## Merge gate after PA-2.3S

PA-2.3 must not be declared merge-ready solely because individual Codex examples have been patched.

The intended sequence is:

```text
PA-2.3S-0 semantic profile contract
        ↓
PA-2.3S-1 table-driven red-first semantic tests
        ↓
PA-2.3S-2 generic semantic gate
        ↓
focused + full exact-head Tests
        ↓
MusicXML Compatibility
        ↓
resource/deadline P2 scope adjudication / remediation
        ↓
fresh independent exact-head Codex review
        ↓
separate explicit merge approval
```

If fresh review identifies another same-profile MusicXML element or semantic attribute, the first question must be whether the generic profile classified it correctly. The response must not automatically be another one-off rejection branch.

## Non-goals

PA-2.3S does not:

- make MusicXML 4.1 supported;
- claim full MusicXML 4.0 schema validation;
- turn MuseScore, alphaTab, Verovio, or another importer into semantic authority;
- add new `PolyphonicSourceModel` fields;
- implement PA-2.4, PA-2.5, or PA-2.6;
- expand the package-root API;
- merge PR #78;
- resolve historical review threads automatically.
