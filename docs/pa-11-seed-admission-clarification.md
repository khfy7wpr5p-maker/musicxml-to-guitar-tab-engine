# PA-11.0 Seed Benchmark Admission Clarification

This file is a normative companion to `pa-11-teacher-approved-arrangement-benchmark-contract.md`.

PA-10.2 records unresolved final-selection gaps for transition/path effects and sustained sonority. PA-11 evaluation evidence must not hide those gaps.

For the initial `PA-11.1` proposed seed benchmark:

- a case MUST NOT require unresolved sustained-sonority hand-occupancy semantics to determine whether its golden arrangement is valid;
- a case MUST NOT require transition/path optimization that has not yet been separately specified and approved;
- a case MUST NOT require executable semantics for `VOICE_REDISTRIBUTED`, `REVOICED`, or `ARPEGGIATED` while those transformations remain deferred;
- initial golden outcomes MUST be expressible using already-defined source facts, approved deterministic arrangement/reduction semantics, exact retained-note target pitches, selected positions, and complete static selected-shape facts;
- future benchmark versions MAY add sustained-sonority, path-transition, redistributed-voice, revoicing, or arpeggiation cases only after the corresponding semantics and evaluation comparison rules are separately approved;
- adding those later case classes is a material benchmark change and therefore requires a new proposed artifact version and a new teacher-review cycle.

The desired-coverage examples in the main PA-11.0 contract describe long-term benchmark coverage. They do not authorize unresolved case classes in the initial seed artifact.

This clarification changes no runtime, public API, writer, canonical contract, final-selection authority, PA-12 activation, or teacher-approval status. Merge remains separately gated.
