# UI-07 — POLY_V2 Selection & Edit Hardening

Status: completion is defined by this implementation reaching `main` through the protected Node and browser CI gates.

## Scope

UI-07 extends the already-guarded POLY_V2 Workbench edit seam without giving the browser independent MusicXML, arrangement, fingering or TAB authority.

It addresses two cases that previously failed closed:

1. same-pitch notes at one onset that can be distinguished by stable renderer/source voice evidence;
2. a selected POLY_V2 note that belongs to a valid tie chain.

When identity cannot be proven exactly, selection or editing still fails closed.

## Renderer → source identity evidence

A POLY_V2 renderer note is accepted only after the Workbench proves all applicable evidence:

- stable measure index;
- deterministic active renderer-voice ordinal;
- equal active renderer/canonical voice count for the measure;
- canonical source track ordered by staff then source voice, matching the writer contract;
- pitched-onset ordinal inside that voice;
- exact renderer/canonical chord MIDI multiset at that onset;
- duplicate same-MIDI ordinal inside the chord when a true unison exists;
- exact source event id/order;
- exact simultaneous-group id and complete ordered group membership.

The duplicate ordinal is used only after voice, onset and chord fingerprint evidence agree. A renderer/source mismatch leaves no selected event.

## Tie-chain identity

The POLY_V2 edit command may carry `sourceTieEventIds`. For tied targets this is mandatory in practice because the runtime recomputes the current chain and requires an exact ordered match.

The runtime validates:

- same source staff and voice;
- identical pitch throughout the chain before the requested edit;
- time adjacency inside a measure or exactly across the next measure boundary;
- exactly one predecessor/successor where tie markers require one;
- internally consistent tie-start/tie-stop topology;
- bounded chain length.

Only after these checks pass does the runtime change every member atomically. A mismatch returns `BLOCKED` with `EDIT_SOURCE_TIE_IDENTITY_MISMATCH` or an invalid tie-chain safety issue.

Untied legacy POLY_V2 commands remain compatible: omitted tie acknowledgement normalizes to the selected source event alone.

## Regeneration authority

An accepted command still follows the existing authority chain:

`immutable MusicXML bytes + exact SHA + cumulative commands → POLY_V2 source projection → exact group/tie validation → source pitch revision → CanonicalTabResult v2 rebuild → guitar selection/fingering rebuild → MusicXML serialization → alphaTab reload`

The browser never mutates rendered fret/string values or CanonicalTabResult data in place.

## Inspector evidence

The Fingering inspector remains read-only and now surfaces accepted selection identity:

- source voice;
- deterministic source event id;
- simultaneous group id (or `single`);
- tie-chain size;
- current deterministic string/fret when present;
- renderer identity context for POLY_V2 selections.

This is diagnostic evidence only and cannot change the authoritative edit target.

## Fail-closed boundaries

UI-07 still rejects:

- missing or stale exact source SHA;
- source event/order mismatch;
- incomplete or reordered simultaneous-group acknowledgement;
- malformed/ambiguous tie topology;
- incomplete or reordered tie-chain acknowledgement;
- renderer/canonical voice, onset or chord-fingerprint disagreement;
- unplayable requested pitch;
- any route other than the explicit MONO_V1 or POLY_V2 edit seam.

## Verification gates

Completion requires all pre-existing gates plus:

1. runtime test proving incomplete tie identity is BLOCKED;
2. runtime test proving a complete two-event POLY_V2 tie chain edits atomically while a same-pitch peer remains unchanged;
3. backward-compatibility test for untied POLY_V2 commands;
4. static browser identity/safety contract;
5. real Chromium smoke proving two C4 unison voices select different source event ids;
6. real Chromium smoke proving the tied voice sends the exact tie event list and regenerates only that chain;
7. existing stale renderer/source mismatch smoke remains fail-closed;
8. existing MONO tie-chain, POLY_V2 edit, Pages preview and alphaTab compatibility gates remain green.
