# PROD-TECH-03 — Deterministic hammer-on provenance pairing

## Scope

This stage extends the existing `GuitarTechniqueProvenance` metadata-only contract with
deterministic pairing identity for **hammer-on** START/STOP markers only.

It does not add physical legato behavior, destination-pitch inference, fingering authority,
candidate/ranking changes, or source musical-fact mutation.

`pull-off` remains fail-closed because LAB-TECH-03 has no retrieved Guitar Pro 7.6.0 producer
evidence clearing its exact source form. `slide` pairing is documented separately in
[`PROD_TECH_04_SLIDE_PAIRING.md`](PROD_TECH_04_SLIDE_PAIRING.md).

## Research evidence

LAB-TECH-03 established two relevant Guitar Pro 7.6.0 cases:

- `[Air]鸟之诗.xml` contains ordinary `hammer-on number="1"` START/STOP pairs in explicit
  voice/staff context. These are metadata-only and may be paired only when event identity is
  deterministic.
- `[Air]てんとう虫(瓢虫).xml` contains reused-number chains of the form
  START → START+STOP → STOP. The `number` attribute is therefore not a unique pair identifier,
  and automatic pairing of the overlapping chain is forbidden.

LAB-TECH-02 already reserved the provenance fields `pairingId`, `pairingBasis`, and
`sourcePairingToken`, with `pairingBasis=DETERMINISTIC_SOURCE_IDENTITY` as the only permitted
pairing basis.

## Production rule

Endpoint validation remains keyed by the existing bounded source context:

- part index;
- explicit MusicXML voice;
- explicit MusicXML staff;
- technique kind;
- MusicXML technique number.

After endpoint balance is proven, hammer events are examined in source-tree order.

A balanced segment is paired only when all of the following hold:

1. it contains exactly one START followed by exactly one STOP;
2. no second START becomes simultaneously open inside that balanced segment;
3. both markers have deterministic source-tree locators;
4. the two records are hammer-on provenance records.

The pair receives:

- one bounded `pairingId` derived from a SHA-256 digest of the two endpoint source locators;
- `pairingBasis: DETERMINISTIC_SOURCE_IDENTITY`;
- one shared `sourcePairingToken` containing both endpoint locators.

A reused `number` may therefore occur in several independent pairs without becoming pair
authority itself.

If an overlapping segment reaches depth greater than one, the entire balanced segment remains
unpaired (`pairingId`, `pairingBasis`, and `sourcePairingToken` stay `null`). No stack/queue
guess is made.

Malformed, orphaned, cross-voice, cross-staff, or conflicting-number endpoints continue to fail
closed under `UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING`.

## Invariants

- `capabilityClass` remains `SAFE_METADATA_ONLY`.
- `physicalSemanticsEnabled` remains `false`.
- source pitch, octave, onset, duration, voice, staff, tie, grace and chord membership are not
  carried or rewritten by provenance.
- no candidate, ranking or solver state is carried or changed.
- the parsed source document is not mutated.
- extraction remains deterministic.
- pull-off and unknown technical children remain fail-closed.
- slide pairing is not enabled by this stage.

## Real-corpus gate

Before merge, the exact nine-file Guitar Pro 7.6.0 external corpus must be re-executed twice
through `processMusicXmlUpload()` against the exact PROD-TECH-03 runtime head.

Required checks:

- 9/9 source SHA-256 identity;
- 9/9 two-run determinism;
- 9/9 source-byte immutability;
- no new unreviewed public blocker drift;
- no public canonical/runtime-result drift caused by metadata-only pairing.

The corpus XML files remain external and must not be committed.
