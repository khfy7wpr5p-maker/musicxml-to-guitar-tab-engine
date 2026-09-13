# R6 Review Duration Editor

R6 adds one executable rhythm-correction slice to the same-page Guitar TAB Workbench. It does not claim a general notation editor.

## Executable contract

- `MusicXmlPolyphonicNoteEditRuntimeV2Result` advances to `1.2.0`.
- A POLY_V2 command may carry optional `durationDivisions`, which must be a positive safe integer.
- The command remains bound to the immutable source SHA, exact measure/source event and complete simultaneous-group identity.
- The browser sends the current pitch with the duration request; it does not rewrite MusicXML or manufacture a patch.
- The backend replays every accepted command from the original source bytes, rebuilds `PolyphonicSourceModel`, reruns guitar arrangement/selection and serializes fresh score-plus-TAB MusicXML.

`MusicXmlUploadRuntimeResult` additive schema advances to `1.4.0`; capability contract `1.2.0` grants `editRhythm` only on a POLY_V2 result that already has canonical TAB authority or a backend-validated review projection. `BLOCKED`, source-only review and non-POLY routes remain closed.

## Same-page behavior

The Note panel shows the selected event's exact duration in source divisions. `Apply duration & regenerate TAB` is enabled only for an exactly mapped, untied POLY_V2 note with rhythm-edit capability. The revised result is loaded into alphaTab only after the backend returns regenerated MusicXML.

The initial control intentionally uses exact MusicXML divisions instead of guessing a displayed note type. Tuplets, dots and divisions that do not map cleanly to a simple note-name menu therefore remain representable without lossy browser conversion.

## Fail-closed boundaries

- zero, negative, non-integer and unsafe duration values are rejected at request normalization;
- a duration extending past the measure fails source-model validation;
- an unsafe same-voice overlap fails writer validation;
- groups containing ties remain outside this edit gate;
- failed regeneration does not append the revision or replace the visible accepted score.

## Voice adapter finding

The pinned ST Score Editor audit exposes bounded duration primitives, but no reviewed canonical voice-reassignment primitive. Cross-staff display movement is not canonical voice reassignment. R6 therefore keeps `editVoice: false`; enabling a visible voice control without a trusted backend mutation would create UI-only authority and is prohibited.

## Verification

The regression set covers provisional piano duration correction, invalid duration rejection, upload capability authority, framed HTTP transport and static browser wiring. The browser compatibility smoke additionally applies a second cumulative duration revision after a pitch edit and verifies that runtime-only command projection preserves `durationDivisions` while stripping browser-only tie metadata.
