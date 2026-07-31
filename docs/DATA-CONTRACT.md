# MusicXML to Guitar TAB Engine — Data Contract

## 1. Purpose

This document defines the canonical data format used by the MusicXML to Guitar TAB Engine.

The canonical data model is the shared contract between:

- MusicXML parsing
- Musical normalization
- Guitar fretboard calculation
- Fingering optimization
- JSON output
- ASCII TAB output
- Guitar TAB MusicXML output
- PDF rendering
- Future visual dataset tools

Output generators must use this canonical model and must not independently recalculate musical pitches, rhythms, strings or frets.

## 2. Contract Version

Every conversion result must include a contract version.

```json
{
  "contractVersion": "1.0.0"
}
```

Versioning rules:

- Patch version: documentation or non-breaking clarification
- Minor version: optional backward-compatible fields
- Major version: breaking field or behavior changes

Unknown required major versions must be rejected.

## 3. Top-Level Conversion Result

```json
{
  "contractVersion": "1.0.0",
  "engineVersion": "0.1.0",
  "conversionId": "local-generated-id",
  "status": "success",
  "requiresTeacherReview": true,
  "source": {},
  "configuration": {},
  "score": {},
  "measures": [],
  "warnings": [],
  "errors": []
}
```

### Required top-level fields

| Field | Type | Required | Description |
|---|---:|---:|---|
| `contractVersion` | string | Yes | Data-contract version |
| `engineVersion` | string | Yes | Conversion-engine version |
| `conversionId` | string | Yes | Non-secret conversion identifier |
| `status` | string | Yes | `success`, `partial` or `failed` |
| `requiresTeacherReview` | boolean | Yes | Educational review requirement |
| `source` | object | Yes | Safe input metadata |
| `configuration` | object | Yes | Guitar and fingering settings |
| `score` | object | Yes | Score-level metadata |
| `measures` | array | Yes | Ordered musical measures |
| `warnings` | array | Yes | Non-fatal findings |
| `errors` | array | Yes | Fatal or partial-conversion errors |

## 4. Source Metadata

```json
{
  "source": {
    "format": "musicxml",
    "originalFileName": "example.musicxml",
    "sizeBytes": 12480,
    "sha256": "optional-hash",
    "partId": "P1"
  }
}
```

Rules:

- File paths must not be stored.
- Temporary directory names must not be stored.
- User-controlled file names must be sanitized.
- The source hash is optional.
- The source object must not contain XML contents.

## 5. Conversion Configuration

```json
{
  "configuration": {
    "tuning": {
      "name": "standard",
      "strings": [
        { "number": 6, "openPitch": "E2", "openMidi": 40 },
        { "number": 5, "openPitch": "A2", "openMidi": 45 },
        { "number": 4, "openPitch": "D3", "openMidi": 50 },
        { "number": 3, "openPitch": "G3", "openMidi": 55 },
        { "number": 2, "openPitch": "B3", "openMidi": 59 },
        { "number": 1, "openPitch": "E4", "openMidi": 64 }
      ]
    },
    "minimumFret": 0,
    "maximumFret": 20,
    "fingeringProfile": "beginner-default",
    "preferOpenStrings": false
  }
}
```

String-number convention:

```text
String 1 = highest-pitched string
String 6 = lowest-pitched string
```

Fret-number convention:

```text
Open string = fret 0
```

## 6. Score Metadata

```json
{
  "score": {
    "title": "Example",
    "composer": null,
    "partCount": 1,
    "selectedPartId": "P1",
    "measureCount": 2,
    "voiceCount": 1
  }
}
```

Missing metadata must use `null`, not invented values.

## 7. Measure Model

```json
{
  "number": 1,
  "index": 0,
  "timeSignature": {
    "beats": 4,
    "beatType": 4
  },
  "divisions": 4,
  "events": [],
  "warnings": []
}
```

Rules:

- `index` starts at `0`.
- `number` preserves the displayed MusicXML measure number.
- Events must remain in musical order.
- Empty measures may contain rests or an empty event list with a warning.
- Measure duration must be validated against the time signature where possible.

## 8. Event Model

Every musical event must use one of the following event types:

```text
note
rest
chord
```

Base event structure:

```json
{
  "eventId": "m1-e0",
  "eventIndex": 0,
  "type": "note",
  "voice": 1,
  "staff": 1,
  "start": {
    "divisions": 0,
    "beats": 0
  },
  "rhythm": {},
  "sourceLocation": {},
  "warnings": []
}
```

### Event ID

The `eventId` must be deterministic within one conversion.

Example:

```text
m1-e0
m1-e1
m2-e0
```

It must not contain private file paths or user data.

## 9. Pitch Model

```json
{
  "pitch": {
    "step": "C",
    "alter": 1,
    "octave": 4,
    "written": "C#4",
    "midi": 61
  }
}
```

### Allowed `step` values

```text
A B C D E F G
```

### Allowed `alter` values in the MVP

```text
-2  double flat
-1  flat
 0  natural
 1  sharp
 2  double sharp
```

### Validation rules

- `octave` must be an integer.
- `midi` must match `step`, `alter` and `octave`.
- Missing pitch data is invalid for note events.
- Rest events must not contain pitch data.
- Enharmonic spelling must be preserved where available.

## 10. Rhythm Model

```json
{
  "rhythm": {
    "durationDivisions": 4,
    "type": "quarter",
    "dots": 0,
    "timeModification": null,
    "tieStart": false,
    "tieStop": false,
    "beam": []
  }
}
```

### Supported rhythm types

```text
whole
half
quarter
eighth
16th
```

Future values may include:

```text
32nd
64th
breve
```

### Beam model

```json
{
  "beam": [
    {
      "level": 1,
      "value": "begin"
    }
  ]
}
```

Allowed beam values:

```text
begin
continue
end
forward-hook
backward-hook
```

Beam data is important for later TAB MusicXML and PDF rendering.

The engine must not infer beams from images. Beam information must come from MusicXML or be deterministically regenerated from rhythmic timing.

## 11. Rest Event

```json
{
  "eventId": "m1-e1",
  "eventIndex": 1,
  "type": "rest",
  "voice": 1,
  "start": {
    "divisions": 4,
    "beats": 1
  },
  "rhythm": {
    "durationDivisions": 4,
    "type": "quarter",
    "dots": 0,
    "timeModification": null,
    "tieStart": false,
    "tieStop": false,
    "beam": []
  },
  "selectedPosition": null,
  "alternativePositions": [],
  "warnings": []
}
```

Rest events must never receive string or fret values.

## 12. Guitar Position Model

```json
{
  "selectedPosition": {
    "string": 2,
    "fret": 1,
    "positionCost": 1.5
  }
}
```

Validation rules:

- `string` must be an integer from `1` to `6`.
- `fret` must be an integer.
- `fret` must be within the configured range.
- The selected string and fret must reproduce the event MIDI pitch exactly.
- `positionCost` must be finite and non-negative.

An invalid position must never be silently corrected.

## 13. Alternative Positions

```json
{
  "alternativePositions": [
    {
      "string": 3,
      "fret": 5,
      "positionCost": 4.2
    },
    {
      "string": 4,
      "fret": 10,
      "positionCost": 9.8
    }
  ]
}
```

Rules:

- The selected position must not be duplicated.
- Alternatives must be valid and playable.
- Alternatives should be ordered by increasing cost.
- All valid alternatives may be retained for teacher review.
- Output generators may hide alternatives visually but must not alter them.

## 14. Complete Note Event Example

```json
{
  "eventId": "m1-e0",
  "eventIndex": 0,
  "type": "note",
  "voice": 1,
  "staff": 1,
  "start": {
    "divisions": 0,
    "beats": 0
  },
  "pitch": {
    "step": "C",
    "alter": 0,
    "octave": 4,
    "written": "C4",
    "midi": 60
  },
  "rhythm": {
    "durationDivisions": 4,
    "type": "quarter",
    "dots": 0,
    "timeModification": null,
    "tieStart": false,
    "tieStop": false,
    "beam": []
  },
  "selectedPosition": {
    "string": 2,
    "fret": 1,
    "positionCost": 1.5
  },
  "alternativePositions": [
    { "string": 3, "fret": 5, "positionCost": 4.2 },
    { "string": 4, "fret": 10, "positionCost": 9.8 },
    { "string": 5, "fret": 15, "positionCost": 15.1 },
    { "string": 6, "fret": 20, "positionCost": 20.4 }
  ],
  "confidence": 1,
  "requiresTeacherReview": true,
  "sourceLocation": {
    "partId": "P1",
    "measure": 1,
    "noteIndex": 0
  },
  "warnings": []
}
```

## 15. Chord Event Model

Chord support is planned after the monophonic MVP.

The data contract reserves the following structure:

```json
{
  "eventId": "m1-e2",
  "eventIndex": 2,
  "type": "chord",
  "notes": [
    {
      "pitch": {},
      "selectedPosition": {}
    }
  ],
  "rhythm": {},
  "warnings": []
}
```

The MVP must return `UNSUPPORTED_POLYPHONY` when chord or polyphonic content cannot be processed safely.

It must not flatten chords into unrelated single notes without an explicit rule.

## 16. Confidence and Teacher Review

```json
{
  "confidence": 0.92,
  "requiresTeacherReview": true
}
```

Rules:

- `confidence` ranges from `0` to `1`.
- Deterministic mathematical matches may use `1`.
- Fingering suitability confidence must not claim pedagogical certainty.
- Educational outputs must initially set `requiresTeacherReview` to `true`.
- Low-confidence decisions must include a warning.

## 17. Warning Model

```json
{
  "code": "LARGE_POSITION_SHIFT",
  "message": "A large fret-position shift was selected.",
  "severity": "warning",
  "location": {
    "measure": 3,
    "eventId": "m3-e4"
  },
  "details": {
    "previousFret": 2,
    "currentFret": 12
  }
}
```

Allowed severity values:

```text
info
warning
error
```

Warnings must not include:

- Absolute server paths
- Stack traces
- Environment variables
- Secrets
- Raw external-process output

## 18. Error Model

```json
{
  "code": "UNPLAYABLE_NOTE",
  "message": "The note is outside the configured guitar range.",
  "location": {
    "measure": 4,
    "eventId": "m4-e2"
  },
  "details": {
    "pitch": "C7",
    "midi": 96
  }
}
```

Required error codes include:

```text
EMPTY_INPUT
FILE_TOO_LARGE
INVALID_XML
INVALID_MUSICXML
UNSUPPORTED_SCORE_FORMAT
UNSUPPORTED_MULTIPART_SCORE
UNSUPPORTED_POLYPHONY
INVALID_PITCH
INVALID_DURATION
UNPLAYABLE_NOTE
NO_COMPLETE_FINGERING_PATH
TAB_MUSICXML_GENERATION_FAILED
PDF_RENDERING_FAILED
INTERNAL_CONVERSION_ERROR
```

## 19. Status Rules

### Success

```json
{
  "status": "success",
  "errors": []
}
```

All events were converted.

### Partial

```json
{
  "status": "partial"
}
```

Only permitted when explicitly configured.

Partial results must clearly identify omitted or failed events.

The default MVP behavior should reject incomplete musical conversion rather than silently return misleading TAB.

### Failed

```json
{
  "status": "failed",
  "measures": []
}
```

Fatal validation or conversion failure.

## 20. Output Consistency Rules

All outputs must use the same canonical result.

The following must always agree:

- JSON pitch
- Selected guitar string
- Selected fret
- ASCII TAB
- TAB MusicXML
- PDF-rendered TAB

The ASCII TAB writer, MusicXML writer and PDF renderer must not:

- Select different positions
- Change rhythms
- Move events
- Invent notes
- Remove warnings
- Recalculate fingering independently

## 21. Determinism Rules

Given the same:

- Input MusicXML
- Contract version
- Engine version
- Guitar tuning
- Fret range
- Fingering profile

the engine must produce the same selected positions and event order.

Conversion timestamps must not affect fingering results.

Random selection is prohibited in the MVP.

## 22. Security and Privacy Rules

The canonical output must not include:

- Absolute file paths
- Temporary-directory paths
- Environment variables
- API keys
- Access tokens
- User account identifiers
- Raw process logs
- Entire original MusicXML contents

Error messages must be safe for display to end users.

## 23. Future Visual Dataset Compatibility

The future `tab-rhythm-visual-dataset` repository may use the same event structure for annotations.

Example visual annotation:

```json
{
  "imageId": "example-page-001",
  "eventId": "m1-e0",
  "boundingBoxes": {
    "fretNumber": {
      "x": 120,
      "y": 260,
      "width": 18,
      "height": 24
    },
    "stem": {
      "x": 128,
      "y": 210,
      "width": 3,
      "height": 50
    },
    "beam": {
      "x": 128,
      "y": 208,
      "width": 60,
      "height": 6
    }
  },
  "expectedEvent": {
    "pitch": {
      "written": "C4",
      "midi": 60
    },
    "rhythm": {
      "type": "eighth"
    },
    "selectedPosition": {
      "string": 2,
      "fret": 1
    }
  }
}
```

Visual annotations must remain outside the core conversion result.

The core engine must not require images or visual annotations to convert MusicXML.

## 24. Validation Invariants

A conversion result is valid only when all of the following are true:

1. Every event has a unique `eventId`.
2. Events are ordered within each measure.
3. Every note event has valid pitch data.
4. Every rest event has no pitch or position.
5. Every selected position reproduces the correct MIDI pitch.
6. Every fret is within the configured range.
7. Every string number is between `1` and `6`.
8. Alternative positions are valid and non-duplicated.
9. Output writers use the selected position without recalculation.
10. Fatal errors cannot coexist with a successful status.
11. Teacher review remains enabled for MVP output.
12. No sensitive system data appears in results.

## 25. Initial Contract Acceptance Criteria

The data contract is ready for implementation when:

1. The top-level result structure is fixed.
2. Pitch representation is unambiguous.
3. Rhythm and beam representation are defined.
4. Guitar string and fret conventions are fixed.
5. Warning and error models are defined.
6. Output-consistency rules are documented.
7. Deterministic behavior is required.
8. Security and privacy exclusions are documented.
9. Future visual annotations can reference canonical event IDs.
10. The contract remains independent from SesliTab, Audiveris, OMR and HTML files.
