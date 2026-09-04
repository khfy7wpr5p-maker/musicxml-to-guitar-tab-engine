# MXML_FINGERING_PROVENANCE_V1

Status: `SUPPORTED` for the bounded V1 provenance shapes below.

Base main SHA before implementation: `f477e97cd2edf3168739ba299faa2b11aade004e`.

## Purpose

`CAP_FINGERING_PROVENANCE_V1` separates source fingering annotation evidence from Guitar TAB physical authority.

A MusicXML `<fingering>` value is not automatically a guitar instruction. Piano/generic fingering can use the same numeric lexemes as guitar left-hand fingering, so interpreting every `1..4` as a guitar constraint would create false physical restrictions.

V1 therefore records fingering first and promotes it only through explicit, bounded evidence.

## Authority classes

Every admitted source record has exactly one authority class:

- `SOURCE_ANNOTATION_ONLY` — valid fingering annotation without proven guitar instrument/staff authority;
- `GUITAR_FINGERING_CANDIDATE` — explicit six-string guitar staff context exists, but the record is not yet proven usable by the exact implemented finger-assignment surface;
- `GUITAR_FINGERING_EXACT` — explicit six-string guitar staff context, lexically valid finger `1..4`, no alternate/substitution semantics, and exact binding to an existing PA-8 simultaneous-group finger assignment;
- `INVALID_FINGERING` — lexeme or admitted attributes are outside the bounded V1 profile.

No class is selected from filename, title, composer, path, corpus ID, hash, or `part-name` text.

## Canonical provenance record

The internal immutable V1 record preserves:

- exact `sourceEventId` after grace/source-order rebasing;
- measure index/number;
- staff and voice;
- raw fingering lexeme;
- normalized integer only when the lexeme is valid;
- `placement`, `substitution`, and `alternate` when present;
- the admitted raw attribute map;
- source instrument context;
- authority class;
- duplicate status;
- exact source path/index provenance.

The original upload bytes remain authoritative and immutable. V1 strips only the already-recorded `<fingering>` child from the compatibility document used for TAB semantic projection; it does not mutate the source artifact.

## Generic and piano fingering

Without explicit source guitar configuration evidence, valid fingering defaults to `SOURCE_ANNOTATION_ONLY`.

It may be retained as provenance/display evidence, but it must not:

- restrict string selection;
- restrict fret selection;
- alter PA-8 finger candidates;
- change solver cost/ranking/tie-break;
- infer right-hand `p-i-m-a`;
- infer left-hand guitar technique;
- infer string or fret from the finger number.

A score named `Guitar` without explicit physical staff configuration does not gain guitar fingering authority.

## Explicit guitar evidence

V1 reuses the existing `MusicXmlGuitarConfigurationProvenance 1.0.0` proof surface.

Only an `EXPLICIT` source configuration record for the exact part/staff — including the existing six-string tuning validation — establishes `EXPLICIT_SIX_STRING_GUITAR_STAFF` context for fingering classification.

This fingering layer is not configuration-validation authority. If configuration proof cannot be established here, fingering remains generic/untrusted; the owning upload runtime independently preserves its existing configuration validation and failure policy.

## Exact PA-8 constraint

`GUITAR_FINGERING_EXACT` is deliberately narrow:

- normalized finger must be `1..4`, matching the existing PA-8 fretting-finger domain;
- source staff must have explicit six-string guitar configuration evidence;
- `alternate="yes"` and `substitution="yes"` are not promoted to exact constraints;
- grace fingering is provenance-only in V1;
- singleton fingering is not promoted because the current singleton final-selection contract does not expose PA-8 finger assignments;
- the source event must be a member of an existing simultaneous group handled by PA-8.

The exact constraint filters only the already-existing PA-8 finger-assignment enumeration. It does not add a new cost, preference, ranking term, tie-break, fret candidate, string candidate, or resource ceiling.

If an exact finger is physically incompatible with all existing shapes, normal physical feasibility failure is preserved. V1 does not invent a replacement finger.

## Sustained fallback boundary

The static PA-8 model and the sustained physical-state model are distinct contracts.

V1 does not silently drop an exact source-guitar fingering constraint when static final selection requests sustained fallback for a retained tie or sustained overlap. In that case the existing bounded unsupported outcome is preserved rather than running the sustained selector without the exact fingering authority.

A broader sustained-fingering contract requires a separately versioned capability.

## Duplicate wrappers

Multiple source fingering annotations on one note are preserved as separate source records.

If every record is semantically equivalent, they are marked `EQUIVALENT_DUPLICATE`. At most one exact solver constraint is created for the source event.

If duplicate records are not provably equivalent, they are marked `CONFLICTING_DUPLICATE` and a located `CONFLICTING_FINGERING_ANNOTATIONS` issue is emitted with `REVIEW_REQUIRED`. No exact constraint is produced from the conflict.

## Invalid fingering

V1 admits the lexical integer set `1..5` for source annotation evidence. Only `1..4` can become exact guitar fretting constraints.

The admitted attribute set is:

- `placement="above|below"`;
- `substitution="yes|no"`;
- `alternate="yes|no"`.

Unknown/duplicate attributes, foreign attributes, child elements inside `<fingering>`, excessive text, or lexemes outside `1..5` produce `INVALID_FINGERING` with stable source evidence and `REVIEW_REQUIRED`; values are not rounded, clamped, translated, or replaced.

## Technical-wrapper safety

Supporting `<fingering>` does not create a generic `<technical>` bypass.

The compatibility pass removes only the fingering children it has recorded. String/fret, harmonic, hammer-on, pluck, slide, play metadata and all unknown technical children remain available to the pre-existing strict guitar-technique provenance validator.

Therefore a wrapper such as fingering plus an unsupported foreign technical child remains fail-closed at the established boundary.

## Runtime and processing safety

Fingering extraction runs inside the existing owned parsed-document processing pass.

The public runtime establishes a synchronous scoped collector before invoking the preserved base runtime. The compatibility chain records bound issues and immutable exact constraints into that same call scope. PA-8 consumes the exact constraint through its explicit optional parameter contract, with the scoped value used only as production plumbing where the preserved base runtime cannot be rewritten without duplicating its implementation.

The collector is stack-scoped and removed in `finally`, so sequential or nested synchronous calls cannot retain another upload's fingering authority.

There is no second SAX parse, no reread of caller bytes, and no independent processing budget.

## Required regressions

V1 is gated by tests covering:

- generic annotation provenance with exact source-event identity;
- generic/piano fingering does not alter canonical TAB selection;
- explicit six-string guitar fingering filters the exact PA-8 finger assignment;
- invalid fingering becomes located `REVIEW_REQUIRED`;
- equivalent duplicate wrappers preserve both records but create one constraint;
- conflicting duplicates become `REVIEW_REQUIRED`;
- unknown technical children remain fail-closed;
- 215 generic annotations parse deterministically without becoming guitar constraints;
- one runtime processing pass;
- source-byte immutability.

## Non-goals

V1 does not perform piano-to-guitar fingering conversion, right-hand fingering inference, technique guessing, new solver ranking, new solver costs, new tie-break rules, new fret/string candidates, resource-ceiling increases, filename-specific behavior, source mutation, or broad technical-wrapper acceptance.