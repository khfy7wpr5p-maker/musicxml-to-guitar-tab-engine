# Runtime deadline and cancellation

Milestone 2C-4 adds one internal `ProcessingRuntime 1.0.0` for cooperative runtime safety. Milestone 2C-4.1 extends the same runtime into candidate generation and dynamic-programming optimizer loops without changing the runtime contract.

## Separation from ProcessingBudget

`ProcessingBudget 1.0.0` remains the immutable static limit contract. Its fields and defaults do not change. In particular, `signal` and the injected test clock are not budget fields.

The runtime owns:

- the normalized `ProcessingBudget 1.0.0` value;
- an optional `AbortSignal` supplied through parser options;
- one monotonic start time;
- one deadline derived from `maxProcessingMilliseconds`;
- a synchronous `checkpoint(phase, location)` function.

The package-root export list is unchanged. The clock is an internal dependency-injection seam used by focused tests and is not exported from the package root.

## Stable failures

| Condition | Error code |
|---|---|
| supplied signal is aborted | `PROCESSING_ABORTED` |
| elapsed time exceeds the configured deadline | `PROCESSING_DEADLINE_EXCEEDED` |

Both failures use `XmlSafetyError`. Their details are immutable and include the stable processing phase. Deadline details use the existing limit vocabulary:

```text
{
  field: "maxProcessingMilliseconds",
  limit,
  observed,
  phase,
  ...optionalLocation
}
```

The configured boundary is inclusive. An elapsed value equal to the limit is accepted; only a greater value is blocked. A pre-aborted signal is checked before the deadline at every checkpoint.

## Checkpoint coverage

The same runtime is shared across one conversion call. Checkpoints occur at:

- input start and XML normalization;
- every SAX open-tag, text/CDATA and close-tag callback;
- MusicXML structural and semantic measure/event scans;
- semantic adapter boundaries;
- canonical-document projection boundaries;
- canonical TAB result boundaries;
- candidate-document validation and candidate generation for each measure and event;
- optimizer candidate validation, first-layer evaluation, per-layer candidate and transition evaluation, path ranking, final-state selection and result reconstruction.

Standalone preflight, direct canonical parsing and the public conversion pipeline use the same runtime model. Runtime failures are classified as `BLOCKED / safety` by public conversion. Public conversion returns `canonicalTabResult: null` and never exposes a partial result.

## Cooperative, not preemptive

The engine remains synchronous and deterministic. Milestones 2C-4 and 2C-4.1 do not add workers, timers, races, promises or forced interruption. `AbortSignal` and deadline enforcement are cooperative: work stops at the next deterministic checkpoint. Candidate generation and dynamic-programming optimizer loops now contain internal checkpoints instead of relying only on the outer canonical TAB phase boundaries. Individual synchronous helper calls are checked from their surrounding deterministic loop checkpoints rather than forcibly interrupted from another thread.

## Preserved boundaries

These milestones do not change:

- supported MusicXML features;
- XML, measure or event limits;
- canonical schemas or output fields;
- guitar configuration;
- candidate validity or cost calculation;
- deterministic optimizer tie-breaking;
- writer inputs or outputs;
- package dependencies;
- HTTP, UI, PDF, OMR, Audiveris, SesliTab or machine-learning scope.
