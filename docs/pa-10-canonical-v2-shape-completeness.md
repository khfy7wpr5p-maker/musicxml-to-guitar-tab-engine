# PA-10.4 Selected Shape Completeness

This file is a normative PA-10.4 companion to `pa-10-canonical-tab-result-v2-schema-proposal.md`.

For each `simultaneousGroups[]` entry, derive the retained members by taking its `sourceEventIds` in source order and keeping only note dispositions whose disposition is `KEEP`.

If two or more members are retained:

- exactly one selected shape MUST exist for that source group;
- the selected shape `sourceEventIds` MUST equal all and only the retained member IDs, in the same order;
- every retained member MUST reference that selected shape;
- no retained member may use a null or different selected-shape reference;
- selected positions MUST use distinct strings;
- finger assignments MUST cover the same membership exactly once;
- the selected shape MUST have `PLAYABLE_WITHIN_POLICY` status under the recorded validation policy.

If zero or one member is retained:

- no selected shape may exist for that source group;
- a retained singleton still MUST have one selected guitar position;
- the singleton selected-shape reference MUST be null;
- multi-note voicing, shape, fingering, barre, or playability provenance MUST NOT be fabricated for the singleton.

A future v2 validator MUST fail closed for missing, partial, duplicate, extra, or inconsistent selected-shape membership.

If a complete accepted shape cannot be selected for every retained member of a group with two or more retained members, a valid `CanonicalTabResult 2.0.0` MUST NOT be produced.

This document changes no runtime, public API, writer, workflow, test, v1 contract, final-selection authority, or PA-10.5+ implementation. Merge remains separately gated.
