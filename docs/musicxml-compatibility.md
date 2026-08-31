# MusicXML Compatibility Contract

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

This document defines the production compatibility-normalization boundary. It is not a list of corpus-specific exceptions.

## Core rule

Every compatibility rule must be:

- filename-independent;
- SHA-independent;
- driven by exact MusicXML shape and already-proven semantics;
- bounded;
- deterministic;
- fail-closed outside its reviewed shape;
- source-immutable.

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

A real corpus file may reveal a representation difference. The resulting production change is acceptable only when the representation can be described and tested generically without referring to that file's identity.

## Authority boundary

Compatibility normalizers are representation adapters. They do not own or change:

- source pitch/octave;
- onset/duration;
- voice/staff;
- tie semantics beyond exact facts/approved representation continuity;
- chord membership;
- arrangement decisions;
- candidate generation order;
- PA-8/PA-9 physical rules;
- solver ranking/cost/tie-break;
- canonical final selection authority.

A renderer is not semantic authority. A writer serializes canonical truth and may not correct or rerun selection.

## Current exact compatibility profiles

### Guitar Pro grace representation

`src/parser/polyphonicGraceOrnamentExtractor.js` handles the reviewed exact slashed grace profile. Grace musical material is preserved in an order-only sidecar contract. No numeric grace duration or onset is invented unless MusicXML provides separately supported timing semantics.

The exact nominal type whitelist is:

- `eighth`;
- `32nd`.

The type element must be the exact bounded attribute-free leaf representation. Other values, duplicate/attributed/nested forms, grace rests, unsupported grace chords, or unsupported semantics remain `UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT`.

The already-reviewed exact normal grace notehead is display metadata only and does not alter pitch/timing/voice/staff or physical selection.

### Guitar Pro 3:2 triplet display

`src/parser/polyphonicTripletDisplayNormalizer.js` treats MusicXML timing and display as separate concerns.

Timing authority remains the validated exact 3:2 `<time-modification>` contract. In addition to the legacy exact display form, the normalizer may remove and record the exact Guitar Pro display marker:

```text
placement="below"
number="1"
bracket="yes"
type="start" | "stop"
```

The marker must be backed by validated 3:2 timing provenance on the same note and matched in the same staff/voice lane. This does not rescale duration. Conflicting identity/style/placement, genuine overlap, unmatched markers, malformed markup, and unsupported tuplets remain fail-closed.

### Exact notation/TAB staff mirror collapse

`src/app/exactTabStaffMirrorNormalizer.js` may collapse a representation-only staff-2 mirror only after all of the following are proven:

1. the original parsed MusicXML declares two staves and staff 2 has an exact TAB clef;
2. the bounded staff timing boundary/cursor form is valid;
3. staff 1 and staff 2 project to exact normalized musical event equality in every measure;
4. compared facts include event type, onset, duration, pitch, tie flags, and `<chord/>` membership;
5. grace mirror groups and anchor identity match under the dedicated grace compatibility contract;
6. staff-2 TAB technical string/fret representation is not promoted into source musical semantics.

If any proof fails, collapse does not occur. The normalizer does not use filename or source SHA.

### Closed sustain/tie representation

`src/music/sustainTieGraph.js` v1.2.0 owns the bounded representation compatibility for repeated exact closed sustain stops. A current `tieStop` can continue the last closed chain only when the previous segment is an exact contiguous same-identity closed `tieStop` without `tieStart` and the ordinary timing-contiguity rule holds.

The source flags are retained unchanged. No `tieStart` is synthesized. A genuine unmatched stop remains `ORPHAN_TIE_STOP` and fails closed.

## Same-voice chord boundary

MusicXML `<chord/>` is source semantics, not display decoration. Exact validated same-voice chord members are one attack group.

This does **not** permit arbitrary same-voice overlap:

- chord-group occupancy extends to the maximum member end;
- a later independent non-chord attack before that maximum end fails closed as `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`;
- compatibility code may not invent a second voice.

## Source immutability

Compatibility processing may construct normalized immutable derived representations, but it may not mutate the caller's source bytes or rewrite source-model musical facts in place. Corpus gates compare source-byte hashes before and after runtime execution.

## Determinism and resource safety

Compatibility work shares the repository processing-runtime boundary and remains subject to fixed limits, deadline/cancellation, bounded collections, and deterministic ordering. A compatibility fix may not solve a blocker by:

- raising a fixed ceiling without a separate resource-contract review;
- reordering candidates;
- changing physical playability rules;
- changing solver ranking/cost/tie-break;
- using corpus-specific dispatch.

## Renderer evidence

The protected compatibility matrix continues to exercise Node.js 18/20/22 and alphaTab import/render/browser-cursor paths. These checks are evidence that serialized output is consumable; they do not grant alphaTab, MuseScore, or another renderer authority to change engine semantics. Synth/player, MuseScore semantic round-trip, PDF, hosted persistence, and product-release readiness remain separate gates unless explicitly verified elsewhere.
