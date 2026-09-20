# R9 Melody–Bass Piano-to-Guitar Arrangement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the provisional dense-piano path's premature three-note ceiling with a deterministic melody–bass-first six-to-one retry policy that produces more complete reviewable guitar TAB without weakening source, safety, or physical-playability guarantees.

**Architecture:** Add a pure policy module that ranks source-note identities and explains every retention/reduction decision; keep `partialGuitarArrangement` as the bounded retry orchestrator and reuse the existing canonical-v2 physical selector and writer unchanged. Version the provisional artifact to `1.1.0`, admit historical `1.0.0` artifacts explicitly, preserve R8 exact-position replay, and expose concise decision labels in the existing same-page Workbench.

**Tech Stack:** Node.js CommonJS, built-in `node:test`/`node:assert`, immutable application contracts, MusicXML, alphaTab 1.8.4 browser smoke tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-melody-bass-piano-arrangement-design.md`

## Global Constraints

- New runtime artifact: `PartialGuitarTabArrangement 1.1.0`.
- New policy identifier: `MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0`.
- Retry caps are exactly `6, 5, 4, 3, 2, 1`; the first physically valid candidate wins.
- Caps `2` through `6` retain distinct melody and bass anchors; cap `1` is an explicit melody-only fallback.
- Source MusicXML, source pitch, onset, duration, voice, staff, measure structure, and tie identity remain immutable.
- No free octave rewrite, arpeggiation, inferred harmony authority, learned ranking, new dependency, or resource-limit increase.
- Existing PA-7/8/9 selection, physical validation, writer, cancellation, deadline, and attempt ceilings remain authoritative.
- Output remains `REVIEW_REQUIRED`, provisional, visible/playable/editable, non-canonical, and non-exportable.
- R8 exact string/fret assignments are retained or rejected explicitly; never silently dropped or moved.
- Package-root monophonic APIs and `CanonicalTabResult 1.x` remain unchanged.

## Review Focus

- A teacher-forced source event that competes with six ordinary pitches must remain selected or return the existing explicit override error; Task 1 and Task 3 pin this.
- A tie chain crossing onset or measure boundaries must be retained as a complete unit or entirely unassigned; Task 1 pins this.
- Unison/duplicate target pitches must not consume silent capacity or lose per-source provenance; Task 1 and Task 2 pin this.
- Cancellation or deadline exhaustion during a high-cap attempt must stop immediately rather than retrying a lower cap; Task 2 pins this.
- Capo/custom-tuning options must flow to the unchanged physical selector and must not be reconstructed by the policy; Task 2 pins this.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/music/melodyBassArrangementPolicy.js` | Pure deterministic onset ranking, tie-unit preservation, selected identities, and per-source reason codes. |
| `tests/melodyBassArrangementPolicy.test.js` | Focused policy tests independent of writer/UI behavior. |
| `src/app/partialGuitarArrangement.js` | Six-to-one orchestration, physical retry evidence, artifact `1.1.0`, and policy reason propagation. |
| `tests/partialGuitarArrangementRuntime.test.js` | Upload-level artifact, retry, immutability, tuning/capo, and deterministic-output tests. |
| `src/app/reviewRequiredCapabilityContract.js` | Strict version-aware validation for provisional artifacts `1.0.0` and `1.1.0`. |
| `tests/reviewRequiredCapabilityContract.test.js` | Historical/new artifact admission and hostile-shape rejection. |
| `tests/r8OmittedNoteAssignment.test.js` | R8 exact-position replay against the new arrangement policy. |
| `web/guitar-tab-workbench/workbench.js` | Human-readable labels for exact R9 reason codes; no arrangement inference. |
| `tests/guitarTabWorkbenchStaticContract.test.js` | Static UI contract for reason mapping and safe fallback. |
| `tests/compatibility/alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs` | Real browser proof of visible provisional TAB and reasons. |
| `scripts/stage09-additional-real-corpus-audit.js` | Real-corpus measurement including artifact document type, version, policy, counts, and deterministic hashes. |
| `tests/stage09AdditionalRealCorpusAudit.test.js` | Audit regression and deterministic metric checks. |
| `docs/ARCHITECTURE.md` | Active R9 data flow and authority boundary. |
| `docs/current-status.md` | Exact verified R9 behavior and measured corpus outcome. |
| `docs/r9-melody-bass-piano-arrangement.md` | Closure document with versions, tests, CI evidence, and limitations. |

### Task 1: Isolated melody–bass selection policy

**Files:**
- Create: `src/music/melodyBassArrangementPolicy.js`
- Create: `tests/melodyBassArrangementPolicy.test.js`

**Interfaces:**
- Consumes: `{ sourceModel, reduction, tieGraph, retainedNoteCap, forcedSourceEventIds }` plus optional processing runtime.
- Produces: `createMelodyBassArrangementSelection(input, processing)` returning a deeply frozen `{ retainedNoteCap, selectedSourceEventIds, reasonBySourceEventId }`; the reason map covers every reduction instruction whose disposition is `KEEP`, while representation-only `OMIT` reasons remain owned by the existing artifact builder.
- Reason values: `MELODY_ANCHOR_RETAINED`, `BASS_ANCHOR_RETAINED`, `INNER_VOICE_RETAINED`, `TEACHER_ASSIGNMENT_RETAINED`, `GUITAR_CAPACITY_REDUCTION`, `DUPLICATE_TARGET_PITCH_REDUCTION`.

- [ ] **Step 1: Write red tests for six-note retention and stable ranking**

Create fixtures from validated source/reduction-shaped objects and assert the public result, not internal sort operations:

```js
test('retains six distinct pitches in melody-bass outer-to-inner order', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 55, 60, 64, 67, 72], { retainedNoteCap: 6 }),
  );
  assert.deepEqual(result.selectedSourceEventIds, eventIds(6));
  assert.equal(result.reasonBySourceEventId[eventIds(6)[5]], 'MELODY_ANCHOR_RETAINED');
  assert.equal(result.reasonBySourceEventId[eventIds(6)[0]], 'BASS_ANCHOR_RETAINED');
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(result, createMelodyBassArrangementSelection(
    policyInput([48, 55, 60, 64, 67, 72], { retainedNoteCap: 6 }),
  ));
});

test('seven pitches at cap six retain both anchors and reduce one inner voice', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 50, 52, 53, 55, 57, 59], { retainedNoteCap: 6 }),
  );
  assert.equal(result.selectedSourceEventIds.length, 6);
  assert.ok(result.selectedSourceEventIds.includes(eventId(0)));
  assert.ok(result.selectedSourceEventIds.includes(eventId(6)));
  assert.equal(Object.values(result.reasonBySourceEventId)
    .filter((reason) => reason === 'GUITAR_CAPACITY_REDUCTION').length, 1);
});
```

- [ ] **Step 2: Run the focused tests and verify red state**

Run: `node --test tests/melodyBassArrangementPolicy.test.js`

Expected: FAIL with `MODULE_NOT_FOUND` for `src/music/melodyBassArrangementPolicy.js`.

- [ ] **Step 3: Implement input validation and deterministic onset ranking**

Implement and export only the constants and function required by callers:

```js
const RETAINED_NOTE_CAPS = Object.freeze([6, 5, 4, 3, 2, 1]);

function createMelodyBassArrangementSelection({
  sourceModel,
  reduction,
  tieGraph = null,
  retainedNoteCap,
  forcedSourceEventIds = new Set(),
}, processing = null) {
  if (!RETAINED_NOTE_CAPS.includes(retainedNoteCap)) {
    throw new TypeError('retainedNoteCap must be an integer from 1 through 6.');
  }
  const instructionById = indexKeepInstructions(reduction.instructions);
  const onsetGroups = groupSourceNotesByOnset(sourceModel, instructionById);
  const selection = selectRankedOnsetGroups({
    onsetGroups,
    retainedNoteCap,
    forcedSourceEventIds,
  }, processing);
  applyTieChainClosure(selection, tieGraph, forcedSourceEventIds);
  return freezeSelection(selection, retainedNoteCap, sourceModel, instructionById);
}
```

Implement the five private helpers in the same file. `indexKeepInstructions()` admits only `disposition === 'KEEP'`; `groupSourceNotesByOnset()` keys by measure index plus onset; `selectRankedOnsetGroups()` sorts by `targetMidi` descending then `sourceOrder` ascending and applies forced/high/low/outer-to-inner ordering; `applyTieChainClosure()` enforces all-or-none chain membership; `freezeSelection()` returns source-ordered IDs and one allowed reason for every source note. Use `instruction.targetMidi` for register ordering. Do not read harmony labels or calculate guitar positions.

- [ ] **Step 4: Add red edge tests for duplicates, ties, forced events, and cap one**

```js
test('duplicate target pitch is explicit and does not consume ordinary capacity', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 60, 60, 64, 67], { retainedNoteCap: 4 }),
  );
  assert.equal(result.selectedSourceEventIds.length, 4);
  assert.equal(result.reasonBySourceEventId[eventId(2)], 'DUPLICATE_TARGET_PITCH_REDUCTION');
});

test('forced assignment wins and a complete tie chain remains indivisible', () => {
  const result = createMelodyBassArrangementSelection(forcedTieInput());
  assert.ok(result.selectedSourceEventIds.includes('forced:start'));
  assert.ok(result.selectedSourceEventIds.includes('forced:stop'));
  assert.equal(result.reasonBySourceEventId['forced:start'], 'TEACHER_ASSIGNMENT_RETAINED');
});

test('cap one is melody-only and makes bass reduction explicit', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 72], { retainedNoteCap: 1 }),
  );
  assert.deepEqual(result.selectedSourceEventIds, [eventId(1)]);
  assert.equal(result.reasonBySourceEventId[eventId(0)], 'GUITAR_CAPACITY_REDUCTION');
});
```

- [ ] **Step 5: Complete tie-unit and forced-event handling**

Normalize valid tie chains to source-event units before final selection. If any chain segment is forced, all chain segments are forced. If an ordinary chain cannot be retained consistently at every segment onset, remove the complete chain and mark every segment `GUITAR_CAPACITY_REDUCTION`. If forced units exceed a cap, retain them in the candidate so the existing physical layer—not the policy—returns the authoritative override/capacity error.

- [ ] **Step 6: Run policy tests and adjacent source/reduction tests**

Run: `node --test tests/melodyBassArrangementPolicy.test.js tests/deterministicVoiceAnalysis.test.js tests/deterministicReductionPlan.test.js tests/sustainTieGraph.test.js`

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/music/melodyBassArrangementPolicy.js tests/melodyBassArrangementPolicy.test.js
git commit -m "feat(R9): add melody-bass arrangement policy"
```

### Task 2: Six-to-one physical retry and artifact 1.1

**Files:**
- Modify: `src/app/partialGuitarArrangement.js:14-610`
- Modify: `tests/partialGuitarArrangementRuntime.test.js:1-130`

**Interfaces:**
- Consumes: `createMelodyBassArrangementSelection()` from Task 1.
- Produces: `PartialGuitarTabArrangement 1.1.0` with policy `MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0`, `recovery.retainedNoteCap`, and frozen `recovery.attempts[]` records `{ retainedNoteCap, outcome, errorCode }`.

- [ ] **Step 1: Change upload tests to require the R9 contract and higher coverage**

Update the six-note fixture assertion:

```js
assert.equal(first.arrangementArtifact.contractVersion, '1.1.0');
assert.equal(first.arrangementArtifact.policy, 'MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0');
assert.ok(first.arrangementArtifact.assignedNoteCount >= 4);
assert.deepEqual(
  first.arrangementArtifact.recovery.attempts.map((entry) => entry.retainedNoteCap),
  [...new Set(first.arrangementArtifact.recovery.attempts.map((entry) => entry.retainedNoteCap))],
);
assert.equal(first.arrangementArtifact.recovery.attempts.at(-1).outcome, 'SELECTED');
```

Add assertions that melody and bass source IDs are retained for any successful cap of at least two, and that every unassigned note uses an allowed exact R9 reason.

- [ ] **Step 2: Add red tests for retry order, cancellation, deadline, capo/custom tuning, and immutability**

Use the production upload entry point where possible. For retry control, expose no new public test hook: construct a fixture whose six/five-note candidates are unplayable but a lower cap is playable and assert the recorded attempt sequence. Add direct recovery tests with the existing processing runtime to assert `PROCESSING_ABORTED` and `PROCESSING_DEADLINE_EXCEEDED` escape immediately.

```js
assert.deepEqual(result.arrangementArtifact.recovery.attempts, [
  { retainedNoteCap: 6, outcome: 'REJECTED', errorCode: expectedPhysicalCode },
  { retainedNoteCap: 5, outcome: 'SELECTED', errorCode: null },
]);
assert.deepEqual(sourceBytes, originalBytes);
assert.deepEqual(sourceModel, originalSourceModelSnapshot);
```

For capo/custom tuning, compare selected positions against the configured fretboard and assert no policy-produced tuning/register fields exist.

- [ ] **Step 3: Run the focused runtime test and verify red state**

Run: `node --test tests/partialGuitarArrangementRuntime.test.js`

Expected: FAIL because runtime still emits `1.0.0`, policy `MELODY_BASS_BOUNDED_REDUCTION_1.0`, and starts at cap three.

- [ ] **Step 4: Replace in-file note selection with the Task 1 policy**

In `partialGuitarArrangement.js`:

```js
const {
  RETAINED_NOTE_CAPS,
  createMelodyBassArrangementSelection,
} = require('../music/melodyBassArrangementPolicy');

const PARTIAL_GUITAR_ARRANGEMENT_VERSION = '1.1.0';
const PARTIAL_GUITAR_ARRANGEMENT_POLICY = 'MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0';
```

Delete `selectOuterRegisterNotes()`, `selectMonophonicMelodyNotes()`, and the local `[3, 2, 1]` constant after all callers use the new module. Pass `selection.selectedSourceEventIds` into the unchanged reduced-source/canonical-v2 path.

- [ ] **Step 5: Record bounded retry evidence and policy reasons**

Maintain a local `attempts` array. Append `REJECTED` only for the existing allow-listed recoverable physical errors; append one final `SELECTED` record on success. Never catch processing stop errors. Pass `selection.reasonBySourceEventId` and the frozen attempts into `buildArtifact()`.

For a retained note, use `OCTAVE_NEAREST_IN_REGISTER` when displacement is non-zero; otherwise use the policy retention reason. For unassigned source notes, use the policy reduction reason. Keep representation omissions and grace-note reasons unchanged.

- [ ] **Step 6: Run focused and physical-pipeline tests**

Run: `node --test tests/partialGuitarArrangementRuntime.test.js tests/canonicalTabResultV2.test.js tests/physicalPlayabilityValidatorV2.test.js tests/deterministicPolyphonicFinalSelector.test.js tests/polyCapoVoicingConfigurationPlumbing.test.js tests/customTuningUploadRuntime.test.js`

Expected: all tests PASS; no physical selector snapshot changes outside the provisional recovery path.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/app/partialGuitarArrangement.js tests/partialGuitarArrangementRuntime.test.js
git commit -m "feat(R9): maximize playable provisional piano texture"
```

### Task 3: Version-aware validation and R8 edit replay

**Files:**
- Modify: `src/app/reviewRequiredCapabilityContract.js:5-390`
- Modify: `tests/reviewRequiredCapabilityContract.test.js`
- Modify: `tests/r8OmittedNoteAssignment.test.js`
- Modify: `tests/runtimeHttpHostPolyV2Authority.test.js`

**Interfaces:**
- Consumes: provisional artifacts `1.0.0` and `1.1.0`.
- Produces: unchanged capability contract unless an additive schema field is actually exposed; `generateTab`, `APPROXIMATE` playback, and R8 assignment remain evidence-driven.

- [ ] **Step 1: Add red validator tests for historical and new artifacts**

Build results through production runtime, then clone and mutate only the artifact under test:

```js
test('admits exact R9 artifact and rejects unknown versions', () => {
  const result = processMusicXmlUpload(densePianoRequest());
  assert.equal(result.capabilities.generateTab, true);
  const hostile = cloneResult(result);
  hostile.arrangementArtifact.contractVersion = '1.2.0';
  assert.equal(decorateUploadResultWithCapabilities(hostile).capabilities.generateTab, false);
});

test('keeps an exact historical 1.0 artifact readable', () => {
  const historical = historicalPartialArrangementV1Fixture();
  assert.equal(decorateUploadResultWithCapabilities(historical).capabilities.generateTab, true);
});
```

Add hostile tests for missing attempts, duplicate caps, ascending/out-of-range caps, `SELECTED` before the last record, unknown reason codes, inconsistent counts, and a renderer hash mismatch.

- [ ] **Step 2: Run validator tests and verify red state**

Run: `node --test tests/reviewRequiredCapabilityContract.test.js`

Expected: FAIL because validation currently admits only `1.0.0` and knows no R9 attempt/reason invariants.

- [ ] **Step 3: Implement explicit version dispatch**

Refactor the validator into focused private functions:

```js
function validPartialArrangementArtifact(result) {
  const artifact = result?.arrangementArtifact;
  const validator = Object.freeze({
    '1.0.0': validPartialArrangementArtifactV1,
    '1.1.0': validPartialArrangementArtifactV11,
  })[artifact?.contractVersion];
  return Boolean(validator && validator(artifact, result, result?.musicXml));
}
```

Move the current validator body unchanged into `validPartialArrangementArtifactV1()`. Implement `validPartialArrangementArtifactV11()` with the current count/hash/position checks plus the exact policy, reason allow-list, descending unique cap sequence, one final `SELECTED`, null error on success, and bounded string error code on rejection. Do not relax the historical validator.

- [ ] **Step 4: Update R8 tests to use reason-independent backend eligibility**

Replace the old exact `BOUNDED_GUITAR_REDUCTION` assertion with the new expected reason for that source event. Preserve tests proving:

```js
assert.equal(candidate.assignmentEligible, true);
assert.equal(result.revision.appliedEdits[0].commandType,
  'ASSIGN_OMITTED_POLYPHONIC_SOURCE_EVENT_POSITION');
assert.deepEqual(assigned.selectedPosition, requestedPosition);
```

Add a forced-assignment competition fixture where six ordinary notes plus the teacher-assigned note reach the policy. Assert the forced note remains assigned and all prior positions remain byte-for-byte equal, or the existing explicit `POSITION_OVERRIDE_NOT_PLAYABLE`/`POSITION_OVERRIDE_NOT_RETAINED` error is returned.

- [ ] **Step 5: Run edit, capability, and HTTP authority tests**

Run: `node --test tests/reviewRequiredCapabilityContract.test.js tests/r8OmittedNoteAssignment.test.js tests/musicXmlPolyphonicNoteEditRuntimeV2.test.js tests/runtimeHttpHostPolyV2Authority.test.js`

Expected: all tests PASS; `MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION` remains `1.5.0` and `REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION` remains `1.3.0` because R9 adds no top-level capability field.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/app/reviewRequiredCapabilityContract.js tests/reviewRequiredCapabilityContract.test.js tests/r8OmittedNoteAssignment.test.js tests/runtimeHttpHostPolyV2Authority.test.js
git commit -m "feat(R9): validate arrangement v1.1 and preserve R8 edits"
```

### Task 4: Same-page arrangement decision labels

**Files:**
- Modify: `web/guitar-tab-workbench/workbench.js:220-370,760-850`
- Modify: `tests/guitarTabWorkbenchStaticContract.test.js`
- Modify: `tests/compatibility/alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs`

**Interfaces:**
- Consumes: backend-authored `reasonCode`; browser never calculates arrangement eligibility or reason.
- Produces: `arrangementReasonLabel(reasonCode)` with concise labels and a safe generic fallback.

- [ ] **Step 1: Add red static tests for exact reason-code mapping**

Require the browser script source to contain every R9 machine value and the fallback label. Assert the existing `assignmentEligible` and `ASSIGN_OMITTED` wiring remains present.

```js
for (const reason of [
  'MELODY_ANCHOR_RETAINED',
  'BASS_ANCHOR_RETAINED',
  'INNER_VOICE_RETAINED',
  'TEACHER_ASSIGNMENT_RETAINED',
  'GUITAR_CAPACITY_REDUCTION',
  'DUPLICATE_TARGET_PITCH_REDUCTION',
]) assert.match(script, new RegExp(reason));
assert.match(script, /Review decision/);
```

- [ ] **Step 2: Run the static test and verify red state**

Run: `node --test tests/guitarTabWorkbenchStaticContract.test.js`

Expected: FAIL because the Workbench has no R9 reason-label mapping.

- [ ] **Step 3: Add a presentation-only mapping and render it in the existing panel**

```js
const ARRANGEMENT_REASON_LABELS = Object.freeze({
  MELODY_ANCHOR_RETAINED: 'Melody retained',
  BASS_ANCHOR_RETAINED: 'Bass retained',
  INNER_VOICE_RETAINED: 'Inner voice retained',
  TEACHER_ASSIGNMENT_RETAINED: 'Teacher position retained',
  GUITAR_CAPACITY_REDUCTION: 'Reduced for playable guitar texture',
  DUPLICATE_TARGET_PITCH_REDUCTION: 'Duplicate pitch left for review',
});

function arrangementReasonLabel(reasonCode) {
  return ARRANGEMENT_REASON_LABELS[reasonCode] || 'Review decision';
}
```

Show the label next to the selected/unassigned source note. Never use label text to authorize a command.

- [ ] **Step 4: Extend the real browser smoke test**

Upload the dense piano fixture, wait for provisional TAB, select an eligible unassigned note, and assert:

```js
assert.equal(browserState.runtimeResult.status, 'REVIEW_REQUIRED');
assert.equal(browserState.runtimeResult.capabilities.generateTab, true);
const label = await page.$eval(
  '[data-testid="arrangement-reason"]',
  (element) => element.textContent,
);
assert.match(label, /guitar texture|review/i);
```

Use the existing DOM element if the panel already has a status target; add only the smallest `data-testid` needed for stable browser verification.

- [ ] **Step 5: Run static and browser-compatible tests**

Run: `node --test tests/guitarTabWorkbenchStaticContract.test.js`

Then, when pinned alphaTab/Puppeteer dependencies are present:

`node tests/compatibility/alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs`

Expected: both PASS; visible TAB and R8 controls remain on the same page.

- [ ] **Step 6: Commit Task 4**

```bash
git add web/guitar-tab-workbench/workbench.js tests/guitarTabWorkbenchStaticContract.test.js tests/compatibility/alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs
git commit -m "feat(R9): explain provisional arrangement decisions"
```

### Task 5: Real-corpus measurement and architecture convergence

**Files:**
- Modify: `scripts/stage09-additional-real-corpus-audit.js`
- Modify: `tests/stage09AdditionalRealCorpusAudit.test.js`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/current-status.md`
- Create: `docs/r9-melody-bass-piano-arrangement.md`
- Modify: `docs/package-status.md`

**Interfaces:**
- Consumes: exact Stage 09 pinned AnimeTAB corpus at commit `18c0993cbe0a0948cbf0b7768bcb09ff81c23a9a`.
- Produces: deterministic before/after counts and documentation that matches executable contract versions.

- [ ] **Step 1: Run the audit contract tests before changing audit code**

Run: `node --test tests/stage09AdditionalRealCorpusAudit.test.js tests/architectureDocumentationConsistency.test.js`

Expected: Stage 09 tests PASS before measurement; documentation consistency may fail after runtime version changes until this task updates docs.

- [ ] **Step 2: Extend the audit with exact R9 artifact identity**

Bump `AUDIT_CONTRACT_VERSION` from `1.2.0` to `1.3.0`. Add these three fields to each usable-output record without changing existing count meanings:

```js
tabArtifactDocumentType: tabArtifact?.documentType || null,
tabArtifactVersion: tabArtifact?.contractVersion || null,
tabArrangementPolicy: result?.arrangementArtifact?.policy || null,
```

Pin them in the audit test:

```js
assert.equal(report.contractVersion, '1.3.0');
assert.equal(record.tabArtifactDocumentType, 'PartialGuitarTabArrangement');
assert.equal(record.tabArtifactVersion, '1.1.0');
assert.equal(record.tabArrangementPolicy, 'MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0');
assert.ok(Number.isSafeInteger(record.tabAssignedNoteCount));
assert.ok(Number.isSafeInteger(record.tabUnassignedNoteCount));
```

Run: `node --test tests/stage09AdditionalRealCorpusAudit.test.js`

Expected: PASS.

- [ ] **Step 3: Execute the pinned corpus twice and compare exact output**

```bash
node scripts/stage09-additional-real-corpus-audit.js \
  /tmp/stage09-animetab/AnimeTAB/Clips/Originals \
  /tmp/r9-stage09-a.json
node scripts/stage09-additional-real-corpus-audit.js \
  /tmp/stage09-animetab/AnimeTAB/Clips/Originals \
  /tmp/r9-stage09-b.json
cmp /tmp/r9-stage09-a.json /tmp/r9-stage09-b.json
```

Expected: `cmp` exits `0`; assigned-note coverage is greater than or equal to the R8 baseline for every eligible file; no previously usable file becomes `BLOCKED`.

- [ ] **Step 4: Update active architecture and status documents with measured facts**

Replace active `1.0.0`/sparse-three-note wording with `1.1.0` and the six-to-one policy. Copy assigned/unassigned/blocked totals directly from `/tmp/r9-stage09-a.json`. State separately:

- what R9 proves;
- which MusicXML classes remain unsupported;
- that review output is not canonical export authority;
- that arpeggiation, timing rewrite, and AI ranking remain future work.

Add `docs/r9-melody-bass-piano-arrangement.md` containing branch/head SHA, artifact/policy versions, local commands and results, corpus commit, exact metrics, and later protected-CI run URLs/statuses.

- [ ] **Step 5: Run documentation consistency and corpus unit tests**

Run: `node --test tests/architectureDocumentationConsistency.test.js tests/stage09AdditionalRealCorpusAudit.test.js tests/stage09RealCorpusProductGate.test.js`

Expected: all tests PASS and no active document claims the runtime still starts at cap three.

- [ ] **Step 6: Commit Task 5**

```bash
git add scripts/stage09-additional-real-corpus-audit.js tests/stage09AdditionalRealCorpusAudit.test.js docs/ARCHITECTURE.md docs/current-status.md docs/package-status.md docs/r9-melody-bass-piano-arrangement.md
git commit -m "docs(R9): record melody-bass arrangement evidence"
```

### Task 6: Full regression, exact-head CI, and merge evidence

**Files:**
- Modify after CI: `docs/r9-melody-bass-piano-arrangement.md`

**Interfaces:**
- Consumes: Tasks 1–5 candidate branch.
- Produces: a clean, reviewed branch with local and protected-CI evidence suitable for merge.

- [ ] **Step 1: Run the complete local suite**

Run: `npm test`

Expected: all tests PASS with zero skipped failures introduced by R9.

- [ ] **Step 2: Run compatibility/browser checks available locally**

```bash
node tests/compatibility/alphaTabMusicXmlSmoke.mjs
node tests/compatibility/alphaTabV2MusicXmlSmoke.mjs
node tests/compatibility/alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs
node tests/compatibility/alphaTabRuntimeHostPolyV2E2e.mjs
```

Expected: all invoked checks PASS. If a required external browser binary is unavailable, record that as unverified locally and rely on the protected GitHub workflow; do not claim local success.

- [ ] **Step 3: Verify repository scope and deterministic diff**

```bash
git status --short
git diff origin/main...HEAD --check
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: only R9 source/tests/docs are changed; no generated dependency, corpus, credential, notebook, or unrelated file is present.

- [ ] **Step 4: Push the R9 branch and open a pull request**

```bash
git push -u origin HEAD
gh pr create --base main --title "R9: maximize reviewable piano-to-guitar TAB" --body-file /tmp/r9-pr-body.md
```

The PR body must list contract changes, tests, exact local counts, corpus comparison, authority limitations, and rollback (revert the R9 commits; no data migration).

- [ ] **Step 5: Require exact-head protected checks**

```bash
gh pr checks --watch
```

Required outcomes:

- Tests: success on Node.js 18, 20, and 22;
- MusicXML Compatibility: success;
- alphaTab browser renderer/Workbench: success;
- Runtime Staging E2E: success;
- Stage 09 Real Corpus Audit: success.

- [ ] **Step 6: Record CI evidence and commit the closure update**

Add the exact PR number, head SHA, workflow run URLs, job conclusions, test count, and Stage 09 artifact metrics to `docs/r9-melody-bass-piano-arrangement.md`.

```bash
git add docs/r9-melody-bass-piano-arrangement.md
git commit -m "docs(R9): record protected CI evidence"
git push
gh pr checks --watch
```

Expected: checks rerun against the documentation commit and all required jobs succeed at that exact head.

- [ ] **Step 7: Review and merge only the verified exact head**

Confirm `gh pr view --json headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup` identifies the tested head. Merge using the repository's allowed method, then verify `origin/main` contains the R9 tree and run the post-merge Tests workflow.

Do not claim R9 complete if any required check is missing, pending, cancelled, neutral where success is required, or attached to an older SHA.
