# A3 no-loss arpeggiation review recovery

Status: production migration slice on `feature/a3-production-arpeggiation-alternative`.

## Purpose

When strict canonical guitar selection cannot realize a proven simultaneous source group,
the POLY_V2 upload path may attempt one bounded, source-complete provisional
arpeggiation before the existing lossy bounded-reduction fallback.

This is a review surface, not new canonical TAB authority.

## Recovery order

1. `STRICT_CANONICAL_SELECTION`
2. `NO_LOSS_ARPEGGIATION_REVIEW_RECOVERY`
3. `EXISTING_BOUNDED_REDUCTION_REVIEW_FALLBACK`

The no-loss path is attempted only for
`UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION` with reason
`NO_PLAYABLE_FINAL_SELECTION_CANDIDATE` and an exact production
`sourceGroupId`.

## First-slice bounds

- The source group must be proven simultaneous by the production
  `SimultaneousEventModel`.
- Every member of the transformed group must be an ordinary `PRESERVED`
  singleton decision.
- Same-event multi-transform ordering, including octave displacement plus
  arpeggiation, remains deferred.
- Tied group members and grace-ornament recovery are not transformed by this
  slice; existing recovery remains the fallback.
- The first provisional policy uses `SOURCE_ORDER` and
  `spreadDivisions = 1`.
- Candidate order is deterministic policy order, not musical preference
  ranking.
- Source timing remains authoritative and immutable.
- Provisional target timing has `targetTimingAuthority = false`.
- A candidate that would cross the source measure boundary is rejected and the
  existing bounded reduction fallback remains available.
- The candidate is physically revalidated through the production guitar
  solver before it may become a provisional TAB artifact.

## Authority and public result

A feasible no-loss recovery returns:

- status `REVIEW_REQUIRED`;
- `canonicalTabResult = null`;
- arrangement artifact
  `NoLossArpeggiatedGuitarArrangement@1.0.0`;
- authority `PROVISIONAL_REVIEW_ONLY`;
- complete source-note coverage;
- zero omitted and zero unassigned source notes for this artifact type;
- provisional MusicXML containing the TAB representation;
- `generateTab = true`;
- `playback = APPROXIMATE`;
- `export = false`;
- a source-bound `ReviewEditableTabProjection@1.1.0`.

The internal canonical result used during physical revalidation is validation
evidence only. It is never exposed as canonical output and does not acquire
export authority.

## Source immutability

The original source artifact remains unchanged. The target-timing model used
for physical validation is a temporary derived model. The review/edit
projection remains bound to the original source event identities and original
source measures.

## Fallback preservation

Failure to produce a safe no-loss candidate is local and does not itself
become a whole-score hard block. The existing bounded reduction review path is
tried next.

Examples covered by regression tests:

- a short seven-note simultaneous group can become a 7/7 source-complete
  provisional arpeggiation;
- a seven-note whole-note group whose `spreadDivisions = 1` target timing
  would exceed the measure remains on the existing reduction fallback.

## Verification gates

The migration must keep green:

- Tests on Node.js 18, 20, and 22;
- MusicXML Compatibility on Node.js 18, 20, and 22;
- alphaTab browser/render diagnostics;
- MuseScore CLI availability.

The public capability contract recognizes the no-loss artifact only when its
exact review-only authority, complete coverage, timing-authority flags,
physical validation status, renderer digest, and source identity all validate.
