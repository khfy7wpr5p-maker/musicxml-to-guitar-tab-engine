# MusicXML to Guitar TAB Engine

A deterministic engine for converting supported monophonic MusicXML into canonical guitar tablature.

## Current scope

The current implementation supports a controlled MusicXML-to-TAB pipeline with:

- XML safety checks
- MusicXML structural validation
- monophonic note and rhythm parsing
- guitar position candidate generation
- deterministic fingering optimization
- canonical TAB result generation
- internal JSON, ASCII TAB and TAB MusicXML writers

Unsupported features are rejected explicitly. Polyphony, chords, grace notes, tuplets, multiple staves, multiple parts, PDF input, OMR and HTTP services are outside the current scope.

## Development status

Milestone 1 established the canonical TAB contract and shared writer-validation boundary.

Milestone 2 is hardening the MusicXML parsing pipeline, resource limits and error model.

See:

- `docs/ARCHITECTURE.md`
- `docs/canonical-contract-audit.md`
- `schemas/canonical-tab-result.v1.schema.json`

## Tests

```bash
npm ci
npm test
```

The repository targets Node.js 18 or later.
