# R5 — REVIEW_REQUIRED Same-Page TAB Position Editor

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-13 -->

## Outcome

R5 connects direct string/fret correction for an already assigned, untied POLY_V2 note. The controls live in the existing Workbench Fingering panel, on the same page as notation and TAB. A successful edit returns regenerated writer MusicXML containing the requested position; the browser does not patch score or TAB markup.

## Executable flow

1. The user selects a renderer note whose source event, onset, voice, simultaneous group and duplicate ordinal are proven.
2. The Workbench copies the current written pitch and adds `selectedPosition { string, fret }` to the cumulative edit command.
3. The host removes browser-only tie metadata and submits only the bounded POLY_V2 `1.1.0` schema with the immutable upload SHA.
4. The backend reparses the original bytes, replays pitch commands and builds the latest exact-position map per source event.
5. Deterministic final selection filters singleton or full chord candidates by that exact position.
6. Partial recovery remaps the source-event override to the reduced provisional model and must retain the requested note.
7. The writer emits a newly generated notation+TAB MusicXML document. The returned disposition must contain the requested string and fret.

## Failure behavior

- String must be 1–6 and fret 0–20.
- The position must produce the arranged target MIDI under the active guitar configuration.
- The complete simultaneous shape must remain physically playable.
- An overridden note may not be silently omitted during sparse piano reduction.
- Any failure blocks the new revision; prior accepted commands and immutable source bytes are unchanged.

## Product boundary

This closes the first direct TAB placement primitive; it does not make the renderer a full notation editor. Rhythm/duration, voice/staff/structure, tied-note position editing, left-hand finger numbers and creation of assignments for provisional `OMIT` notes remain separate versioned work.

The broader ST Score Editor Core is still the intended notation-editing surface for rhythm and voice operations. Its current adapter must not be described as a TAB editor until an equivalent source-identity and revalidation port exists.
