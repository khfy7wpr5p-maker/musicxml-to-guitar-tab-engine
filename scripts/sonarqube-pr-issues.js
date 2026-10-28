'use strict';

function requiredText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing SonarQube CI configuration: ${name}.`);
  }
  return value.trim();
}

function readConfiguration(env) {
  return {
    token: requiredText(env.SONAR_TOKEN, 'SONAR_TOKEN'),
    projectKey: requiredText(env.SONAR_PROJECT_KEY, 'SONAR_PROJECT_KEY'),
    organization: requiredText(env.SONAR_ORGANIZATION, 'SONAR_ORGANIZATION'),
  };
}

async function fetchSonarPrIssues({ token, projectKey, pullRequest }, fetchImpl = globalThis.fetch) {
  const secret = requiredText(token, 'SONAR_TOKEN');
  const project = requiredText(projectKey, 'SONAR_PROJECT_KEY');
  const pr = String(pullRequest);
  if (!/^[1-9]\d*$/.test(pr)) throw new Error('SonarQube issue diagnostics require a positive PR_NUMBER.');

  const url = new URL('https://sonarcloud.io/api/issues/search');
  url.search = new URLSearchParams({
    componentKeys: project,
    pullRequest: pr,
    issueStatuses: 'OPEN,CONFIRMED',
    sinceLeakPeriod: 'true',
    ps: '100',
  }).toString();

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('SonarQube issue diagnostics request failed; check network access and service availability.');
  }
  if (!response.ok) {
    throw new Error(`SonarQube issue diagnostics received HTTP ${response.status}; check SONAR_TOKEN validity and project permissions.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('SonarQube issue diagnostics returned invalid JSON.');
  }
  if (!Array.isArray(payload?.issues)
    || payload.issues.some((issue) => !issue || typeof issue !== 'object' || Array.isArray(issue))) {
    throw new Error('SonarQube issue diagnostics returned an invalid issue response.');
  }
  return payload.issues.map((issue) => ({
    key: issue.key,
    rule: issue.rule,
    severity: issue.severity,
    type: issue.type,
    component: issue.component,
    line: issue.line ?? null,
    message: issue.message,
    impacts: issue.impacts ?? [],
    cleanCodeAttribute: issue.cleanCodeAttribute ?? null,
  }));
}

async function main() {
  if (process.argv[2] === '--check-config' && process.argv.length === 3) {
    readConfiguration(process.env);
    console.log('SonarQube CI configuration is present; service authentication is checked by the scanner.');
    return;
  }
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/sonarqube-pr-issues.js [--check-config]');
  const issues = await fetchSonarPrIssues({
    token: process.env.SONAR_TOKEN,
    projectKey: process.env.SONAR_PROJECT_KEY,
    pullRequest: process.env.PR_NUMBER,
  });
  for (const issue of issues) console.log(JSON.stringify(issue));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { fetchSonarPrIssues };
