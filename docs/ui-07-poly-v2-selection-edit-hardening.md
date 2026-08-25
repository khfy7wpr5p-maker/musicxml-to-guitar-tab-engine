# UI-07 — POLY_V2 Selection & Edit Hardening

Status: active PR #165 gate; completion still requires the exact PR head to reach `main` through the protected Node and browser CI gates.

## Scope

UI-07 hardens the already-guarded POLY_V2 Workbench edit seam without giving the browser independent MusicXML, arrangement, fingering or TAB authority.

The accepted new capability is narrow:

1. same-pitch notes at one onset may be distinguished only when stable renderer/source voice, onset and chord evidence proves an exact source event;
2. retained POLY_V2 ties remain outside this gate and continue to fail closed in deterministic final selection.

When identity cannot be proven exactly, selection or editing fails closed.

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

## Retained-tie boundary

UI-07 does **not** add POLY_V2 retained-tie edit authority.

The authoritative upload/final-selection path continues to return `BLOCKED` for retained ties with:

- issue code `UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION`;
- reason `RETAINED_TIE_NOT_SUPPORTED`;
- requirement for a separately versioned sustained-sonority selector before that capability can be considered.

The authoritative `MusicXmlPolyphonicNoteEditRuntimeV2` contract therefore remains version `1.0.0`. Its existing fail-closed group-with-ties gate is unchanged.

The Workbench may derive `sourceTieEventIds` as read-only renderer/source identity evidence. The runtime host adapter deliberately projects browser POLY_V2 commands back to the existing v1 command schema before `/edit/poly-v2`; `sourceTieEventIds` is not sent as edit authority.

## Regeneration authority

An accepted untied POLY_V2 command still follows the existing authority chain:

`immutable MusicXML bytes + exact SHA + cumulative bounded v1 commands → POLY_V2 source projection → exact simultaneous-group validation → one source pitch revision → CanonicalTabResult v2 rebuild → deterministic guitar selection/fingering rebuild → MusicXML serialization → alphaTab reload`

The browser never mutates rendered fret/string values or CanonicalTabResult data in place.

All browser and compatibility hosts must preserve the same boundary: UI-only identity metadata is recorded for diagnosis and selection continuity, then projected to the exact v1 runtime command before the authoritative edit function is invoked. Test hosts are part of this contract and must not bypass that projection.

## Inspector evidence

The Fingering inspector remains read-only and may surface selection evidence including:

- source voice;
- deterministic source event id;
- simultaneous group id (or `single`);
- observed tie evidence;
- current deterministic string/fret when present;
- renderer identity context for POLY_V2 selections.

This is diagnostic evidence only and cannot expand the authoritative edit target.

## Fail-closed boundaries

UI-07 continues to reject or block:

- retained POLY_V2 ties at deterministic final selection;
- missing or stale exact source SHA;
- source event/order mismatch;
- incomplete or reordered simultaneous-group acknowledgement;
- renderer/canonical voice, onset or chord-fingerprint disagreement;
- unplayable requested pitch;
- any route other than the explicit MONO_V1 or existing untied POLY_V2 edit seam.

## Verification gates

Completion requires all pre-existing gates plus:

1. regression test proving retained POLY_V2 ties remain `BLOCKED` with `RETAINED_TIE_NOT_SUPPORTED`;
2. runtime test proving an untied same-pitch unison group is `PASS` and only the acknowledged source event changes;
3. static browser identity/safety contract;
4. static host-boundary contract proving browser tie metadata is not projected into the v1 POLY_V2 edit command;
5. real Chromium smoke proving two simultaneous C4 voices select different deterministic source event ids;
6. real Chromium smoke proving one untied unison voice edits through runtime contract `1.0.0` while the peer remains C4;
7. existing stale renderer/source mismatch smoke remains fail-closed;
8. existing MONO tie-chain, existing POLY_V2 edit, Pages preview and alphaTab compatibility gates remain green.
