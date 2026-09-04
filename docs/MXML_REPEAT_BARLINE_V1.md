# MXML_REPEAT_BARLINE_V1

Status: `SUPPORTED` for the bounded V1 shapes below.

Last verified base main SHA before implementation: `a4cf7ffa8760fcb65240b18d6c86c0826f86ebba`.

## Authority boundary

MusicXML `<repeat>` is playback-order semantics. `<bar-style>` is engraving metadata. The parser therefore records repeat boundaries separately from visual barline style and never lets `bar-style` create a repeat by itself.

MusicXML 4.0 reference:

- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/repeat/
- https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/

The MusicXML reference defines `direction="forward"` as the repeat start, `direction="backward"` as the repeat end, and optional backward `times` as the number of times the repeated section is played. The reference leaves `times` optional. For a conventional unqualified repeat sign, this V1 capability uses one repeat after the first traversal: two total traversals. This policy is explicit and versioned; it is not inferred from words, tempo, filename, composer, or corpus identity.

## Supported exact shapes

V1 accepts:

- explicit left barline + `repeat direction="forward"`;
- explicit right barline + `repeat direction="backward"`;
- optional supported `bar-style` before the repeat child;
- explicit backward `times` from 2 through 8;
- multiple sequential, non-overlapping repeat regions;
- right `light-heavy` or other supported bar-style without `<repeat>` as presentation-only metadata.

Supported presentation bar styles are the pre-existing bounded runtime set:

`regular`, `dotted`, `dashed`, `heavy`, `light-light`, `light-heavy`, `heavy-light`, `heavy-heavy`, `tick`, `short`, `none`.

## Canonical playback occurrence plan

The repeat normalizer emits a bounded immutable occurrence plan. Every occurrence has:

- `occurrenceIndex`;
- `sourceMeasureIndex`;
- `repeatPass` (`0` outside a repeat region, `1..N` inside one).

The plan references original source measure identities. It never clones, renumbers, or rewrites source events. The source `PolyphonicSourceModel` therefore remains single-copy and deterministic.

Example for source measures `[0, 1, 2]` with a repeat over measures `0..1`:

`[0, 1, 0, 1, 2]`

With `times="3"`:

`[0, 1, 0, 1, 0, 1, 2]`

The derived plan is capped at 10,000 measure occurrences. The repeat count is capped at 8. These are dedicated repeat-safety bounds; existing parser, solver, and processing ceilings are not raised.

## Solver boundary

Repeat parsing does not change:

- pitch;
- onset;
- duration;
- voice;
- tie/chord relations;
- guitar tuning or physical feasibility;
- solver cost, ranking, transition policy, or tie-breaks.

The solver continues to select positions for the immutable source events. Repeat playback reuses those source selections rather than creating new semantic note identities.

## Writer behavior

The production compatibility chain passes both the explicit occurrence plan and exact repeat-barline records through the internal `notationContext` writer boundary.

`canonicalTabMusicXmlWriterV2.js` is now a narrow repeat-aware wrapper around the previous writer implementation, preserved byte-for-byte as `canonicalTabMusicXmlWriterV2Base.js`.

The wrapper:

1. validates the explicit bounded occurrence plan;
2. validates repeat records against canonical source measure identity;
3. calls the unchanged base writer;
4. restores exact MusicXML repeat marks at the validated left/right measure boundaries.

The writer does not infer repeat regions from `bar-style`. It does not expand or duplicate source measures in the serialized score. Playback-capable MusicXML consumers receive the equivalent repeat semantics while canonical source measure/event identity remains unchanged.

## Fail-closed V1 limits

The following remain unsupported:

- orphan backward repeat;
- unclosed forward repeat;
- nested/crossing repeat regions;
- multiple repeat markers in one source measure;
- endings / voltas;
- `after-jump` and `winged` repeat attributes;
- implicit repeat boundaries;
- malformed or reordered repeat children;
- repeat counts outside 2..8;
- derived traversal above the fixed occurrence ceiling.

These cases return a located `UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE` issue rather than guessing playback order. The normalizer includes `reviewDisposition: REVIEW_REQUIRED` evidence for stable locations; the current upload result remains hard-blocked where the owning runtime does not expose a safe review-source artifact.

## Source immutability and determinism

The normalizer works on cloned parsed nodes. Original upload bytes are never modified. Tests require:

- two-run occurrence-plan equality;
- two-run upload-result equality;
- input SHA-256 equality before/after conversion;
- canonical source measure indices remain single-copy and unchanged.

## Non-goals

This capability does not implement D.S., D.C., Coda, Segno, endings/voltas, arrangement simplification, technique inference, or solver-policy changes. No filename, title, composer, path, corpus ID, or hash based behavior is permitted.
