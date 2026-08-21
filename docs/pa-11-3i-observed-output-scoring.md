# PA-11.3I — Evaluation-only observed output + teacher-approved match/scoring

## Purpose

PA-11.3I introduces an internal evaluation contract for comparing an independently observed guitar arrangement against the exact teacher-approved `TeacherArrangementBenchmark 1.1.0 / 0.2.0`.

The central rule is:

> The observed result must not identify or select teacher-gold arrangement IDs. Matching is computed from complete observed musical/guitar semantics after the observation exists.

This prevents a caller from obtaining a benchmark match merely by copying an approved `arrangementId`.

## Gate order

The scorer requires the exact PA-11.3H evidence chain first:

1. exact benchmark + approval byte admission (PA-11.3F);
2. teacher-approved v1.1 semantic validation (PA-11.3G);
3. exact source/runtime physical replay (PA-11.3H);
4. only then validate and score the supplied observed output.

A benchmark/runtime failure stops evaluation fail closed.

## Observed output contract

Internal identity:

```text
documentType: TeacherArrangementObservedOutput
contractVersion: 1.0.0
```

Root:

```text
TeacherArrangementObservedOutput
├─ documentType
├─ contractVersion
├─ benchmarkId
├─ benchmarkVersion
└─ cases[]
```

Every benchmark case appears exactly once and in exact benchmark order.

Each case contains:

```text
case
├─ caseId
└─ observedArrangement
```

`observedArrangement` is either `null` (the evaluated producer returned no complete arrangement) or:

```text
observedArrangement
├─ sourceOutcomes[]
├─ realizedTones[]
└─ barres[]
```

No observed object contains a teacher arrangement ID, preferred-arrangement hint, review code, teacher label, benchmark-selected shape ID, or other gold-selection shortcut.

## Source outcomes

Each selected source note is covered exactly once:

```text
sourceOutcome
├─ sourceEventId
├─ sourceMidi
├─ disposition   // RETAINED | OMITTED
└─ targetMidis[]
```

Rules:

- source MIDI must equal bound source truth;
- `RETAINED` has one or more target MIDI values;
- `OMITTED` has no targets;
- target values describe the independently observed realized tones, including one-to-many revoicing;
- source outcomes and realized-tone provenance must agree as exact multisets.

## Realized tones

```text
realizedTone
├─ realizedToneId
├─ sourceEventId
├─ targetMidi
├─ string
├─ fret
└─ finger
```

`realizedToneId` is observation-local and is deliberately excluded from benchmark semantic matching.

Rules:

- at most six simultaneous realized tones;
- strings are distinct;
- each `{string, fret}` must reproduce exact target MIDI;
- multi-tone shapes require complete finger facts;
- singleton observations may use `finger: null` where the benchmark does not carry a selected multi-note fingering fact.

Multi-tone observations are replayed through the existing evaluation-only PA-8/PA-9 adapter from PA-11.3H. Singleton positions are checked through the existing standard-guitar position validator.

## Match classes

The report distinguishes exactly these evaluation classes:

- `PREFERRED_MATCH` — complete semantics equal the explicitly preferred approved arrangement;
- `ACCEPTABLE_MATCH` — complete semantics equal an approved arrangement that is not preferred;
- `PHYSICALLY_VALID_NOT_APPROVED` — the complete observed guitar arrangement passes physical replay but matches no approved benchmark arrangement;
- `INVALID` — the observation is structurally readable but its source/tone provenance or physical realization is invalid;
- `UNMATCHED` — the observed producer returned no complete arrangement for the case.

For benchmark `0.2.0`, all `preferredArrangementId` values are `null`, so valid approved matches currently classify as `ACCEPTABLE_MATCH`.

## Scoring

The evaluation report includes deterministic counts and:

```text
matchedCaseRate = (PREFERRED_MATCH + ACCEPTABLE_MATCH) / caseCount
```

No weighted pedagogical score, optimizer reward, training label, confidence value, or production rank is introduced.

## Independence and non-authority

PA-11.3I does not:

- generate observed output from teacher gold;
- alter the observed arrangement;
- feed benchmark answers back into engine selection;
- select a production arrangement;
- activate `REVOICED`, `VOICE_REDISTRIBUTED`, or `ARPEGGIATED` in PA-6 production execution;
- alter optimizer costs or candidate ordering;
- write `CanonicalTabResult`;
- expand the package-root public API;
- grant training authority;
- activate PA-12.

The scorer can evaluate caller-supplied independent observations, but PA-11.3I alone is not evidence that the current production engine can generate the teacher-approved C/Cmaj7 revoicings. A genuine engine benchmark result requires an independently produced observation from an authorized producer/adapter rather than a test fixture copied from benchmark gold.

## Hostile-data boundary

Observed input fails closed for unknown/symbol fields, proxies, accessors, non-plain objects, sparse/custom arrays, cycles/shared references, out-of-bound counts, malformed MIDI/string/fret/finger facts, and benchmark identity/order mismatch.

Case-level musical/physical failures are reported as `INVALID`; hostile contract-shape failures throw the internal observed-output contract error.
