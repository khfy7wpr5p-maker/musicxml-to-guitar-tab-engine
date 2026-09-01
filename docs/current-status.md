# Current Implementation Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

This file is the live convergence view. Historical closure/audit documents retain the exact state they measured, but do not override this status.

## Production architecture status

| Area | Status |
|---|---|
| Core parser / normalization architecture | ✅ STABLE |
| Package-root deterministic monophonic API | ✅ PUBLIC / VERIFIED |
| `CanonicalTabResult 1.0.0` package-root authority | ✅ ACTIVE |
| MONO source capo extension: `CanonicalTabResult 1.1.0` | ✅ ACTIVE — explicit nonzero capo only; POLY remains blocked |
| Internal/application POLY_V2 path | ✅ IMPLEMENTED / BOUNDED / NON-PACKAGE-ROOT |
| `CanonicalTabResult 2.0.0` runtime/validator/writer | ✅ INTERNAL/APPLICATION |
| Guitar Pro grace compatibility | ✅ ACTIVE |
| Exact grace nominal type `32nd` | ✅ ACTIVE |
| Exact Guitar Pro bracketed triplet display compatibility | ✅ ACTIVE |
| Exact normalized TAB staff mirror collapse | ✅ ACTIVE |
| Sustain / tie compatibility | ✅ MATERIALLY STRENGTHENED |
| PA-8 false aggregate exhaustion | ✅ CORRECTED WITHOUT RAISING FIXED CEILINGS |
| Same-voice chord false-positive overlap | ✅ CORRECTED |
| Unequal-duration same-voice chord occupancy | ✅ MAX-MEMBER END PRESERVED |
| Determinism | ✅ HARD INVARIANT |
| Source byte / semantic immutability | ✅ HARD INVARIANT |
| Wider real-corpus production hardening | ⚠️ CONTINUES |
| Public PA-13 polyphonic package API | 🔒 NOT IMPLEMENTED |

Package metadata remains version `0.1.0`, `private: true`, Node.js >=18.

## Current production/application path

```text
MusicXML
  → XML safety + bounded parser
  → representation compatibility normalizers
  → PolyphonicSourceModel
  → tie/sustain + active sonority
  → guitar positions
  → PA-8 / PA-9 physical candidates
  → sustained path solver when required
  → deterministic canonical final selection
  → CanonicalTabResult 2.0.0
  → internal/application MusicXML writer
```

The package root remains narrower and does not export PA/PS internals or the POLY_V2 conversion pipeline.

## Compatibility now active

Production code currently contains generic, bounded contracts for:

- exact reviewed Guitar Pro grace representation;
- exact attribute-free grace nominal types `eighth` and `32nd`;
- exact bracketed-below Guitar Pro 3:2 triplet display metadata backed by validated time-modification semantics;
- exact two-staff notation/TAB mirror collapse after original staff-2 TAB evidence and normalized semantic equality are proven;
- exact contiguous closed sustain-stop continuation under PS-2 v1.2.0.

These rules are MusicXML-shape/semantic contracts. They do not dispatch on filename or SHA.

## Sustain / tie / same-voice state

PS-2 `SustainTieGraph` v1.2.0 preserves exact source tie facts and can reconnect only the bounded contiguous closed-stop representation. True orphan stops, identity mismatch, non-contiguous continuation, ambiguous starts, and unterminated chains remain fail-closed.

PS-3 carries logical sustain continuity through sealed chain order. PS-4A carries active notes into later sonority points. PS-4C reuses PA-8/PA-9 physical enumeration per sonority point, and PA-12 can use sustained canonical final selection for the specifically recognized retained-sustain/tie cases.

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE.**

Exact same-voice `<chord/>` members are one attack group. Occupancy extends to the longest member end. A later independent non-chord event that starts before that end remains fail-closed with `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` / `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`; the engine does not invent a voice split.

## PA-8 resource limits

Authoritative constants in `src/music/leftHandShapeModel.js` remain:

- 20,000 left-hand shape candidates per independently processed source group;
- 100,000 complete finger-assignment attempts per independently processed source group.

In the sustained PS-4C path, `src/music/sustainedLeftHandPhysicalStateModel.js` resets the enforcement window once per PS-4A sonority point. This corrects false whole-score/earlier-point aggregate exhaustion while preserving the numerical ceilings, candidate traversal order, physical rules, solver ranking/cost, and tie-break behavior.

## Latest real-corpus evidence

The compatibility hardening sequence through merged PRs #248, #252, #254–#259 and #261 progressively removed representation/sustain false blockers without relaxing semantic safety.

The exact Air corpus evidence associated with PR #259 established:

- POLY_V2 PASS;
- source-byte immutability;
- deterministic canonical output;
- deterministic MusicXML output.

PR #261 then audited the exact Air source and found 842 `<chord/>` members and zero unequal-duration chord members, making the max-member-occupancy hardening a no-op for that corpus while its protected checks remained green. The current repository has no open PR or issue at the start of this documentation refresh.

This is sufficient to say that the previously tracked Air compatibility blocker is no longer a current blocker. It is **not** a claim that every Guitar Pro score is supported. Wider real-corpus hardening remains active work and unsupported notation must continue to fail closed.

## Real-corpus gate contract

Real corpus is used to verify generic behavior:

- expected source SHA identity;
- source byte immutability;
- deterministic runtime result;
- deterministic canonical/MusicXML fingerprints when available;
- no hidden semantic mutation;
- expected fail-closed behavior;
- required CI green.

A newly exposed blocker must be classified on its semantics. Production code must never branch on corpus filename or SHA.

## Safety boundary

The engine does not silently infer or rewrite pitch, octave, onset, duration, voice, staff, tie, chord relationship, source pitch transformation, implicit voice split, ambiguous sustain continuation, or solver ranking. The internal POLY_V2 upload route alone may record an explicit `OCTAVE_DISPLACED` decision of exactly `+12` semitones when a source note below E2 thereby lands within the fixed standard-guitar register.

Renderer output is presentation only. Writers serialize canonical truth. Compatibility normalizers remove or reinterpret only proven representation-level differences. Candidate order, physical policy, ranking/cost, and tie-breaks are not compatibility levers.

## Open architecture gates

1. Wider producer-realistic real-corpus coverage and hardening.
2. Any broader public/package-root polyphonic API remains separately gated.
3. Unsupported or ambiguous notation classes remain fail-closed until a generic evidence-backed contract is reviewed.
4. Learned/runtime-shadow authority, hosting, authentication, persistence, PDF/playback, and release/product gates remain separate from deterministic core semantics.
