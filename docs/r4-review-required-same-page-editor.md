# R4 — REVIEW_REQUIRED Same-Page Pitch Editor

<!-- ARCHITECTURE-SNAPSHOT: 2026-09-13 -->

## Outcome

R4 connects the first executable correction slice for provisional guitar arrangements. A dense piano score that previously displayed TAB but disabled or blocked editing can now select an assigned note in the existing score/TAB page, change its written pitch, and regenerate the provisional TAB without changing the immutable uploaded bytes.

This is deliberately narrower than “every edit is supported.” It proves one complete vertical path rather than advertising controls without backend authority.

## Executable flow

1. Upload parses and normalizes the MusicXML under existing size, safety and processing limits.
2. If full guitar assignment fails at an admitted recoverable boundary, partial recovery writes `PartialGuitarTabArrangement 1.0.0`.
3. The backend derives `ReviewEditableTabProjection 1.0.0` from the original source model and the explicit partial dispositions.
4. The Workbench host presents that projection to the existing same-page score/TAB selection core while retaining authoritative `REVIEW_REQUIRED` state.
5. The edit request carries immutable source SHA, exact source event/location, complete simultaneous-group acknowledgement and the requested pitch.
6. The backend replays the cumulative command chain from the original bytes through the production compatibility projection.
7. Guitar assignment and MusicXML/TAB writing run again. A still-dense result remains `REVIEW_REQUIRED`, provisional and non-exportable.

## Root causes corrected

- Partial TAB output had no renderer-to-original-source selection model.
- The capability contract correctly kept `editPitch=false`, because no executable review edit path existed.
- The POLY_V2 edit runtime rejected every non-`PASS` upload before applying a command.
- The host cleared authoritative review state after a polyphonic edit.

## Authority and safety

`ReviewEditableTabProjection` is `PROVISIONAL_REVIEW_ONLY`. It is never exposed as `CanonicalTabResult`, never enables export and never changes package-root API authority. `editPitch` becomes true only when the projection and its partial artifact validate against the same immutable upload SHA. Unknown, unsafe, structurally invalid or non-recoverable input remains blocked.

## Current UI boundary

The correction panel remains on the same Workbench page as notation and TAB. On desktop it is the existing side panel; responsive layouts use the same controls below the score. The connected primitive is pitch replacement for an assigned, untied POLY_V2 source note.

The ST Score Editor Core remains the intended broader notation editor for future rhythm/voice operations. It is not falsely labeled as a TAB editor. Direct string/fret correction needs a dedicated validated TAB adapter because changing a fret can also change pitch, tuning consistency and simultaneous-hand feasibility.

## Still open

- rhythm and duration editing;
- voice/staff/structure editing;
- tied-note pitch editing;
- direct string/fret/finger choice editing;
- saving a durable Stage 05 teacher correction ledger through the complete Stage 06/08 workflow;
- a fresh real-corpus browser audit proving teacher editability file by file.

“Every MusicXML” therefore means every safely parseable supported document should yield either canonical TAB, provisional review TAB, or a precise bounded rejection. It cannot safely mean accepting hostile XML or inventing missing musical semantics.
