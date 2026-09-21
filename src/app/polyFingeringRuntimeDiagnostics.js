'use strict';

const collectorStack = [];

function currentCollector() {
  return collectorStack[collectorStack.length - 1] || null;
}

function executeCollectorCallback(callback) {
  try {
    return Object.freeze({ kind: 'result', value: callback() });
  } catch (error) {
    return Object.freeze({ kind: 'error', value: error });
  }
}

function collectFingeringRuntimeIssues(callback) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function.');
  const collector = {
    issues: [],
    exactFingeringConstraints: null,
  };
  collectorStack.push(collector);

  const execution = executeCollectorCallback(callback);
  const popped = collectorStack.pop();
  if (popped !== collector) {
    collectorStack.length = 0;
    throw new Error('Fingering runtime collector stack became inconsistent.');
  }
  if (execution.kind === 'error') throw execution.value;

  return Object.freeze({
    result: execution.value,
    issues: Object.freeze([...collector.issues]),
    exactFingeringConstraints: collector.exactFingeringConstraints,
  });
}

function recordFingeringRuntimeIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return;
  const collector = currentCollector();
  if (!collector) return;
  collector.issues.push(...issues);
}

function recordExactGuitarFingeringConstraints(constraints) {
  const collector = currentCollector();
  if (!collector || constraints === null || constraints === undefined) return;
  if (
    !constraints
    || constraints.documentType !== 'ExactGuitarFingeringConstraints'
    || constraints.contractVersion !== '1.0.0'
    || constraints.authority !== 'EXPLICIT_SOURCE_GUITAR_FINGERING_ONLY'
    || !Number.isSafeInteger(constraints.constraintCount)
    || constraints.constraintCount < 0
    || !Object.isFrozen(constraints)
  ) {
    throw new TypeError('constraints must be an immutable ExactGuitarFingeringConstraints 1.0.0 value.');
  }
  if (collector.exactFingeringConstraints !== null) {
    throw new Error('Exact guitar fingering constraints were recorded more than once in one runtime pass.');
  }
  collector.exactFingeringConstraints = constraints;
}

function currentExactGuitarFingeringConstraints() {
  return currentCollector()?.exactFingeringConstraints || null;
}

module.exports = {
  collectFingeringRuntimeIssues,
  recordFingeringRuntimeIssues,
  recordExactGuitarFingeringConstraints,
  currentExactGuitarFingeringConstraints,
};