import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const siteRoot = path.join(repositoryRoot, '_site');
const browserExecutable = process.env.BROWSER_EXECUTABLE;
const screenshotPath = process.env.ALPHATAB_PAGES_PREVIEW_SCREENSHOT_PATH
  || path.resolve(repositoryRoot, 'alphatab-pages-preview.png');

assert.ok(browserExecutable && fs.existsSync(browserExecutable));
assert.ok(fs.existsSync(path.join(siteRoot, 'workbench/index.html')), 'Build the Pages preview before running this smoke test.');

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.sf2') return 'audio/sf2';
  if (extension === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function resolveStaticPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = decoded.replace(/^\/+/, '');
  let candidate = path.resolve(siteRoot, relative || 'index.html');
  if (candidate !== siteRoot && !candidate.startsWith(`${siteRoot}${path.sep}`)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return candidate;
}

const requestedPaths = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  requestedPaths.push(url.pathname);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentType(filePath),
    'content-length': fs.statSync(filePath).size,
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(response);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: browserExecutable,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));
  page.on('console', (entry) => {
    if (entry.type() === 'error') pageErrors.push(`console: ${entry.text()}`);
  });

  await page.setViewport({width: 1440, height: 1000, deviceScaleFactor: 1});
  await page.goto(`${origin}/workbench/`, {waitUntil: 'networkidle0'});
  await page.waitForFunction(() => {
    const host = window.__workbenchHost;
    return Boolean(host && host.mode === 'preview' && host.workbench.snapshot().scoreLoaded);
  }, {timeout: 20000});

  const evidence = await page.evaluate(() => {
    const root = document.querySelector('[data-guitar-tab-workbench]');
    const host = window.__workbenchHost;
    const snapshot = host.workbench.snapshot();
    return {
      mode: host.mode,
      rootMode: root?.dataset.mode || null,
      modeBadge: root?.querySelector('[data-role="mode-badge"]')?.textContent || null,
      documentStatus: root?.querySelector('[data-role="document-status"]')?.textContent || null,
      routeStatus: root?.querySelector('[data-role="route-status"]')?.textContent || null,
      runtimeUploadHidden: root?.querySelector('[data-role="runtime-upload-action"]')?.hidden ?? null,
      demoButtonHidden: root?.querySelector('[data-role="load-demo"]')?.hidden ?? null,
      previewNoticeHidden: root?.querySelector('[data-role="preview-notice"]')?.hidden ?? null,
      scoreTracks: snapshot.scoreTracks,
      scoreStaves: snapshot.scoreStaves,
      scoreMeasures: snapshot.scoreMeasures,
      scoreHidden: snapshot.scoreHidden,
      applyEditDisabled: snapshot.applyEditDisabled,
      svgCount: root?.querySelectorAll('[data-role="score"] svg').length || 0,
      controllerNames: Object.keys(host.controllers || {}).sort(),
      previewText: root?.querySelector('[data-role="mode-description"]')?.textContent || null,
    };
  });

  assert.equal(evidence.mode, 'preview');
  assert.equal(evidence.rootMode, 'preview');
  assert.equal(evidence.modeBadge.trim(), 'PREVIEW');
  assert.equal(evidence.documentStatus.trim(), 'PASS');
  assert.equal(evidence.routeStatus.trim(), 'MONO_V1');
  assert.equal(evidence.runtimeUploadHidden, true);
  assert.equal(evidence.demoButtonHidden, false);
  assert.equal(evidence.previewNoticeHidden, false);
  assert.equal(evidence.scoreTracks, 1);
  assert.equal(evidence.scoreStaves, 2);
  assert.ok(evidence.scoreMeasures > 0);
  assert.equal(evidence.scoreHidden, false);
  assert.equal(evidence.applyEditDisabled, true);
  assert.ok(evidence.svgCount > 0);
  assert.deepEqual(evidence.controllerNames, ['document', 'issues', 'playback', 'selection']);
  assert.match(evidence.previewText, /Static CI demo/);
  assert.equal(requestedPaths.some((pathname) => pathname.startsWith('/api/')), false);
  assert.deepEqual(pageErrors, []);

  await page.screenshot({path: screenshotPath, fullPage: true});
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    mode: evidence.mode,
    route: evidence.routeStatus,
    scoreTracks: evidence.scoreTracks,
    scoreStaves: evidence.scoreStaves,
    scoreMeasures: evidence.scoreMeasures,
    apiRequests: requestedPaths.filter((pathname) => pathname.startsWith('/api/')).length,
    screenshotPath,
  })}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
