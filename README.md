# MusicXML to Guitar TAB Engine

<!-- ARCHITECTURE-SNAPSHOT: 2026-08-31 -->

A security-first, deterministic MusicXML → playable six-string guitar TAB engine. The repository contains a narrow package-root monophonic API plus separately gated application/internal polyphonic runtime paths. Source MusicXML is immutable source truth; compatibility code may normalize only proven representation differences and may not invent musical semantics.

## Live architecture

The production application path is intentionally layered:

```text
MusicXML input
  ↓
XML safety / bounded parser
  ↓
representation compatibility normalizers
  ↓
PolyphonicSourceModel
  ↓
temporal / tie / sustain graph
  ↓
simultaneous / active-sonority model
  ↓
guitar position candidates
  ↓
PA-8 left-hand physical enumeration
  ↓
sustained path solver
  ↓
canonical final selection
  ↓
CanonicalTabResult 2.0.0 (internal/application authority)
  ↓
MusicXML / TAB writer
```

The package-root API remains deliberately narrower: standard MONO output uses `CanonicalTabResult 1.0.0`; an explicit nonzero Standard-tuned source capo produces the compatible MONO `CanonicalTabResult 1.1.0` extension. The internal/application POLY route likewise emits `CanonicalTabResult 2.1.0` with `capoFret` and `RELATIVE_FROM_CAPO` semantics. No PA/internal polyphonic function is exported from `src/index.js`; alternate source tunings remain fail-closed.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — live system architecture and invariants;
- [`docs/current-status.md`](docs/current-status.md) — current production status;
- [`docs/musicxml-compatibility.md`](docs/musicxml-compatibility.md) — generic MusicXML compatibility contract;
- [`docs/ps-sustain-tie-graph-contract.md`](docs/ps-sustain-tie-graph-contract.md) — PS-2 sustain/tie facts;
- [`docs/pa-8-left-hand-shape-contract.md`](docs/pa-8-left-hand-shape-contract.md) — PA-8 physical enumeration and fixed resource limits;
- [`docs/pa-12-internal-polyphonic-e2e.md`](docs/pa-12-internal-polyphonic-e2e.md) — internal canonical-v2 end-to-end boundary.

## Current compatibility baseline

Current merged production behavior includes bounded support for:

- exact Guitar Pro grace representation already admitted by the runtime profile;
- exact attribute-free grace nominal types `eighth` and `32nd`;
- exact Guitar Pro bracketed 3:2 triplet display metadata when backed by validated timing semantics;
- exact normalized notation/TAB staff mirror collapse when staff 2 is proven TAB and every normalized musical fact matches;
- exact closed sustain/tie continuation forms defined by PS-2 v1.2.0;
- exact same-voice MusicXML `<chord/>` membership as one attack group.

A valid same-voice chord is **not** the same thing as independent overlapping notes in one voice. Chord occupancy extends to the maximum end of its members. A later independent non-chord attack that begins before that end remains fail-closed as `OVERLAPPING_NOTES_WITHIN_ONE_VOICE`.

## Non-negotiable safety rules

1. Source MusicXML bytes and parsed source musical facts are immutable.
2. The engine does not silently infer or rewrite pitch, octave, onset, duration, voice, staff, tie, chord relationship, source pitch transformation, voice split, ambiguous sustain continuation, or solver ranking. The internal POLY_V2 route has one explicit, provenance-recorded exception: a note below E2 may be raised by exactly one octave only when that target is inside the fixed standard-guitar register.
3. Compatibility rules are filename- and SHA-independent, bounded, deterministic, and fail-closed.
4. Candidate enumeration order is not preference ranking. Compatibility fixes may not alter physical rules, ranking/cost, or tie-break behavior.
5. Missing semantic evidence fails closed; ambiguity is a valid result state.
6. Processing limits, deadline/cancellation checks, deep immutability, and package-root API boundaries remain mandatory.
7. Writers consume canonical truth and never rerun selection. Renderers are presentation consumers, not semantic authorities.

## PA-8 resource boundary

The fixed numerical ceilings remain unchanged in `src/music/leftHandShapeModel.js`:

- `MAX_LEFT_HAND_SHAPE_CANDIDATES = 20_000`;
- `MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS = 100_000`.

They are enforced per independently processed source group. In the sustained PS-4C seam, one enforced group is exactly one PS-4A sonority point across that point's ordered position states. Earlier groups cannot consume a later group's fixed window. The limits are not raised to make corpus cases pass.

## Real-corpus evidence

Real Guitar Pro files are evidence/regression inputs, not production dispatch keys. The gate verifies source identity and byte immutability, deterministic public/canonical/MusicXML output, expected fail-closed behavior, and CI state.

**Corpus evidence proves a generic contract; production code must not branch on corpus filename or SHA.**

Historical audit documents and sealed evidence remain in the repository for traceability. They do not override the live architecture/status documents above.

## Package metadata

- version: `0.1.0`
- `private: true`
- Node.js >=18
- runtime dependencies include `saxes@6.0.0` and `@coderline/alphatab@1.8.4`
- license: `SEE LICENSE IN LICENSE`

Commercial use requires a separate signed agreement; see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
