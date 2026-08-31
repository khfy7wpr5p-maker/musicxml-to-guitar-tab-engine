# POLY Upload Low-Register Octave Displacement Contract

## Purpose

The internal `POLY_V2` upload route may make one narrow, deterministic guitar-arrangement decision for an orchestral source note that is below the standard six-string guitar register:

```text
A1 (MIDI 33) -> A2 (MIDI 45)
```

The source MusicXML bytes and source-model pitch remain `A1`. The arrangement decision is `OCTAVE_DISPLACED`; the canonical target pitch and the generated TAB are `A2`.

This is an explicit arrangement policy, not a compatibility normalizer and not a source correction.

## Exact admission rule

For each non-representation source note, the route may choose `OCTAVE_DISPLACED` only when all of the following are true:

1. the source MIDI is below the fixed standard-guitar lower bound (MIDI 40 / E2);
2. adding exactly 12 semitones lands inside the fixed 0–20-fret standard-guitar register (MIDI 40–84);
3. the source event remains one distinct immutable source event;
4. the downstream PA-6 through PA-12 physical-selection path can select it under the existing rules.

No other automatic pitch change is permitted.

## Deliberate rejections

- high-register source notes remain `UNPLAYABLE_SOURCE_PITCH`;
- notes still below E2 after one octave, such as `C1 -> C2`, remain `UNPLAYABLE_SOURCE_PITCH`;
- no two-octave displacement, downward displacement, revoicing, omission, voice split, arpeggiation, tuning change, capo selection, or pitch respelling is introduced;
- no compatibility normalizer gains musical-arrangement authority;
- the package-root monophonic API and teacher editing runtime remain unchanged.

## Provenance and verification

The resulting `CanonicalTabResult 2.0.0` retains:

- immutable source `A1` pitch facts;
- `OCTAVE_DISPLACED` arrangement decision;
- `targetPitch: A2` and `octaveShiftSemitones: 12`;
- selected standard-guitar string/fret and existing physical-validation provenance.

The application boundary rechecks this exact `+12` relation after canonical conversion. Any omitted note, different shift, target MIDI mismatch, or unauthorized rule remains `UNEXPECTED_MUSICAL_CHANGE`.
