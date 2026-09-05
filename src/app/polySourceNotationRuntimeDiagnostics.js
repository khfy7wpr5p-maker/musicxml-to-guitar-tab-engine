'use strict';

const collectorStack = [];

function collectSourceNotationRuntimeIssues(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function.');
  }
  const issues = [];
  collectorStack.push(issues);
  try {
    return Object.freeze({
      result: callback(),
      issues: Object.freeze([...issues]),
    });
  } finally {
    const popped = collectorStack.pop();
    if (popped !== issues) {
      collectorStack.length = 0;
      throw new Error('Source notation diagnostic collector stack became inconsistent.');
    }
  }
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
