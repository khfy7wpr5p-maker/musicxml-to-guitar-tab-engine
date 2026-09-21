'use strict';

const collectorStack = [];

function collectSourceNotationRuntimeIssues(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function.');
  }
  const issues = [];
  collectorStack.push(issues);

  let result;
  let callbackFailed = false;
  let callbackError;
  try {
    result = callback();
  } catch (error) {
    callbackFailed = true;
    callbackError = error;
  }

  const popped = collectorStack.pop();
  if (popped !== issues) {
    collectorStack.length = 0;
    throw new Error('Source notation diagnostic collector stack became inconsistent.');
  }
  if (callbackFailed) {
    throw callbackError;
  }

  return Object.freeze({
    result,
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
