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

  function createEditRequest(request, label, commands = request?.commands) {
    assert(request && typeof request === 'object', `${label} request is required.`);
    assert(request.bytes instanceof Uint8Array, `${label} requires owned source bytes.`);
    assert(typeof request.fileName === 'string' && request.fileName.length > 0, `${label} requires a file name.`);
    assert(
      typeof request.expectedInputSha256 === 'string'
        && /^[0-9a-f]{64}$/.test(request.expectedInputSha256),
      `${label} requires the immutable source SHA-256.`,
    );
    assert(Array.isArray(commands), `${label} requires revision commands.`);
    return Object.freeze({
      query: `fileName=${encodeURIComponent(request.fileName)}&sha=${encodeURIComponent(request.expectedInputSha256)}`,
      headers: Object.freeze({
        'content-type': 'application/octet-stream',
        'x-st-edit-commands': JSON.stringify(commands),
      }),
      body: request.bytes,
    });
  }

  function polyV2RuntimeCommands(commands) {
    assert(Array.isArray(commands), 'POLY_V2 commands must be an array.');
    return commands.map((command) => {
      assert(command && typeof command === 'object', 'POLY_V2 command must be an object.');
      assert(Array.isArray(command.sourceGroupEventIds), 'POLY_V2 command requires sourceGroupEventIds.');
      assert(command.pitch && typeof command.pitch === 'object', 'POLY_V2 command requires pitch.');
      return {
        measureIndex: command.measureIndex,
        sourceOrder: command.sourceOrder,
        sourceEventId: command.sourceEventId,
        sourceGroupId: command.sourceGroupId,
        sourceGroupEventIds: [...command.sourceGroupEventIds],
        pitch: {
          step: command.pitch.step,
          alter: command.pitch.alter,
          octave: command.pitch.octave,
        },
      };
    });
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
        const wire = createEditRequest(request, 'Runtime edit');
        const response = await fetch(`${apiBaseUrl}/edit?${wire.query}`, {
          method: 'POST',
          headers: wire.headers,
          body: wire.body,
        });
        return readJsonResponse(response, 'Edit request failed.');
      },
      async polyphonicEdit(request) {
        const wire = createEditRequest(
          request,
          'POLY_V2 edit',
          polyV2RuntimeCommands(request?.commands),
        );
        const response = await fetch(`${apiBaseUrl}/edit/poly-v2?${wire.query}`, {
          method: 'POST',
          headers: wire.headers,
          body: wire.body,
        });
        return readJsonResponse(response, 'POLY_V2 edit request failed.');
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
      async polyphonicEdit() {
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