# EDTAB-02 — Early source identity and ReviewTabDraft 1.0.0

EDTAB-02 adds a review-only boundary before strict polyphonic compatibility normalization can erase the teacher workflow.

## Authority

`ReviewTabDraft 1.0.0` has authority `PROVISIONAL_TEACHER_REVIEW_ONLY`.

It is **not** a `CanonicalTabResult`, does not count as a generated TAB artifact, and never grants export authority. The additive upload-result schema is `1.6.0`; the review capability contract is `1.4.0`.

## SourceReviewIndex 1.0.0

After XML safety and bounded parsing, a single selected `score-partwise` part can be indexed before strict repeat/direction/representation normalization.

Each source event records:

- `sourceUploadSha256`
- `selectedPartId`
- `measureId`
- `sourceEventId`
- known pitch, onset and duration or explicit null
- source evidence location
- uncertainty reason codes

Stable identities remain:

```text
measureId = <partId>:measure:<measureIndex>
sourceEventId = <partId>:measure:<measureIndex>:note:<sourceOrder>
```

No unknown pitch, onset or duration is invented.

## ReviewTabDraft 1.0.0

For an allow-listed early review failure, the runtime may attach a source-bound draft.

Known pitched notes without an already validated guitar position use `UNASSIGNED`; uncertain source notes use `SOURCE_UNKNOWN`. EDTAB-02 never invents a string or fret. The render model may show `?` only when source timing is known; otherwise the source event remains addressable without fabricated rhythmic placement.

The draft exposes `draftVisible` separately from `generateTab`:

- `draftVisible=true` means the review draft can be shown;
- `generateTab=true` still requires a canonical or established provisional TAB artifact;
- `export=true` still requires ordinary `PASS` and canonical authority.

EDTAB-02 does not enable teacher string/fret mutation. That remains EDTAB-03.

## Fail-closed boundary

No ReviewTabDraft is produced for unsafe XML, parse failure, resource-limit failure, unsupported input identity, or a source that cannot be bounded into the initial single-part source-review contract.

ReviewTabDraft evidence is validated against the input SHA, source artifact, source identities and six-string guitar configuration before `draftVisible` becomes true. Tampered position or identity evidence fails closed.
