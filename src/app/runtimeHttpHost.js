'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { DEFAULT_MAX_XML_BYTES } = require('../validation/xmlSafety');
const { processMusicXmlUpload } = require('./musicXmlUploadRuntime');
const { processMusicXmlNoteEdit } = require('./musicXmlNoteEditRuntime');
const {
  processMusicXmlPolyphonicNoteEditV2,
} = require('./musicXmlPolyphonicNoteEditRuntimeV2');

const RUNTIME_HOST_VERSION = '1.0.0';
const MAX_EDIT_COMMAND_HEADER_BYTES = 48 * 1024;
const MAX_HEADER_BYTES = 64 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 10_000;

class RuntimeHttpHostError extends Error {
  constructor(message, statusCode = 400, code = 'RUNTIME_HOST_REQUEST_REJECTED') {
    super(message);
    this.name = 'RuntimeHttpHostError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function securityHeaders(extra = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    'cross-origin-opener-policy': 'same-origin',
    ...extra,
  };
}

function writeJson(response, statusCode, payload, extraHeaders = {}) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  response.writeHead(statusCode, securityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    ...extraHeaders,
  }));
  response.end(body);
}

function writeText(response, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  const body = Buffer.from(String(text), 'utf8');
  response.writeHead(statusCode, securityHeaders({
    'content-type': contentType,
    'content-length': body.length,
    'cache-control': 'no-store',
  }));
  response.end(body);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.sf2') return 'audio/sf2';
  if (extension === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function parseContentLength(request) {
  const raw = request.headers['content-length'];
  if (raw === undefined) return null;
  if (Array.isArray(raw) || !/^\d+$/.test(raw)) {
    throw new RuntimeHttpHostError('Invalid Content-Length header.', 400, 'INVALID_CONTENT_LENGTH');
  }
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RuntimeHttpHostError('Invalid Content-Length header.', 400, 'INVALID_CONTENT_LENGTH');
  }
  return length;
}

function requireOctetStream(request) {
  const raw = request.headers['content-type'];
  if (typeof raw !== 'string' || raw.toLowerCase().split(';', 1)[0].trim() !== 'application/octet-stream') {
    throw new RuntimeHttpHostError(
      'Runtime API requests must use application/octet-stream.',
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  }
}

function readBoundedBody(request, maxBytes = DEFAULT_MAX_XML_BYTES) {
  const declaredLength = parseContentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    request.resume();
    throw new RuntimeHttpHostError('Request body exceeds the fixed size limit.', 413, 'REQUEST_TOO_LARGE');
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let rejected = false;

    request.on('data', (chunk) => {
      if (rejected) return;
      byteLength += chunk.length;
      if (byteLength > maxBytes) {
        rejected = true;
        chunks.length = 0;
        reject(new RuntimeHttpHostError(
          'Request body exceeds the fixed size limit.',
          413,
          'REQUEST_TOO_LARGE',
        ));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks, byteLength));
    });
    request.on('aborted', () => {
      if (!rejected) reject(new RuntimeHttpHostError('Request body was aborted.', 400, 'REQUEST_ABORTED'));
    });
    request.on('error', (error) => {
      if (!rejected) reject(error);
    });
  });
}

function parseEditCommands(request) {
  const raw = request.headers['x-st-edit-commands'];
  if (typeof raw !== 'string') {
    throw new RuntimeHttpHostError(
      'Missing x-st-edit-commands header.',
      400,
      'MISSING_EDIT_COMMANDS',
    );
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_EDIT_COMMAND_HEADER_BYTES) {
    throw new RuntimeHttpHostError(
      'Edit command metadata exceeds the fixed header limit.',
      413,
      'EDIT_COMMANDS_TOO_LARGE',
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new RuntimeHttpHostError('Edit commands must be valid JSON.', 400, 'INVALID_EDIT_COMMANDS_JSON');
  }
}

function readSingleQueryValue(url, name) {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || values[0].length === 0) {
    throw new RuntimeHttpHostError(`Query parameter ${name} must appear exactly once.`, 400, 'INVALID_QUERY');
  }
  return values[0];
}

function resolveInside(root, relativePath) {
  let decoded;
  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return null;
  }
  if (decoded.includes('\u0000')) return null;
  const candidate = path.resolve(root, decoded);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function serveFile(response, filePath, cacheControl = 'no-store') {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const stat = fs.statSync(filePath);
  response.writeHead(200, securityHeaders({
    'content-type': contentType(filePath),
    'content-length': stat.size,
    'cache-control': cacheControl,
  }));
  fs.createReadStream(filePath).pipe(response);
  return true;
}

function normalizeHostOptions(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || path.resolve(__dirname, '../..'));
  const workbenchRoot = path.resolve(options.workbenchRoot || path.join(repositoryRoot, 'web/guitar-tab-workbench'));
  const alphaTabEntry = options.alphaTabEntry ? path.resolve(options.alphaTabEntry) : null;
  const alphaTabDist = options.alphaTabDist ? path.resolve(options.alphaTabDist) : null;
  return {
    repositoryRoot,
    workbenchRoot,
    alphaTabEntry,
    alphaTabDist,
    requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    headersTimeoutMs: options.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS,
  };
}

function createRuntimeHttpServer(options = {}) {
  const config = normalizeHostOptions(options);

  const server = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://runtime.local');

      if (url.pathname === '/healthz') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD');
          writeJson(response, 405, { message: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
          return;
        }
        writeJson(response, 200, {
          status: 'ok',
          service: 'guitar-tab-runtime-host',
          version: RUNTIME_HOST_VERSION,
        });
        return;
      }

      if (url.pathname === '/api/upload') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          writeJson(response, 405, { message: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
          return;
        }
        requireOctetStream(request);
        const fileName = readSingleQueryValue(url, 'fileName');
        const bytes = await readBoundedBody(request);
        const result = processMusicXmlUpload({ fileName, bytes });
        writeJson(response, 200, result);
        return;
      }

      if (url.pathname === '/api/edit' || url.pathname === '/api/edit/poly-v2') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          writeJson(response, 405, { message: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
          return;
        }
        requireOctetStream(request);
        const fileName = readSingleQueryValue(url, 'fileName');
        const expectedInputSha256 = readSingleQueryValue(url, 'sha');
        const commands = parseEditCommands(request);
        const bytes = await readBoundedBody(request);
        const runtimeRequest = { fileName, bytes, expectedInputSha256, commands };
        const result = url.pathname === '/api/edit/poly-v2'
          ? processMusicXmlPolyphonicNoteEditV2(runtimeRequest)
          : processMusicXmlNoteEdit(runtimeRequest);
        writeJson(response, 200, result);
        return;
      }

      if (url.pathname === '/') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD');
          writeText(response, 405, 'Method not allowed.');
          return;
        }
        response.writeHead(302, securityHeaders({ location: '/workbench/', 'cache-control': 'no-store' }));
        response.end();
        return;
      }

      if (url.pathname === '/workbench' || url.pathname === '/workbench/') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD');
          writeText(response, 405, 'Method not allowed.');
          return;
        }
        if (!serveFile(response, path.join(config.workbenchRoot, 'index.html'))) {
          writeText(response, 503, 'Workbench assets are unavailable.');
        }
        return;
      }

      if (url.pathname.startsWith('/workbench/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD');
          writeText(response, 405, 'Method not allowed.');
          return;
        }
        const filePath = resolveInside(config.workbenchRoot, url.pathname.slice('/workbench/'.length));
        if (filePath && serveFile(response, filePath)) return;
        writeText(response, 404, 'Not found.');
        return;
      }

      if (url.pathname === '/assets/alphatab.js') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD');
          writeText(response, 405, 'Method not allowed.');
          return;
        }
        if (config.alphaTabEntry && serveFile(response, config.alphaTabEntry, 'public, max-age=3600')) return;
        writeText(response, 503, 'alphaTab runtime assets are unavailable.');
        return;
      }

      if (url.pathname.startsWith('/assets/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD');
          writeText(response, 405, 'Method not allowed.');
          return;
        }
        if (config.alphaTabDist) {
          const filePath = resolveInside(config.alphaTabDist, url.pathname.slice('/assets/'.length));
          if (filePath && serveFile(response, filePath, 'public, max-age=3600')) return;
        }
        writeText(response, 404, 'Not found.');
        return;
      }

      writeText(response, 404, 'Not found.');
    } catch (error) {
      if (response.headersSent || response.writableEnded) return;
      const statusCode = error instanceof RuntimeHttpHostError ? error.statusCode : 400;
      const code = error instanceof RuntimeHttpHostError
        ? error.code
        : typeof error?.code === 'string'
          ? error.code
          : 'RUNTIME_HOST_REQUEST_FAILED';
      writeJson(response, statusCode, {
        message: error instanceof Error ? error.message : 'Runtime host request failed.',
        code,
      });
    }
  });

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.headersTimeoutMs, config.requestTimeoutMs);
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  return server;
}

module.exports = {
  RUNTIME_HOST_VERSION,
  MAX_EDIT_COMMAND_HEADER_BYTES,
  RuntimeHttpHostError,
  createRuntimeHttpServer,
};
