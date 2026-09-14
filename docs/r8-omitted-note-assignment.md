# R8 Reduction-Unassigned Note Assignment

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-14 -->

## Outcome

R8 closes the specific workflow where dense piano conversion produced a usable provisional TAB but the teacher could not select a source note omitted by the sparse reduction. The same-page Fingering panel now lists eligible source notes and can assign one exact six-string guitar position. This is not a promise that every semantic MusicXML construct is automatically arranged.

## Authority contract

- `ReviewEditableTabProjection 1.1.0` records `reasonCode` and `assignmentEligible` for every source note.
- Eligibility is granted only when the authoritative arrangement disposition is `UNASSIGNED` with reason `BOUNDED_GUITAR_REDUCTION`, the target is not tied, and its simultaneous group contains no tied member.
- `MusicXmlUploadRuntimeResult` schema `1.5.0` / capability contract `1.3.0` grants `assignTabPosition` only when a validated projection contains at least one eligible event.
- `MusicXmlPolyphonicNoteEditRuntimeV2Result 1.4.0` accepts `assignmentMode: ASSIGN_OMITTED` only together with exact `selectedPosition { string, fret }` and unchanged pitch.
- The browser provides a request, never semantic authority. The backend reparses the immutable source bytes, rebuilds group/tie identity, and validates eligibility again.

## Regeneration path

```text
immutable MusicXML + SHA
  → validated review projection
  → exact unassigned source-event selection
  → explicit teacher string/fret request
  → preserve existing assigned positions
  → force requested event into sparse reduction
  → physical shape + deterministic selection
  → provisional score/TAB writer
```

A successful command is recorded as `ASSIGN_OMITTED_POLYPHONIC_SOURCE_EVENT_POSITION`. The resulting source-note disposition is `KEEP`, contains the requested position, and is removed from the unassigned list. Later exact-position corrections replay after the original assignment command.

## Fail-closed behavior

- position data without explicit assignment intent is blocked;
- assignment intent for an already assigned or otherwise ineligible note is blocked;
- pitch change and assignment cannot be combined;
- tied notes, simultaneous groups containing a tied member, grace notes and semantic `OMITTED` decisions remain ineligible;
- a position that produces the wrong pitch, collides with a retained position, exceeds six-string capacity, or otherwise fails physical selection is blocked;
- a new assignment may not displace or move any previously assigned note;
- source bytes, solver ranking/cost/tie-break rules and resource ceilings are unchanged.

## Verification

Focused backend tests cover deterministic success, exact position, immutable source bytes, preserved prior placements, missing intent, wrong target, combined pitch mutation, physically invalid position and a later position correction. Framed HTTP integration proves the production endpoint carries the new command. Static browser checks cover same-page controls and safe option construction. The real Chromium compatibility smoke loads a dense piano chord, selects a source note absent from provisional TAB, assigns string 5/fret 10, observes assigned count increase from three to four and confirms the authoritative result remains `REVIEW_REQUIRED`.

## Remaining scope

R8 makes dense-piano provisional output manually completable one validated note at a time; it does not guarantee a playable simultaneous realization when the source exceeds guitar capacity. Automatic piano-to-guitar revoicing, octave redistribution, voice reduction, arpeggiation and teacher-approved arrangement preferences require a separately versioned arrangement-policy engine. Canonical voice/staff edits, note creation/deletion and tied duration/position also remain separate work.
