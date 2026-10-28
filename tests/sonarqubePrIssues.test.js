'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const script = path.resolve(__dirname, '../scripts/sonarqube-pr-issues.js');
const token = 'test-only-sonar-token-never-print';

async function sonarResponse(t, status, body) {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization });
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    requests,
    fetchImpl(url, options) {
      const target = new URL(url);
      assert.equal(target.origin, 'https://sonarcloud.io');
      return fetch(`${origin}${target.pathname}${target.search}`, options);
    },
  };
}

test('Sonar configuration check fails clearly for a missing secret without printing values', () => {
  const result = spawnSync(process.execPath, [script, '--check-config'], {
    encoding: 'utf8',
    env: { ...process.env, SONAR_TOKEN: '', SONAR_PROJECT_KEY: 'test-project', SONAR_ORGANIZATION: 'test-org' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing.*SONAR_TOKEN/i);
  assert.doesNotMatch(result.stderr, /SyntaxError|Unexpected end of JSON|test-project|test-org/);
});

test('Sonar configuration check accepts present settings without exposing the secret', () => {
  const result = spawnSync(process.execPath, [script, '--check-config'], {
    encoding: 'utf8',
    env: { ...process.env, SONAR_TOKEN: token, SONAR_PROJECT_KEY: 'test-project', SONAR_ORGANIZATION: 'test-org' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /configuration.*present/i);
  assert.equal(result.stderr, '');
  assert.equal(`${result.stdout}${result.stderr}`.includes(token), false);
});

test('Sonar issue CLI validates the PR without requiring the scanner-only organization setting', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, SONAR_TOKEN: token, SONAR_PROJECT_KEY: 'test-project', SONAR_ORGANIZATION: '', PR_NUMBER: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /positive PR_NUMBER/);
  assert.equal(result.stderr.includes(token), false);
});

for (const status of [401, 403]) {
  test(`Sonar HTTP ${status} retains the access failure without parsing or printing the response`, async (t) => {
    const server = await sonarResponse(t, status, `access denied: ${token}`);
    const { fetchSonarPrIssues } = require(script);
    await assert.rejects(
      fetchSonarPrIssues({ token, projectKey: 'test-project', pullRequest: '379' }, server.fetchImpl),
      (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.match(error.message, /SONAR_TOKEN|permission/i);
        assert.doesNotMatch(error.message, /SyntaxError|Unexpected end of JSON|access denied:/);
        assert.equal(error.message.includes(token), false);
        return true;
      },
    );
    assert.equal(server.requests.length, 1);
  });
}

test('Sonar issue diagnostics preserve the project/PR query and output only issue fields', async (t) => {
  const server = await sonarResponse(t, 200, JSON.stringify({
    issues: [{ key: 'issue-1', rule: 'javascript:S123', severity: 'MAJOR', type: 'BUG',
      component: 'project:web/workbench.js', message: 'Review this branch.', hidden: token }],
  }));
  const { fetchSonarPrIssues } = require(script);
  const issues = await fetchSonarPrIssues({ token, projectKey: 'project:space & more', pullRequest: '379' }, server.fetchImpl);
  assert.deepEqual(issues, [{ key: 'issue-1', rule: 'javascript:S123', severity: 'MAJOR', type: 'BUG',
    component: 'project:web/workbench.js', line: null, message: 'Review this branch.', impacts: [], cleanCodeAttribute: null }]);
  const request = server.requests[0];
  const url = new URL(request.url, 'https://sonarcloud.io');
  assert.equal(url.pathname, '/api/issues/search');
  assert.equal(url.searchParams.get('componentKeys'), 'project:space & more');
  assert.equal(url.searchParams.get('pullRequest'), '379');
  assert.equal(url.searchParams.get('issueStatuses'), 'OPEN,CONFIRMED');
  assert.equal(url.searchParams.get('sinceLeakPeriod'), 'true');
  assert.equal(url.searchParams.get('ps'), '100');
  assert.equal(request.authorization, `Bearer ${token}`);
  assert.equal(request.url.includes(token), false);
  assert.equal(JSON.stringify(issues).includes(token), false);
});

test('Sonar issue diagnostics accept a genuinely empty issue list', async (t) => {
  const server = await sonarResponse(t, 200, '{"issues":[]}');
  const { fetchSonarPrIssues } = require(script);
  assert.deepEqual(await fetchSonarPrIssues({ token, projectKey: 'test-project', pullRequest: 379 }, server.fetchImpl), []);
});

for (const body of ['', '{"issues":null}', '{"issues":[null]}']) {
  test(`Sonar malformed response fails explicitly instead of implying zero issues (${JSON.stringify(body)})`, async (t) => {
    const server = await sonarResponse(t, 200, body);
    const { fetchSonarPrIssues } = require(script);
    await assert.rejects(
      fetchSonarPrIssues({ token, projectKey: 'test-project', pullRequest: 379 }, server.fetchImpl),
      /SonarQube.*(?:JSON|issue.*response)/i,
    );
  });
}
