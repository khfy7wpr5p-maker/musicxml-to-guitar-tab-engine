# Measure overflow review boundary

The upload runtime exposes an exact `PolyphonicMusicXmlProjectorError` with
`INVALID_MUSICXML` and `details.reason = MEASURE_EVENT_OVERFLOW` as
`REVIEW_REQUIRED` on the POLY_V2 route after XML parsing and safety checks.
Other invalid or unsupported inputs retain their existing classification.

The strict projector continues to throw. No notes are truncated, shifted,
deleted or converted to monophony. No canonical TAB or writer output is created.
The returned `reviewState` uses the existing Stage 04 `OmrReviewScoreState`
contract and `OMR_MEASURE_DURATION_MISMATCH` code; it can be passed with a
source-bound review revision to `createReviewEditorSession`. The evidence
contains the source event identity, voice, staff, onset, duration, actual end
and expected measure duration. `preflight.canOpenForReview` is true while
`preflight.canProcess` remains false.

This reports the first projection failure, not a complete scan of all defects.
After a teacher corrects the source revision, the complete validation pipeline
must run again before canonical approval. Review availability does not promise
that every downstream renderer can display the malformed timing, and the
consumer UI must connect the supplied review state to its editor.

Private Stage 09 source files remain outside the repository. Changing a case
from BLOCKED to REVIEW_REQUIRED does not supply the missing real PASS evidence
and does not complete Stage 09.

Regression coverage: `tests/measureOverflowReview.test.js` verifies review
session creation and issue selection, source immutability, determinism, strict
projection rejection, explicit corrected-input TAB generation and negative
XML/safety cases.
