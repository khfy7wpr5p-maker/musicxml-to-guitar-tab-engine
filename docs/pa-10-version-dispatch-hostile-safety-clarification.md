# PA-10.5 Hostile-Safety Clarification

This file is a normative companion to `pa-10-version-dispatch-fail-closed-contract.md`.

The PA-10.5 dispatcher contract does **not** permit any Proxy value to pass pre-dispatch hostile-data inspection.

Normative rules:

- every Proxy encountered in the canonical input graph MUST fail closed;
- a future implementation MUST use a runtime mechanism capable of identifying Proxy values before performing reflective traversal that could invoke Proxy traps;
- if the supported runtime cannot provide that safety property, runtime canonical dispatch MUST NOT be enabled for that environment;
- the phrase "where detectable by the approved runtime mechanism" in the main PA-10.5 document is an implementation constraint, not permission to accept an undetected Proxy;
- accessors, non-plain objects, cycles, sparse/custom arrays, symbol/non-enumerable semantic properties, unsafe numeric values, and graph-limit violations remain fail-closed as defined by the main contract;
- hostile-safety failure occurs before version-specific validator routing and therefore invokes zero version validators;
- this clarification does not change the current v1 validator, add a runtime dispatcher, create a v2 validator, or authorize PA-11+ work.

A future runtime dispatch implementation is acceptable only if its hostile-data preflight is at least as strict as PA-10.2 and this clarification.

Merge remains separately gated.
