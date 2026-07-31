# MusicXML to Guitar TAB Engine

A standalone engine that converts MusicXML scores into playable guitar tablature.

## Project goal

The engine receives a MusicXML file, reads its notes, measures and rhythm values, calculates playable guitar string and fret positions, and produces structured guitar tablature.

## Processing flow

```text
MusicXML
   ↓
Read notes, octaves, measures and durations
   ↓
Calculate possible guitar string and fret positions
   ↓
Select a playable fingering sequence
   ↓
Generate Guitar TAB
```

## Input

- MusicXML (`.musicxml`, `.xml`)
- Compressed MusicXML (`.mxl`) — planned

## Output

- Guitar string and fret positions
- Structured JSON
- ASCII Guitar TAB
- MusicXML containing tablature — planned

## Initial scope

- Standard six-string guitar tuning: E2 A2 D3 G3 B3 E4
- Single-note melodies
- Frets 0–20
- Preservation of measures and note durations
- Detection of notes outside the playable guitar range
- Teacher review required before educational use

## Project boundaries

This repository is independent from the existing SesliTab application.

It does not process PDFs directly, run Audiveris, modify OMR files, or change SesliTab HTML files. PDF-to-MusicXML conversion remains the responsibility of the existing OMR workflow. This engine begins with MusicXML and ends with Guitar TAB.
