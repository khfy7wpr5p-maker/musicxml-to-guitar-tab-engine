'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');

const repositoryRoot = path.resolve(__dirname, '..');
const siteRoot = path.resolve(repositoryRoot, process.env.PAGES_SITE_DIR || '_site');
const workbenchSourceRoot = path.join(repositoryRoot, 'web/guitar-tab-workbench');
const fixturePath = path.join(repositoryRoot, 'tests/fixtures/parser-single-voice.musicxml');
const expectedAlphaTabVersion = '1.8.4';
const maxPreviewJsonBytes = 4 * 1024 * 1024;

function ensureInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Path escapes ${parent}.`);
}

function writeUtf8(filePath, content) {
  ensureInside(siteRoot, filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function findLicense(packageRoot) {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    const candidate = path.join(packageRoot, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function assertStaticBrowserBoundary(workbenchRoot) {
  const files = fs.readdirSync(workbenchRoot)
    .filter((name) => name.endsWith('.js') || name.endsWith('.html'));
  for (const name of files) {
    const text = fs.readFileSync(path.join(workbenchRoot, name), 'utf8');
    assert(!/https?:\/\//i.test(text), `${name} contains a remote dependency URL.`);
    assert(!/src\/(?:app|core|learning)|CanonicalTabResult|require\s*\(|module\.exports/.test(text), `${name} imports engine internals.`);
    assert(!/innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/i.test(text), `${name} contains an unsafe browser injection primitive.`);
    assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(text), `${name} introduces browser persistence.`);
  }
}

function buildPreviewResult() {
  const sourceBytes = fs.readFileSync(fixturePath);
  const result = processMusicXmlUpload({
    fileName: 'guitar-tab-preview.musicxml',
    bytes: sourceBytes,
  });
  assert.equal(result.status, 'PASS', 'GitHub Pages preview fixture must convert successfully.');
  assert.equal(result.route, 'MONO_V1', 'GitHub Pages preview fixture must stay on the public deterministic monophonic route.');
  assert.equal(typeof result.musicXml, 'string');
  assert.ok(result.musicXml.length > 0);
  assert.match(result.input.sha256, /^[0-9a-f]{64}$/);
  return result;
}

function locateAlphaTab() {
  const entry = require.resolve('@coderline/alphatab');
  const distRoot = path.dirname(entry);
  const packageRoot = path.resolve(distRoot, '..');
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.equal(packageJson.version, expectedAlphaTabVersion, 'GitHub Pages preview must use the pinned alphaTab version.');
  const licensePath = findLicense(packageRoot);
  assert.ok(licensePath, 'alphaTab license text must be available for redistribution.');
  return { entry, distRoot, packageRoot, packageJsonPath, licensePath, version: packageJson.version };
}

function previewConfigSource() {
  return `(function attachGuitarTabWorkbenchConfig(global) {\n`
    + `  'use strict';\n\n`
    + `  global.GuitarTabWorkbenchConfig = Object.freeze({\n`
    + `    mode: 'preview',\n`
    + `    apiBaseUrl: null,\n`
    + `    assetBaseUrl: '../assets/',\n`
    + `    previewResultUrl: '../preview/demo.json',\n`
    + `    autoLoadPreview: true,\n`
    + `    playerMode: 'external-media',\n`
    + `  });\n`
    + `}(window));\n`;
}

function rootLandingPage() {
  return `<!doctype html>\n`
    + `<html lang="en">\n`
    + `<head>\n`
    + `  <meta charset="utf-8">\n`
    + `  <meta name="viewport" content="width=device-width, initial-scale=1">\n`
    + `  <meta http-equiv="refresh" content="0; url=./workbench/">\n`
    + `  <title>Guitar TAB Workbench Preview</title>\n`
    + `</head>\n`
    + `<body>\n`
    + `  <p><a href="./workbench/">Open Guitar TAB Workbench preview</a></p>\n`
    + `</body>\n`
    + `</html>\n`;
}

function main() {
  fs.rmSync(siteRoot, { recursive: true, force: true });
  fs.mkdirSync(siteRoot, { recursive: true });

  const alphaTab = locateAlphaTab();
  const result = buildPreviewResult();
  const previewJson = `${JSON.stringify(result)}\n`;
  assert.ok(Buffer.byteLength(previewJson, 'utf8') <= maxPreviewJsonBytes, 'Static preview result exceeds the fixed preview JSON ceiling.');

  const workbenchOut = path.join(siteRoot, 'workbench');
  const assetsOut = path.join(siteRoot, 'assets');
  fs.cpSync(workbenchSourceRoot, workbenchOut, { recursive: true });
  fs.cpSync(alphaTab.distRoot, assetsOut, { recursive: true });
  // Preserve the Workbench's stable lowercase same-origin entry path even if the
  // upstream package entry uses a different filename/casing on Linux.
  fs.copyFileSync(alphaTab.entry, path.join(assetsOut, 'alphatab.js'));

  writeUtf8(path.join(workbenchOut, 'preview-config.js'), previewConfigSource());
  writeUtf8(path.join(siteRoot, 'preview/demo.json'), previewJson);
  writeUtf8(path.join(siteRoot, 'preview/build-manifest.json'), `${JSON.stringify({
    schema: 'guitar-tab-pages-preview-v1',
    engineCommit: process.env.GITHUB_SHA || null,
    fixture: 'tests/fixtures/parser-single-voice.musicxml',
    inputSha256: result.input.sha256,
    route: result.route,
    alphaTabVersion: alphaTab.version,
  }, null, 2)}\n`);
  writeUtf8(path.join(siteRoot, 'index.html'), rootLandingPage());
  writeUtf8(path.join(siteRoot, '.nojekyll'), '');

  const thirdPartyRoot = path.join(siteRoot, 'third-party/alphatab');
  fs.mkdirSync(thirdPartyRoot, { recursive: true });
  fs.copyFileSync(alphaTab.licensePath, path.join(thirdPartyRoot, path.basename(alphaTab.licensePath)));
  fs.copyFileSync(alphaTab.packageJsonPath, path.join(thirdPartyRoot, 'package.json'));

  assertStaticBrowserBoundary(workbenchOut);
  assert.ok(fs.existsSync(path.join(assetsOut, 'alphatab.js')), 'alphaTab browser entry was not copied.');
  assert.ok(fs.existsSync(path.join(assetsOut, 'font')), 'alphaTab font assets were not copied.');
  assert.ok(fs.existsSync(path.join(assetsOut, 'soundfont/sonivox.sf2')), 'alphaTab soundfont asset was not copied.');

  process.stdout.write(`GitHub Pages preview built at ${siteRoot}\n`);
}

main();
