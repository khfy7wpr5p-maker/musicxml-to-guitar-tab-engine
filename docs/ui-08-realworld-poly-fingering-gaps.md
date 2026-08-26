# UI-08 — Real-world polyphony and fingering gaps

Status: active remediation branch.

This document records user-observed runtime gaps that are not covered by the synthetic PA-12 / Workbench compatibility fixtures. It is a live engineering note, not a rewrite of sealed PA contracts or historical evidence.

## Confirmed gaps

### GAP-01 — Real-world polyphonic MusicXML can block before usable POLY_V2 output

Synthetic `pa12-polyphonic-e2e.musicxml` proves a narrow internal polyphonic path, but it does not establish broad compatibility with common guitar notation exports.

Common real-world fields that can trigger the strict PA-2 projector boundary include document/layout metadata, key/clef declarations, directions/barlines and notation decorations. These are not evidence that the underlying voices are invalid.

Acceptance for remediation:

- multi-voice single-staff guitar MusicXML reaches `POLY_V2` when pitch/rhythm semantics can be preserved exactly;
- unsupported musical semantics still fail closed;
- ignored presentation/performance metadata is reported as a visible warning rather than silently disappearing.

Current bounded classification:

| Source feature | Runtime classification | Evidence / reason |
|---|---|---|
| Standard initial guitar `transpose` (`diatonic=0`, `chromatic=0`, `octave-change=-1`) | `NORMALIZED_WITH_WARNING` | Written pitch is converted once to sounding pitch before deterministic selection. |
| Simple `slur` marks | `NORMALIZED_WITH_WARNING` | Pitch, onset, duration and voice are unchanged; omission is listed in warning provenance. |
| Bounded leaf articulations (`accent`, `staccato`, `tenuto`, `detached-legato`, `staccatissimo`, `spiccato`) | `NORMALIZED_WITH_WARNING` | Performance decoration is not used as pitch/rhythm authority and is named individually in warning provenance. |
| Simple metronome direction with matching optional `sound tempo` | `NORMALIZED_WITH_WARNING` | Tempo is classified explicitly; other direction semantics are not admitted. |
| Simple visual `bar-style` only | `NORMALIZED_WITH_WARNING` | Repeat, ending and navigation semantics are not admitted. |
| `technical`, `harmony`, unsafe direction/barline forms, unknown MusicXML notation children | `BLOCKED_UNSUPPORTED` | These can carry fingering, chord, execution or navigation semantics and are not silently discarded. |
| Late, repeated or non-standard instrument transposition | `BLOCKED_UNSUPPORTED` | The first supported profile accepts one initial standard-guitar declaration only. |

The stable blocked boundary is `UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE`; `details.feature` identifies the rejected semantic surface.

### GAP-02 — Standard guitar octave transposition was not accepted on the real-world POLY route

Classical guitar notation commonly uses MusicXML `transpose` with chromatic `0` and `octave-change=-1`: written notation is one octave above sounding pitch.

Treating this as unsupported blocks normal guitar files. Ignoring it would be worse because it can shift string/fret selection by 12 semitones.

Remediation rule:

- accept only the standard guitar octave-only transposition (`diatonic=0`, `chromatic=0`, `octave-change=-1`);
- normalize written pitch to sounding pitch before deterministic fingering selection;
- keep any other transposition fail-closed;
- renderer output may re-express standard guitar notation with the existing `octave-change=-1` writer contract.

### GAP-03 — High-position selections may be an octave-semantics symptom

A user-observed case selected positions around frets 10–14 where normal first-position guitar fingering was expected. Before changing fingering cost weights, standard guitar written-vs-sounding pitch must be normalized correctly. Otherwise a `+12` semantic error can masquerade as a fingering-policy problem.

After GAP-02 is verified on real files, low-position preference should be reassessed with pitch-equivalent candidates only.

### GAP-04 — Fingering panel is read-only

The Workbench currently displays selected `String`, `Fret` and alternatives but does not allow the user to choose a different valid string/fret position.

Required UI/runtime slice:

- editable string `1..6` and fret `0..20` controls;
- engine validation that chosen string/fret produces exactly the selected sounding pitch;
- invalid or stale selections fail closed;
- MONO_V1 and POLY_V2 source identity remains authoritative;
- `Apply & regenerate TAB` rebuilds the complete deterministic result;
- no browser-only mutation of TAB authority.

### GAP-05 — Existing browser E2E is too synthetic

Current E2E proves generated fixtures and programmatic renderer-note selection. It does not prove broad real exported scores.

Required corpus gate:

- real guitar MusicXML exports with two voices;
- standard guitar transpose `-1`;
- key/clef/layout metadata;
- chords and backup/forward timing;
- ties;
- safe presentation notation;
- explicit unsupported cases;
- real mouse selection and edit/regeneration.

Current repository corpus evidence:

| Fixture / mutation | Expected state | Covered facts |
|---|---|---|
| `tests/fixtures/runtime-realworld-guitar-poly.musicxml` | `NORMALIZED_WITH_WARNING` | MuseScore-like single guitar part/staff, two voices, chord, rest, backup/forward, key, explicit accidental, initial guitar transpose, metronome direction, slur, articulation, layout and simple barline. |
| Standard fixture with `technical` string/fret | `BLOCKED_UNSUPPORTED` | Source fingering is not discarded or treated as browser authority. |
| Standard fixture with source `harmony` | `BLOCKED_UNSUPPORTED` | Source chord symbols await a preservation contract. |
| Standard fixture with unknown notation/articulation, octave-shift direction or repeat barline | `BLOCKED_UNSUPPORTED` | Unknown or musical semantics remain fail-closed. |
| Standard fixture with late transpose | `BLOCKED_UNSUPPORTED` | Earlier notes cannot be shifted by a later instrument declaration. |

This is a repository-authored representative export fixture, not the user's original MusicXML file. The original file remains a separate staging proof when it is available.

## Current remediation order

1. real-world guitar POLY routing + standard transpose semantics;
2. exact-head unit/compatibility/runtime E2E;
3. deploy Preview and verify a real user file;
4. Fingering Editor with validated string/fret override;
5. low-position preference review after octave semantics are proven correct;
6. expand real-document corpus before any public polyphony claim.

## Authority boundary

These changes do not create PA-13 or a package-root public polyphonic API. `CanonicalTabResult 2.0.0` remains internal. Source MusicXML remains immutable source truth, deterministic selection remains authoritative, and unsupported semantics remain fail-closed.
