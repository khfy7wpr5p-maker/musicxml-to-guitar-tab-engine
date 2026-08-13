# PA-7 Closure and Verification Record

Date: 2026-08-13

This document records the verified closure of PA-7 on the internal polyphonic-arrangement line. It does not create a public polyphonic API and does not authorize PA-8.

## Authoritative runtime result

- runtime PR: #92 — `feat(PA-7): add guitar voicing candidate model`
- final PR head: `703658d68bef0939bee6dca42b4eac4e2d6bd358`
- merge method: rebase
- merged runtime `main` SHA: `1f3dc2cf89efab1e258064b6e76eb51daee4252c`
- merged runtime tree: `2458bf228fe02ecb82359417b7bb5016b6c29f82`
- internal contract: `GuitarVoicingCandidateModel 1.0.0`
- policy: `STANDARD_SIX_STRING_DISTINCT_STRING_1.0`
- fixed guitar configuration for PA-7 v1: standard six-string tuning, frets 0–20
- fixed aggregate candidate ceiling: 10,000
- package-root public monophonic API: unchanged
- `CanonicalTabResult 1.0.0`: unchanged

## Red-first evidence

- red-first head: `25a754f64f03045af3c3268e0560e866cb8a663b`
- at that head the PA-7 contract and tests existed while `src/music/guitarVoicingCandidateModel.js` did not yet exist
- Tests #650 failed at the test step on Node.js 18/20/22
- connector-accessible annotations exposed exit code 1 but did not expose the complete test log; therefore no verbatim missing-module message is claimed

## Exact-head verification before merge

At exact PR head `703658d68bef0939bee6dca42b4eac4e2d6bd358`:

- Tests #652: `SUCCESS`
- Node.js 18: `SUCCESS`
- Node.js 20: `SUCCESS`
- Node.js 22: `SUCCESS`
- MusicXML Compatibility #465: workflow `SUCCESS`
- complete repository suite + alphaTab import/SVG jobs on Node.js 18/20/22: `SUCCESS`
- alphaTab browser renderer/cursor smoke test: `SUCCESS`
- MuseScore CLI availability workflow check: `SUCCESS`
- independent contract/code/test review: no remaining P1/P2 blocker found

### Synth diagnostic evidence must not be overstated

The Compatibility #465 workflow and its required GitHub check concluded `SUCCESS`, but the raw browser-job log shows that the alphaTab synthesizer diagnostic itself did not establish playback readiness: readiness timed out and alphaTab emitted a recursive `loadedMidiInfo` runtime error before score/MIDI/SoundFont/player readiness.

Therefore PA-7 closure does **not** claim production playback readiness. Renderer/cursor compatibility remains separately verified.

## Post-merge verification

After rebase merge:

- authoritative runtime `main`: `1f3dc2cf89efab1e258064b6e76eb51daee4252c`
- Tests #653: `SUCCESS`
- event: `push`
- exact `main` SHA: `1f3dc2cf89efab1e258064b6e76eb51daee4252c`
- Node.js 18/20/22: `SUCCESS`

No post-merge MusicXML Compatibility run is claimed for the runtime merge.

## PA-7 behavioral authority

PA-7 consumes validated/recomputed upstream PA-3 and PA-6 facts and enumerates deterministic standard-guitar string/fret alternatives for simultaneous PA-6 `KEEP` notes.

It guarantees within PA-7 v1:

- exact PA-6 `targetMidi` preservation;
- exact PA-3 simultaneous-group provenance;
- PA-6 omitted-member provenance preservation;
- one position per active source event in a candidate;
- distinct guitar strings within each simultaneous candidate;
- fret bounds 0–20;
- position-to-MIDI round-trip to the exact PA-6 target;
- deterministic enumeration order and deterministic candidate IDs;
- zero candidates instead of silent note dropping when more than six active notes remain;
- zero candidates when no injective distinct-string assignment exists;
- fail-closed aggregate ceiling above 10,000 candidates;
- ProcessingRuntime deadline/cancellation checkpoints;
- deep immutable output;
- hostile source/decision revalidation through upstream contracts.

## Non-authority boundary

A PA-7 candidate proves only a distinct-string standard-guitar string/fret placement under the fixed PA-7 configuration. It is not full physical-playability approval.

PA-7 does not choose or certify:

- left-hand finger numbers;
- barre or partial-barre shapes;
- hand position;
- finger collisions;
- fret-span comfort or ergonomics;
- candidate preference/ranking;
- final voicing selection;
- arrangement optimization;
- public polyphonic output.

Those authorities remain later separately approved gates.

## Public-boundary statement

PA-7 is internal only. It does not:

- weaken current public monophonic rejection rules;
- change `src/index.js` package-root exports;
- alter `CanonicalTabResult 1.0.0`;
- make polyphonic conversion a current public capability;
- make playback, PDF, UI, teacher score editing, or AI arrangement authority production-ready;
- prove real previously uploaded MusicXML PA-7 end-to-end conversion.

## Gate state after runtime closure

```text
PA-5  CLOSED / MERGED_INTERNAL / VERIFIED
  ↓
PA-6  CLOSED / MERGED_INTERNAL / VERIFIED
  ↓
PA-7  CLOSED / MERGED_INTERNAL / VERIFIED
  ↓
PA-8  NOT_STARTED / REQUIRES_SEPARATE_STAGE_START_APPROVAL
```

PA-8 scope is the separately gated left-hand shape / finger assignment / barre / partial-barre layer. PA-7 merge approval does not authorize PA-8.

Branch cleanup is not authorized by this closure.