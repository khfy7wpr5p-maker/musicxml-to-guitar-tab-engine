(function attachGuitarTabWorkbenchHostAdapters(global) {
  'use strict';

  const HOST_MODE = Object.freeze({
    RUNTIME: 'runtime',
    PREVIEW: 'preview',
  });

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function normalizeSameOriginPath(value, fallback, field) {
    const candidate = String(value || fallback || '').trim();
    assert(candidate.length > 0, `${field} is required.`);
    assert(!/^[a-z][a-z0-9+.-]*:/i.test(candidate), `${field} must be a same-origin path.`);
    assert(!candidate.startsWith('//'), `${field} must not be protocol-relative.`);
    return candidate.replace(/\/$/, '');
  }

  async function readJsonResponse(response, fallbackMessage) {
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(fallbackMessage);
    }
    if (!response.ok) {
      throw new Error(
        payload && typeof payload.message === 'string' && payload.message
          ? payload.message
          : fallbackMessage,
      );
    }
    assert(payload && typeof payload === 'object', fallbackMessage);
    return payload;
  }

  function createRuntimeApiAdapter(options = {}) {
    const apiBaseUrl = normalizeSameOriginPath(options.apiBaseUrl, '/api', 'apiBaseUrl');

    return Object.freeze({
      mode: HOST_MODE.RUNTIME,
      async upload(file, ownedBytes) {
        assert(file && typeof file.name === 'string', 'Runtime upload requires a file name.');
        assert(ownedBytes instanceof Uint8Array, 'Runtime upload requires owned bytes.');
        const response = await fetch(`${apiBaseUrl}/upload?fileName=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: {'content-type': 'application/octet-stream'},
          body: ownedBytes,
        });
        return readJsonResponse(response, 'Upload request failed.');
      },
      async edit(request) {
        assert(request && typeof request === 'object', 'Runtime edit request is required.');
        assert(request.bytes instanceof Uint8Array, 'Runtime edit requires owned source bytes.');
        const form = new FormData();
        form.append(
          'source',
          new Blob([request.bytes], {type: 'application/vnd.recordare.musicxml+xml'}),
          request.fileName,
        );
        form.append('expectedInputSha256', request.expectedInputSha256);
        form.append('commands', JSON.stringify(request.commands));
        const response = await fetch(`${apiBaseUrl}/edit`, {method: 'POST', body: form});
        return readJsonResponse(response, 'Edit request failed.');
      },
      loadPreview: null,
    });
  }

  function createStaticPreviewAdapter(options = {}) {
    const previewResultUrl = normalizeSameOriginPath(
      options.previewResultUrl,
      '../preview/demo.json',
      'previewResultUrl',
    );

    function readOnlyError() {
      return new Error('Static preview mode is read-only; connect the runtime host to upload or edit MusicXML.');
    }

    return Object.freeze({
      mode: HOST_MODE.PREVIEW,
      async upload() {
        throw readOnlyError();
      },
      async edit() {
        throw readOnlyError();
      },
      async loadPreview() {
        const response = await fetch(previewResultUrl, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const result = await readJsonResponse(response, 'Static preview result could not be loaded.');
        assert(result.status === 'PASS', 'Static preview result must be a PASS result.');
        assert(typeof result.musicXml === 'string' && result.musicXml.length > 0, 'Static preview result is missing MusicXML.');
        return result;
      },
    });
  }

  global.GuitarTabWorkbenchHostAdapters = Object.freeze({
    HOST_MODE,
    createRuntimeApiAdapter,
    createStaticPreviewAdapter,
  });
}(window));
