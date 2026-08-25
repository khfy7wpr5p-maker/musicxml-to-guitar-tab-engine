'use strict';

const path = require('node:path');
const { createRuntimeHttpServer } = require('../src/app/runtimeHttpHost');

function resolveAlphaTab() {
  const entry = require.resolve('@coderline/alphatab');
  const packageRoot = path.resolve(path.dirname(entry), '..');
  const packageJson = require(path.join(packageRoot, 'package.json'));
  if (packageJson.version !== '1.8.4') {
    throw new Error(`Vercel staging runtime requires @coderline/alphatab 1.8.4; found ${packageJson.version}.`);
  }
  return { entry, dist: path.dirname(entry) };
}

const alphaTab = resolveAlphaTab();

module.exports = createRuntimeHttpServer({
  repositoryRoot: path.resolve(__dirname, '..'),
  alphaTabEntry: alphaTab.entry,
  alphaTabDist: alphaTab.dist,
});
