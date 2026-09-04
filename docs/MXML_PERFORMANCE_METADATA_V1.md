# MXML_PERFORMANCE_METADATA_V1

Status: `SUPPORTED` for the bounded V1 shapes below.

Last verified base main SHA before implementation: `ebf5971eb25c433b0537098d42aba7e819c43bb3`.

## Authority boundary

`CAP_PERFORMANCE_METADATA_POLICY_V1` separates Guitar TAB-authoritative score semantics from playback/display metadata.

TAB-authoritative facts remain untouched:

- pitch;
- onset;
- duration;
- voice;
- musically authoritative staff assignment;
- tie/chord relations;
- repeat-derived playback order;
- guitar physical feasibility and solver decisions.

The V1 policy may classify only exact, bounded metadata shapes proven not to alter those facts. It never converts a text tempo word into a guessed BPM and never invents a replacement dynamics value.

## PASS with non-blocking diagnostics

The existing `reviewableScoreState` contract already permits `PASS` with non-error diagnostics. Only `severity: "error"` participates in the blocking/review status decision.

Therefore an exact invalid playback-only dynamics lexeme such as:

```xml
<direction placement="below">
  <direction-type><dynamics><pp/></dynamics></direction-type>
  <staff>1</staff>
  <sound dynamics="-1.11"/>
</direction>
```

may continue through Guitar TAB semantic projection when every surrounding field is inside the exact V1 profile.

The invalid field is **not** clamped, made absolute, rounded, or replaced. The source lexeme remains evidence in an `INVALID_PERFORMANCE_DYNAMICS` warning. The whole exact direction is excluded only from the semantic Guitar TAB projection because its admitted shape is playback/display-only.

This does not make `-1.11` a valid MusicXML dynamics value.

## Exact negative-dynamics exception

The V1 exception requires all of the following:

- one `direction-type`;
- one standard dynamics mark from `ppp`, `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`;
- one exact, declared staff target;
- one `sound` child containing only `dynamics`;
- exact child order `direction-type`, `staff`, `sound`;
- no offset, navigation, extension child, mixed text, or foreign attribute;
- bounded signed decimal evidence with non-zero negative magnitude at most 127;
- at most six fractional digits for the invalid-negative exception.

The observed `-1.11` corpus shape is therefore classified generically. Over-range, ultra-high-precision, reordered, structurally mixed, or undeclared-staff shapes remain fail-closed.

## Tempo words

V1 preserves a small bounded vocabulary of conventional tempo/performance words as display/performance metadata, including `Larghetto`, `Largo`, `Adagio`, `Andante`, `Moderato`, `Allegro`, `Presto`, `rit.`, `rall.`, `a tempo`, and related exact entries listed in the implementation.

Words are preserved byte-for-byte at the parsed text field in a `WORDS` metadata record. They are never translated to a numeric tempo.

The direction and words nodes must use only the V1 presentation attribute allowlist and bounded values. Text that can encode structural/pitch/navigation meaning, such as `D.C.` or `8va`, is not admitted by this policy and therefore stays on the existing fail-closed path unless another authoritative capability handles it.

## Exact metronome records

The policy records the existing exact metronome profile without changing its runtime authority:

- one `metronome` direction type;
- exact child order `beat-unit`, `per-minute`;
- bounded positive `per-minute`;
- optional exact staff target;
- optional `sound@tempo` only when the beat unit is `quarter`;
- `sound@tempo`, when present and non-conflicting, must equal the exact metronome value under the existing canonical decimal contract.

A valid tempo word and a valid metronome in the same musical region therefore remain **two distinct metadata records**. The word is not used to derive or override the numeric metronome value.

## Conflicting numeric tempo

If an otherwise exact quarter-note metronome contains two individually valid numeric tempo fields that disagree, V1 does not average or choose between them.

Example:

```xml
<direction placement="above">
  <direction-type>
    <metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome>
  </direction-type>
  <staff>1</staff>
  <sound tempo="61"/>
</direction>
```

The policy emits `CONFLICTING_PERFORMANCE_TEMPO` with:

- `severity: "error"`;
- `reviewDisposition: "REVIEW_REQUIRED"`;
- both original numeric lexemes;
- exact measure and direction-child location.

The public upload result remains `POLY_V2` but becomes `REVIEW_REQUIRED`; canonical TAB and serialized TAB MusicXML are not exposed for that result.

## Runtime preservation boundary

The production runtime that existed at base SHA `ebf5971...` is preserved byte-for-byte as:

`src/app/musicXmlUploadRuntimeBase.js`

The existing public module path `src/app/musicXmlUploadRuntime.js` is a narrow wrapper. It adds only the performance-metadata diagnostic/status policy after the preserved base runtime has produced a successful `POLY_V2` result.

The compatibility chain itself performs the exact semantic exclusion before projection, so invalid playback-only metadata cannot become a pitch/string/fret/solver input. The wrapper only surfaces named warning/review evidence and converts a numeric tempo conflict to the already-existing `REVIEW_REQUIRED` score-state contract.

## Source immutability and determinism

The policy clones parsed nodes and deep-freezes derived records/documents. It never writes to original upload bytes.

Regression requirements include:

- two-run upload result equality;
- parsed-source facts remain unchanged;
- upload bytes compare equal before/after processing;
- four identical `-1.11` occurrences produce four stable located warning records;
- canonical note/timing snapshots match the same score with only the non-authoritative invalid metadata removed.

## Fail-closed V1 limits

The following are not generalized by this capability:

- offsets;
- octave shifts;
- D.C., D.S., Segno, Fine, Coda, or other navigation commands;
- arbitrary words or unknown direction types;
- undeclared/out-of-profile staff targets;
- foreign namespace children;
- reordered direction/metronome/dynamics children;
- unsupported print attributes;
- non-quarter `sound@tempo` semantic conversion;
- malformed or over-range numeric values;
- dynamics values outside the bounded exact negative exception;
- any field whose effect on note identity, score timeline, sustain, repeat order, or physical feasibility is not proven non-authoritative.

Those cases continue through the pre-existing fail-closed capability boundary.

## Non-goals

This capability does not change solver ranking/cost/tie-break, guitar tuning, string/fret feasibility, arrangement policy, repeat semantics, note semantics, resource ceilings, or MONO/POLY routing. It does not add filename, title, composer, path, corpus ID, or hash-specific behavior.
