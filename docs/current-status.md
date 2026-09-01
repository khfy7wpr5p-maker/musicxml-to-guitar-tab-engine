# Current Implementation Status

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

This file is the live convergence view. Historical closure/audit documents retain the exact state they measured, but do not override this status.

## Production architecture status

| Area | Status |
|---|---|
| Core parser / normalization architecture | ✅ STABLE |
| Package-root deterministic monophonic API | ✅ PUBLIC / VERIFIED |
| `CanonicalTabResult 1.0.0` package-root authority | ✅ ACTIVE |
| MONO source capo extension: `CanonicalTabResult 1.1.0` | ✅ ACTIVE — explicit nonzero Standard-tuned source capo |
| POLY physical configuration plumbing | ✅ INTERNAL — PA-7/PA-8/PA-9 and both final selectors consume the resolved source capo |
| Internal POLY capo canonical extension: `CanonicalTabResult 2.1.0` | ✅ INTERNAL/APPLICATION — relative positions + MusicXML `<capo>` for explicit internal capo |
| Capo-only later `staff-details` restatement | ✅ ACTIVE / BOUNDED — only prior complete same-part/same-staff six-string tuning may be reused |
| Internal/application POLY_V2 path | ✅ IMPLEMENTED / BOUNDED / NON-PACKAGE-ROOT |
| `CanonicalTabResult 2.0.0` runtime/validator/writer | ✅ INTERNAL/APPLICATION — exact standard behavior preserved |
| Guitar Pro grace compatibility | ✅ ACTIVE |
| Exact grace nominal type `32nd` | ✅ ACTIVE |
| Exact grace accidental display compatibility | ✅ ACTIVE / BOUNDED |
| Exact Guitar Pro bracketed triplet display compatibility | ✅ ACTIVE |
| Exact normalized TAB staff mirror collapse | ✅ ACTIVE |
| Exact display-only rehearsal direction compatibility | ✅ ACTIVE |
| Sustain / tie compatibility | ✅ MATERIALLY STRENGTHENED |
| PA-6 target MIDI in sustained physical selection | ✅ ACTIVE / INTERNAL — source pitch and tie identity remain unchanged |
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
  → CanonicalTabResult 2.0.0 (standard) / 2.1.0 (explicit internal capo)
  → internal/application MusicXML writer
```

The package root remains narrower and does not export PA/PS internals or the POLY_V2 conversion pipeline.

## Compatibility now active

Production code currently contains generic, bounded contracts for:

- exact reviewed Guitar Pro grace representation;
- exact attribute-free grace nominal types `eighth` and `32nd`;
- exact plain grace accidental display metadata only when one attribute-free leaf exactly matches the authoritative pitch/alter spelling;
- exact bracketed-below Guitar Pro 3:2 triplet display metadata backed by validated time-modification semantics;
- exact two-staff notation/TAB mirror collapse after original staff-2 TAB evidence and normalized semantic equality are proven;
- exact display-only `<direction><direction-type><rehearsal>…</rehearsal></direction-type></direction>` provenance when the enclosing elements contain no timing, playback, staff/voice, layout, extension, attribute, or stray-text semantics;
- exact contiguous closed sustain-stop continuation under PS-2 v1.2.0;
- a later capo-only `staff-details` restatement may reuse only a previously complete validated six-string tuning from the same part/staff. First-use capo-only, cross-staff borrowing, partial tuning, real capo changes, and unsupported tuning profiles remain fail-closed.

These rules are MusicXML-shape/semantic contracts. They do not dispatch on filename or SHA.

## Sustain / tie / same-voice state

PS-2 `SustainTieGraph` v1.2.0 preserves exact source tie facts and can reconnect only the bounded contiguous closed-stop representation. True orphan stops, identity mismatch, non-contiguous continuation, ambiguous starts, and unterminated chains remain fail-closed.

PS-3 carries logical sustain continuity through sealed chain order. PS-4A carries active notes into later sonority points. PS-4C reuses PA-8/PA-9 physical enumeration per sonority point, and PA-12 can use sustained canonical final selection for the specifically recognized retained-sustain/tie cases.

For retained PA-6 octave-displacement decisions, the original `PolyphonicSourceModel`, source pitch, timing, voice/staff, and tie graph remain authoritative and unchanged. The sustained selector builds a validated frozen `sourceEventId -> targetMidi` index and threads it through PS-5 → PS-4C/PS-4B → PS-4A. Only PS-4A fretboard candidate enumeration consumes the target MIDI. Candidate enumeration policy, physical validation, path cost vector, ranking, tie-break, resource ceilings, reduction policy, writer authority, and public API are unchanged.

This source-tie-preserving design replaced and rejected an intermediate target-pitch source-model projection that could collapse distinct source tie identities into a target-pitch unison and create a false `AMBIGUOUS_TIE_START`. That unsafe intermediate design was never merged.

**VALID SAME-VOICE CHORD ≠ INDEPENDENT OVERLAPPING NOTES WITHIN ONE VOICE.**

Exact same-voice `<chord/>` members are one attack group. Occupancy extends to the longest member end. A later independent non-chord event that starts before that end remains fail-closed with `UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION` / `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`; the engine does not invent a voice split.

## PA-8 resource limits

Authoritative constants in `src/music/leftHandShapeModel.js` remain:

- 20,000 left-hand shape candidates per independently processed source group;
- 100,000 complete finger-assignment attempts per independently processed source group.

In the sustained PS-4C path, `src/music/sustainedLeftHandPhysicalStateModel.js` resets the enforcement window once per PS-4A sonority point. This corrects false whole-score/earlier-point aggregate exhaustion while preserving the numerical ceilings, candidate traversal order, physical rules, solver ranking/cost, and tie-break behavior.

## Latest real-corpus evidence

The compatibility hardening sequence through merged PRs #248, #252, #254–#259, #261, and later Stage 03 bounded compatibility/physical slices progressively removed representation/sustain false blockers without relaxing semantic safety.

PR #276 merged the exact display-only rehearsal-direction compatibility contract. PR #280 then admitted only the proven capo-only later `staff-details` restatement shape, removing four false guitar-configuration provenance blockers while leaving alternate-tuning policy unchanged. PR #282 admitted exact matching grace accidental display metadata without allowing mismatched, duplicate, editorial/cautionary, nested, or malformed forms.

PR #284 merged the source-tie-preserving PA-6 target-MIDI sustained physical-selection contract. Its audited candidate tree and the production squash-merge tree are identical (`c241746c6ab949db0fdec9cb7006fd7ac1b60ae0`). Required Tests, MusicXML Compatibility, and Runtime Staging E2E were green, and unresolved review threads were zero.

Fresh exact nine-file Guitar Pro evidence for the PR #284 tree established:

- 9/9 exact manifest SHA identities;
- 9/9 deterministic processing;
- 9/9 source-byte immutability;
- duplicate gate reports byte-identical;
- `[Air]鸟之诗.xml` remains POLY_V2 PASS;
- `[Air]回想录.xml`, `[Air]夢語り.xml`, and `[Beck]Face.xml` now reach the genuine sustained physical boundary `UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION / NO_DISTINCT_STRING_ASSIGNMENT`;
- `[Beck]Face.xml` no longer produces the rejected target-projection `AMBIGUOUS_TIE_START`, proving source tie identities remain intact through target-MIDI physical selection;
- `[Air]银色.xml` and `[Angel Beats!]Brave Song.xml` remain fail-closed on unsupported alternate tuning profiles;
- `[Air]てんとう虫(瓢虫).xml` remains fail-closed on semantic repeat/ending barline representation;
- `[Angel Beats!]一番の宝物.xml` remains fail-closed at the fixed XML element safety limit;
- `[CLANNAD]メグメル(幻想).xml` remains fail-closed on unsupported artificial-harmonic technical semantics.

The current corpus therefore exposes one PASS and eight classified fail-closed boundaries. These are not permission to optimize for corpus pass count: they are evidence that the previously tracked false representation/target-pitch blockers have been removed and that the next widening requires a separately reviewed generic contract or new producer-realistic evidence.

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

Physical `NO_DISTINCT_STRING_ASSIGNMENT` must not be bypassed by changing solver ranking/cost/tie-break or inventing string assignments. Unsupported alternate tuning profiles must not be enabled by compatibility inference. Semantic repeat/ending barlines must not be stripped as display-only metadata. Fixed XML safety ceilings must not be raised as a compatibility workaround. Artificial-harmonic semantics must not be guessed from notation shape alone.

Renderer output is presentation only. Writers serialize canonical truth. Compatibility normalizers remove or reinterpret only proven representation-level differences. Candidate order, physical policy, ranking/cost, and tie-breaks are not compatibility levers.

## Open architecture gates

1. Wider producer-realistic real-corpus coverage and hardening, with the current eight classified fail-closed boundaries preserved until generic evidence supports a bounded contract.
2. Any broader public/package-root polyphonic API remains separately gated.
3. Unsupported or ambiguous notation classes remain fail-closed until a generic evidence-backed contract is reviewed.
4. Learned/runtime-shadow authority, hosting, authentication, persistence, PDF/playback, and release/product gates remain separate from deterministic core semantics.
