# CanonicalTabResult 2.0.0 Internal MusicXML Writer

## Status

- Internal-only writer.
- Canonical input: exact validated `CanonicalTabResult 2.0.0`.
- Output: MusicXML 4.0 score-partwise with standard notation staff + TAB staff.
- Public package-root exposure: none.
- Arrangement/fingering selection authority: none.
- AI/shadow authority: none.

## Authority boundary

The writer consumes already-selected canonical truth. It never reruns PA-4 through PA-9, the deterministic final selector, or GuitarSet scoring. It cannot replace, reorder, filter or reselect notes, string/fret positions, fingers or shapes.

Before writing, the exact v2 validator runs. Invalid or hostile canonical values fail closed.

## Rendering model

The writer:

1. preserves source measure order, measure numbers, divisions and time signatures;
2. writes source rests as timeline events;
3. omits only notes whose canonical disposition is `OMIT`;
4. writes retained notes from canonical `targetPitch`, never from source pitch when the target differs;
5. writes exact canonical string/fret facts on TAB staff;
6. writes selected positive fretting fingers when a selected shape supplies them;
7. duplicates arranged musical events to standard-notation and TAB staves without changing canonical truth;
8. maps source `(staff, voice)` pairs to deterministic numeric output voices;
9. uses `forward` / `backup` cursor operations to preserve independent voice timing;
10. writes same-onset members of one source voice as MusicXML chord members.

Canonical barre/provenance/audit facts that MusicXML does not directly encode remain in the canonical v2 artifact and are not discarded from canonical truth merely because the writer output cannot express them.

## Fail-closed boundary

The writer rejects:

- non-v2 canonical artifacts;
- v2 artifacts that fail exact contract validation;
- unsafe XML text;
- more than the fixed internal output voice-track bound;
- overlapping non-chord events inside one source voice that cannot be serialized without inventing a new voice split;
- impossible measure cursor states.

It does not infer missing rhythm notation metadata such as beams or note-type spelling. MusicXML duration/divisions remain the timing authority for this initial internal writer.

## Compatibility gate

The protected MusicXML Compatibility workflow runs a dedicated `CanonicalTabResult 2.0.0` alphaTab 1.8.4 smoke test on Node.js 18/20/22. The smoke test requires:

- MusicXML import success;
- one guitar track with standard + TAB staves;
- expected sounding MIDI values;
- exact selected TAB string/fret positions;
- explicit rest preservation;
- successful SVG rendering.

This compatibility evidence does not expose the writer publicly and does not authorize PA-13.