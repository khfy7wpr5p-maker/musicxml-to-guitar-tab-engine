# Reviewable Score State Contract

Status: Stage 01 application contract. This does not change the package-root API.

## Independent dimensions

Every application score result has two independent dimensions:

| Dimension | Values | Meaning |
|---|---|---|
| Route | `MONO_V1`, `POLY_V2`, `UNRESOLVED` | Which deterministic conversion path was selected, or that no route was safely resolved. |
| Status | `PASS`, `REVIEW_REQUIRED`, `BLOCKED` | Whether the score can continue automatically, can safely open for teacher review, or must not proceed. |

`POLY_V2 + REVIEW_REQUIRED` is valid. Selecting `POLY_V2` never promises automatic success, and `REVIEW_REQUIRED` never authorizes a MONO fallback.

## Status meaning

- `PASS`: no error issue remains. Processing may continue on the selected route.
- `REVIEW_REQUIRED`: automatic processing stops, but immutable source bytes are safely available to the editor and every error issue is explicitly marked reviewable by a trusted backend producer.
- `BLOCKED`: automatic processing stops and the score must not be opened as an editable review score through this contract.

Warnings alone do not change a successful result from `PASS` to `REVIEW_REQUIRED`.

## Classification and precedence

The runtime state helper is `src/app/reviewableScoreState.js`.

1. Any error in `safety`, `parse`, `structure`, or `transport` is a hard block.
2. Any error not explicitly classified by a trusted backend producer as `reviewDisposition: 'REVIEW_REQUIRED'` is a block by default.
3. A reviewable error must be in `content`, `semantic`, or `quality`, must carry the explicit disposition, and requires `sourceReviewAvailability: 'SAFE_TO_OPEN'`.
4. A hard block always wins when it appears alongside reviewable errors.

This allow-list is deliberately narrow. Stage 04 adds the evidence-backed OMR producer in `src/app/omrReviewEvidence.js`; it does not make unclassified parser, safety, capability, playability, physical or structural failures reviewable by default. See [`stage-04-omr-review-evidence-contract.md`](stage-04-omr-review-evidence-contract.md).

## Editor-facing issue location

Every state issue has the stable location shape:

```js
{
  measure: string | number | null,
  measureIndex: number | null,
  eventIndex: number | null,
  sourceEventId: string | null,
}
```

Locations are evidence for navigation and highlighting only. They do not grant browser-side semantic authority.

## Compatibility boundary

Stage 04 now supplies a concrete, safe OMR evidence producer that can build this score-state contract from trusted OMR provenance. The existing upload runtime still returns only its existing `PASS`/`BLOCKED` results because `processMusicXmlUpload()` does not itself receive or authenticate OMR evidence. Unknown failures therefore remain fail-closed, while an OMR-aware host/backend has an explicit bounded path to produce `REVIEW_REQUIRED` without guessing missing music.
