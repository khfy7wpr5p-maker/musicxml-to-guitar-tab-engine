# R1 — Safely Parsed Source-Artifact Retention

Status: IMPLEMENTED on the R1 recovery branch.

## Problem and outcome

The upload runtime previously coupled score rendering to successful TAB production. A MusicXML file could pass byte limits, XML safety, UTF-8 decoding and bounded parsing, then fail later in projection, arrangement, physical selection or the TAB writer. Every such result returned both `canonicalTabResult: null` and `musicXml: null`. Review promotion changed the status to `REVIEW_REQUIRED`, but there was no score artifact left for the browser to open.

R1 separates source presentation from TAB authority. After safety normalization and successful bounded parsing, the runtime creates an immutable `MusicXmlSourceArtifact 1.0.0`. This artifact survives downstream conversion failure. It is not a canonical score, an arrangement decision or a TAB result.

## Runtime boundary

```text
owned upload bytes
  -> extension / MXL container validation
  -> UTF-8 + XML declaration safety normalization
  -> bounded ParsedMusicXmlDocument succeeds
  -> immutable MusicXmlSourceArtifact
  -> projection / arrangement / physical selection / TAB writer
```

No artifact is created before parsing succeeds. Unsafe declarations, invalid UTF-8, malformed XML, invalid or ambiguous MXL containers, unsupported upload extensions and oversized input therefore remain `BLOCKED` with `sourceArtifact: null`.

For `.xml` and `.musicxml`, `rendererMusicXml` contains the safety-normalized direct XML. For `.mxl`, it contains the safety-normalized root MusicXML document extracted through the existing bounded archive validator; compressed archive bytes are never sent to the renderer. Exact trusted external MusicXML DOCTYPE declarations are removed by the existing safety normalizer, and entity declarations remain rejected.

## `MusicXmlSourceArtifact 1.0.0`

| Field | Meaning |
|---|---|
| `documentType` | Exact value `MusicXmlSourceArtifact` |
| `contractVersion` | Exact value `1.0.0` |
| `sourceUploadSha256` | SHA-256 of the owned original upload bytes; for MXL this identifies the archive |
| `sourceKind` | `DIRECT_XML` or `MXL_ROOTFILE` |
| `mediaType` | `application/vnd.recordare.musicxml+xml` |
| `byteLength` | UTF-8 byte length of `rendererMusicXml` |
| `sha256` | SHA-256 of the safety-normalized renderer bytes |
| `rendererMusicXml` | Immutable safety-normalized source score |

The upload result schema is `1.2.0`. The established runtime `contractVersion: 1.0.0` remains unchanged; the schema extension is additive.

## Status and authority matrix

| Outcome | Source artifact | Source rendering | TAB artifact | Export |
|---|---:|---:|---:|---:|
| Unsafe or unparseable `BLOCKED` | no | no | no | no |
| Safely parsed, hard downstream `BLOCKED` | yes | no | no | no |
| Allow-listed `REVIEW_REQUIRED`, conversion stopped | yes | yes | no | no |
| `REVIEW_REQUIRED`, provisional conversion exists | yes | yes | provisional | no |
| `PASS` | yes | yes | canonical | yes |

`capabilities.renderScore` is enabled for source-backed `REVIEW_REQUIRED` results. `capabilities.generateTab` still requires an actual `canonicalTabResult`; `capabilities.export` still requires `PASS`. The workbench presentation bridge may present the source artifact to its legacy PASS-only renderer, but it preserves the authoritative `REVIEW_REQUIRED` result and does not synthesize canonical data.

Repeat, ending, direction and bounded physical-point review cases can therefore show the original score even when conversion stopped before a TAB writer artifact existed. Hard `BLOCKED` results retain the parsed source only as bounded diagnostic/recovery evidence; the current host remains locked for those cases.

## Invariants

- Original caller bytes are copied before processing and never mutated.
- Source-artifact creation does not reclassify an issue or weaken XML/MXL safety.
- Source MusicXML is presentation evidence only; it cannot authorize TAB, fingering, arrangement or export.
- No pitch, rhythm, voice, staff, repeat, direction or guitar position is guessed.
- Existing physical limits, solver ranking, costs and tie-breaks are unchanged.
- The package-root API remains unchanged.

## Verification

Regression coverage proves direct XML and MXL identity binding, deterministic output, deep immutability, source-only review rendering, no invented TAB/export authority, and absence of source artifacts for unsafe XML. The browser bridge is separately tested to load authorized source-only review results while retaining the authoritative review status.

## Next recovery step

R1 fixes the lost-source/rendering boundary; it does not make unsupported music into TAB. R2 must introduce an explicit partial arrangement result with per-note `KEPT`, `OMITTED`, `OCTAVE_SHIFTED` or `UNASSIGNED` dispositions so safe piano material can produce editable partial TAB without bypassing physical validation.
