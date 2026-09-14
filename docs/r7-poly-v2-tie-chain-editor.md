# R7 POLY_V2 Tie-Chain Editor

R7 removes one concrete cause of real TAB edits being blocked: a valid retained POLY_V2 tie made the whole simultaneous group non-editable. The new operation is deliberately narrow—pitch replacement for one proven sustain chain—and does not claim a general notation editor.

## Working contract

`MusicXmlPolyphonicNoteEditRuntimeV2Result` advances to `1.3.0`. Every Workbench command carries exact source-event and simultaneous-group identity plus ordered `sourceTieEventIds`. For an untied note that list contains only the selected source event. For a tied note it contains every segment, in source sustain order.

The backend does not trust the browser list. It parses the immutable original MusicXML, rebuilds `PolyphonicSourceModel`, creates the authoritative `SustainTieGraph`, and compares the submitted list with the current chain. Missing, incomplete, duplicated, reordered or foreign ids fail closed as `EDIT_SOURCE_TIE_CHAIN_IDENTITY_MISMATCH`.

After an exact match, one pitch command updates every source segment before canonical selection and MusicXML writing. The recorded revision is `REPLACE_POLYPHONIC_TIE_CHAIN_PITCH` and includes `affectedEventCount` and the accepted chain ids. Tie start/stop notation is preserved in regenerated score-plus-TAB MusicXML.

## Authority flow

```text
immutable MusicXML + SHA
  → POLY_V2 source/group projection
  → authoritative SustainTieGraph
  → exact group + tie-chain acknowledgement
  → atomic pitch revision on all chain segments
  → physical selection / arrangement
  → canonical score + TAB regeneration
  → alphaTab reload
```

The browser selects and requests; it never rewrites MusicXML, invents a chain, or edits rendered TAB state directly.

## Fail-closed boundaries

- an incomplete or reordered chain acknowledgement is blocked;
- tied-chain duration and explicit string/fret changes are blocked with `EDIT_TIE_CHAIN_OPERATION_NOT_SUPPORTED`;
- an untied target still cannot bypass a tied simultaneous peer;
- malformed source tie topology remains governed by the existing sustain-graph validation/recovery boundary;
- unplayable pitch, physical infeasibility and writer validation remain unchanged;
- commands still replay cumulatively from the immutable source SHA.

## Verification

R7 adds focused backend tests for successful two-measure atomic replacement, incomplete acknowledgement and closed tied-duration behavior. HTTP integration proves the framed production endpoint accepts the exact chain and regenerates both segments. The real Chromium POLY_V2 smoke loads a retained-tie fixture, verifies pitch enabled and duration disabled, sends the chain identity through the host, and checks both segments plus tie notation after regeneration. Existing unison, duration, position, MONO tie-chain, deterministic and source-immutability regressions remain required.

## Remaining correction work

R8 delivers the next slice for the narrower `UNASSIGNED / BOUNDED_GUITAR_REDUCTION` subset: a same-page source-note list plus explicit exact string/fret assignment. Semantic `OMITTED`, tie/grace, voice/staff, note creation/deletion, malformed-tie repair and tied duration/position remain outside that contract.
