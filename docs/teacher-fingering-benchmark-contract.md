# TeacherFingeringBenchmark 1.0.0

## Purpose

`TeacherFingeringBenchmark 1.0.0` is an internal, fixed evaluation-artifact contract for teacher-reviewed monophonic guitar fingering examples.

It exists to provide an independent deterministic reference set for future evaluation. It does not modify MusicXML conversion, candidate generation, physical validation, optimizer costs, tie-breaking, `CanonicalTabResult`, or package-root APIs.

The benchmark is **not** a live TeacherFeedback dataset and is **not** a training dataset.

## Version and status

- Contract version: `1.0.0`
- Initial benchmark ID: `teacher-fingering-v1`
- Initial benchmark version: `1.0.0`
- Internal only; not exported from the package-root API.
- Evaluation Harness is a separate B2 gate and is not part of B1.

The manifest carries an explicit `reviewStatus`:

- `proposed`: structurally valid and reviewable, but not authorized as teacher-approved golden evidence.
- `teacher-approved`: the fixed labels have received explicit pedagogical approval.

`assertTeacherApprovedBenchmark()` rejects any benchmark that remains `proposed`. A benchmark must not be used as approved evaluation truth merely because it is structurally valid or committed to a branch.

### Review/version integrity rule

Teacher approval applies to one exact reviewed benchmark artifact version, not to a mutable filename.

After a benchmark has been marked `teacher-approved`, any change to fixture bytes, source SHA-256 values, event labels, accepted/preferred positions, guitar configuration, case membership, or pedagogical focus requires a new review cycle. The changed artifact must not retain the old approval claim silently: its benchmark version must be advanced as appropriate and its `reviewStatus` must return to `proposed` until the changed artifact is explicitly reviewed again.

The runtime contract validates the current object; Git history and review workflow remain repository-governance evidence and cannot be inferred from a string field alone.

## Fixed artifact layout

B1 stores:

```text
benchmarks/teacher-fingering-v1/
├── benchmark.json
└── fixtures/
    └── *.musicxml
```

The initial fixtures are small self-authored monophonic exercises. They are intentionally independent from private teaching material, student data, copyrighted score copies, live TeacherFeedback records, and external mutable URLs.

Each case source path must be a repository-relative path matching the fixed B1 fixture directory and a `.musicxml` filename. Absolute paths, parent traversal, backslash paths, and other extensions fail closed.

## Manifest shape

The manifest contains exactly:

- `documentType: "TeacherFingeringBenchmark"`
- `contractVersion: "1.0.0"`
- bounded `benchmarkId`
- bounded `benchmarkVersion`
- `reviewStatus`
- exact `GuitarConfiguration` reference/value
- bounded dense `cases[]`

Each case contains exactly:

- bounded unique `caseId`
- bounded `pedagogicalFocus`
- `source`
  - fixed repository-local `path`
  - lowercase SHA-256 `sha256`
  - source `policy`
- bounded dense `events[]`

Supported source policies are:

- `self-authored`
- `CC0`
- `public-domain`

The initial B1 artifact uses only `self-authored` fixtures.

## Event labels

Each benchmark event contains exactly:

- deterministic canonical `eventId`
- `pitchMidi`
- non-empty bounded `acceptedPositions[]`
- `preferredPosition`, which may be `null`

Each position contains exactly integer:

- `string`
- `fret`

The validator requires every accepted/preferred position to produce the event's exact MIDI pitch under the benchmark guitar configuration.

Accepted positions are a **set of teacher-acceptable alternatives**, not a claim that only one physical location can be correct. This prevents a future evaluator from treating every non-preferred but pedagogically acceptable position as an error.

`preferredPosition`:

- may identify one preferred member of `acceptedPositions`, or
- may be `null` when the teacher intentionally does not assert a single first choice.

The validator rejects duplicate accepted positions and rejects a preferred position that is not an exact accepted member.

### Event-local semantics

`acceptedPositions[]` and `preferredPosition` are event-local labels. They do not imply that every Cartesian combination of accepted event positions forms a teacher-approved whole-piece fingering path.

B1 therefore does not claim path-level pedagogical truth. A future evaluator may report event-local acceptance using these labels, but a path-level or sequence-level benchmark requires a separately versioned contract that explicitly represents approved transitions or complete approved paths. This prevents B2 from silently converting independent per-note labels into a stronger sequence-level claim.

## Source-content binding

Each case is bound to the exact UTF-8 fixture bytes through SHA-256.

`verifyTeacherBenchmarkCaseSource()` recomputes the digest over the supplied source string and fails closed on mismatch. This detects fixture substitution relative to the manifest.

The digest is a content-integrity binding, not a digital signature, copyright attestation, teacher identity proof, timestamp, or external provenance proof.

## Hostile-input boundary

The runtime contract rejects:

- unknown fields;
- symbol properties;
- non-enumerable data properties;
- accessor-backed contract fields;
- proxy-backed objects or arrays at contract boundaries;
- non-plain objects;
- sparse or custom-property arrays;
- excessive case/event/accepted-position counts;
- duplicate case/event identities;
- malformed IDs and SHA-256 values;
- unsafe fixture paths;
- unsupported source policies;
- malformed guitar configuration;
- out-of-range positions;
- pitch-inconsistent positions;
- duplicate accepted positions;
- preferred positions outside the accepted set.

Produced benchmark records are reconstructed field-by-field and deeply frozen.

## Initial B1 fixture set

The review-ready v1 proposal contains eight self-authored four-note cases covering:

1. open-string / low-fret reference;
2. first-position scale motion;
3. same-string continuity in the upper voice;
4. continuity on the third string even when an open-string alternative exists;
5. multiple acceptable positions with no forced preference;
6. descending upper-register same-string continuity;
7. cross-string continuity decisions around open-string alternatives;
8. repeated-tone position stability.

The manifest remains `proposed` until the pedagogical labels receive explicit teacher approval. B1 must not silently convert proposal labels into approved truth.

## Artifact conformance boundary

B1 artifact tests may verify that:

- every fixed MusicXML file exists under the benchmark fixture root;
- every source SHA-256 matches;
- every fixture remains inside the currently supported monophonic MusicXML scope;
- every labeled event ID exists in the fixture;
- each label's MIDI pitch matches the source event;
- every accepted position is present in the engine's physical candidate universe.

B1 does **not** calculate acceptable-match, preferred-match, case-pass, or ranking metrics. Comparing the deterministic optimizer's actual selection against benchmark labels belongs exclusively to the later B2 Evaluation Harness gate.

## Independence and leakage boundary

The benchmark golden labels must not be generated by copying the current optimizer's selected positions and then calling those selections teacher truth.

The fixed benchmark is evaluation evidence. Future learned-ranking work must not train on this same fixed evaluation set and then report performance on it as independent evidence.

Any later training corpus requires a separately reviewed data boundary, including the already documented durable admission and lawful-use/consent requirements where applicable.

## Privacy and copyright boundary

Teacher benchmark artifacts must not contain:

- teacher/student names or account identifiers;
- emails or contact details;
- free-form TeacherFeedback reason text;
- timestamps or network metadata;
- consent records;
- private lesson material;
- copyrighted score copies without an independently valid source policy.

The initial v1 sources are self-authored synthetic exercises and contain no personal data.

## Non-authority rules

TeacherFingeringBenchmark MUST NOT:

- mutate the deterministic conversion pipeline;
- create new guitar candidates outside physical validation;
- change the optimizer or cost model;
- write to `CanonicalTabResult`;
- expose benchmark APIs from `src/index.js`;
- create a live persistence or research dataset;
- grant research/training consent;
- activate learned ranking;
- perform network access;
- treat `proposed` labels as teacher-approved evidence;
- infer whole-path teacher approval from event-local accepted-position labels;
- implement B2 evaluation scoring.

## B2 readiness

B2 Evaluation Harness may begin only after the fixed B1 manifest is explicitly teacher-approved and B1 has passed its required regression/CI/merge gates.

A future B2 harness should consume only approved fixed artifacts, use the existing deterministic conversion pipeline, report all cases without silent skip, and remain separate from optimizer authority.
