'use strict';

const path = require('node:path');
const { createRuntimeHttpServer } = require('../src/app/runtimeHttpHost');

function parsePort(value) {
  const port = Number(value ?? 4173);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  return port;
}

function resolveAlphaTab() {
  let entry;
  try {
    entry = require.resolve('@coderline/alphatab');
  } catch {
    throw new Error(
      'Pinned alphaTab runtime assets are required. Install @coderline/alphatab@1.8.4 without changing the lockfile before starting the runtime host.',
    );
  }
  const packageRoot = path.resolve(path.dirname(entry), '..');
  const packageJson = require(path.join(packageRoot, 'package.json'));
  if (packageJson.version !== '1.8.4') {
    throw new Error(`Runtime host requires @coderline/alphatab 1.8.4; found ${packageJson.version}.`);
  }
  return { entry, dist: path.dirname(entry) };
}

const host = String(process.env.HOST || '127.0.0.1');
const port = parsePort(process.env.PORT);
const alphaTab = resolveAlphaTab();
const server = createRuntimeHttpServer({
  repositoryRoot: path.resolve(__dirname, '..'),
  alphaTabEntry: alphaTab.entry,
  alphaTabDist: alphaTab.dist,
});

function shutdown(signal) {
  server.close((error) => {
    if (error) {
      process.stderr.write(`${signal} shutdown failed: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  });
}

server.once('error', (error) => {
  process.stderr.write(`Runtime host failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  process.stdout.write(`Guitar TAB runtime host listening on http://${host}:${port}/workbench/\n`);
});
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
