'use strict';

const collectorStack = [];

function captureCallbackResult(callback) {
  try {
    return [true, callback()];
  } catch (error) {
    return [false, error];
  }
}

function collectPerformanceMetadataRuntimeIssues(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function.');
  }

  const issues = [];
  collectorStack.push(issues);
  const [completed, value] = captureCallbackResult(callback);
  const stackMatches = collectorStack.pop() === issues;

  if (!stackMatches) {
    collectorStack.length = 0;
    throw new Error('Performance metadata diagnostic collector stack became inconsistent.');
  }
  if (!completed) throw value;

  return Object.freeze({
    result: value,
    issues: Object.freeze([...issues]),
  });
}

function recordPerformanceMetadataRuntimeIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return;
  const collector = collectorStack[collectorStack.length - 1];
  if (!collector) return;
  collector.push(...issues);
}

module.exports = {
  collectPerformanceMetadataRuntimeIssues,
  recordPerformanceMetadataRuntimeIssues,
};
