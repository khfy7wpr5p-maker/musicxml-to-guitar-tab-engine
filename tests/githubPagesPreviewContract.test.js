'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/github-pages-preview.yml'), 'utf8');
const buildScript = fs.readFileSync(path.join(root, 'scripts/build-github-pages-preview.js'), 'utf8');
const sourceConfig = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/preview-config.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/index.html'), 'utf8');

test('GitHub Pages workflow builds a pinned, static preview only after main changes', () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions:\s*read/);

  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(workflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(workflow, /actions\/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9/);
  assert.match(workflow, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/);

  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /@coderline\/alphatab@1\.8\.4/);
  assert.match(workflow, /--no-save --package-lock=false --ignore-scripts/);
  assert.match(workflow, /node scripts\/build-github-pages-preview\.js/);
  assert.match(workflow, /path:\s*_site/);
  assert.match(workflow, /environment:\s*\n\s*name:\s*github-pages/);
});

test('Pages builder produces a bounded CI-generated PASS result without browser engine imports', () => {
  assert.match(buildScript, /processMusicXmlUpload/);
  assert.match(buildScript, /tests\/fixtures\/parser-single-voice\.musicxml/);
  assert.match(buildScript, /result\.status, 'PASS'/);
  assert.match(buildScript, /result\.route, 'MONO_V1'/);
  assert.match(buildScript, /4 \* 1024 \* 1024/);
  assert.match(buildScript, /expectedAlphaTabVersion = '1\.8\.4'/);
  assert.match(buildScript, /fs\.cpSync\(alphaTab\.distRoot, assetsOut/);
  assert.match(buildScript, /fs\.copyFileSync\(alphaTab\.entry, path\.join\(assetsOut, 'alphatab\.js'\)\)/);
  assert.match(buildScript, /third-party\/alphatab/);
  assert.match(buildScript, /alphaTab\.licensePath/);
  assert.match(buildScript, /mode: 'preview'/);
  assert.match(buildScript, /playerMode: 'external-media'/);
  assert.match(buildScript, /StaticBrowserBoundary|assertStaticBrowserBoundary/);
  assert.match(buildScript, /\.nojekyll/);

  assert.match(sourceConfig, /mode:\s*'runtime'/);
  assert.match(sourceConfig, /apiBaseUrl:\s*'\/api'/);
  assert.match(indexHtml, /\.\.\/assets\/alphatab\.js/);
  assert.doesNotMatch(indexHtml, /<script[^>]+https?:\/\//i);
});
