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

## Current remediation order

1. real-world guitar POLY routing + standard transpose semantics;
2. exact-head unit/compatibility/runtime E2E;
3. deploy Preview and verify a real user file;
4. Fingering Editor with validated string/fret override;
5. low-position preference review after octave semantics are proven correct;
6. expand real-document corpus before any public polyphony claim.

## Authority boundary

These changes do not create PA-13 or a package-root public polyphonic API. `CanonicalTabResult 2.0.0` remains internal. Source MusicXML remains immutable source truth, deterministic selection remains authoritative, and unsupported semantics remain fail-closed.
