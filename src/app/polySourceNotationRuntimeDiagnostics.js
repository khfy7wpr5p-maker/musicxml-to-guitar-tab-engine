'use strict';

const collectorStack = [];

function invokeCollectorCallback(callback) {
  try {
    return { failed: false, value: callback() };
  } catch (error) {
    return { failed: true, error };
  }
}

function collectSourceNotationRuntimeIssues(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function.');
  }

  const issues = [];
  collectorStack.push(issues);
  const outcome = invokeCollectorCallback(callback);
  const popped = collectorStack.pop();

  if (popped !== issues) {
    collectorStack.length = 0;
    throw new Error('Source notation diagnostic collector stack became inconsistent.');
  }
  if (outcome.failed) throw outcome.error;

  return Object.freeze({
    result: outcome.value,
    issues: Object.freeze([...issues]),
  });
}

function recordSourceNotationRuntimeIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return;
  const collector = collectorStack[collectorStack.length - 1];
  if (!collector) return;
  collector.push(...issues);
}

module.exports = {
  collectSourceNotationRuntimeIssues,
  recordSourceNotationRuntimeIssues,
};
