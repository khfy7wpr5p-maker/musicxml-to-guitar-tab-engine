(function attachIntegratedReviewEditorHost(global) {
  'use strict';

  const INTEGRATED_HOST_VERSION = '1.0.0';
  const RENDERER_SOURCE_REVISION = '13c32eefccd5bf2c227e815aa27aae4a0583801d';
  const RENDERER_CONTRACT_VERSION = '0.2.0';
  const OSMD_VERSION = '2.1.2';
  const OSMD_LICENSE = 'BSD-3-Clause';
  const SEMANTIC_ADDRESS_VERSION = '3.0.0';
  const RUNTIME_WAIT_MS = 15000;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function requireMethods(value, label, methods) {
    assert(record(value), `${label} is required.`);
    for (const method of methods) assert(typeof value[method] === 'function', `${label} must expose ${method}().`);
  }

  function exactRendererManifest(manifest) {
    assert(record(manifest), 'Rendering Layer runtime manifest is required.');
    assert(manifest.rendererSourceRevision === RENDERER_SOURCE_REVISION, 'Rendering Layer source revision mismatch.');
    assert(manifest.scoreRendererContractVersion === RENDERER_CONTRACT_VERSION, 'Rendering Layer contract version mismatch.');
    const osmd = record(manifest.vendor) && record(manifest.vendor.opensheetmusicdisplay)
      ? manifest.vendor.opensheetmusicdisplay
      : null;
    assert(osmd && osmd.version === OSMD_VERSION && osmd.license === OSMD_LICENSE, 'Rendering Layer OSMD profile mismatch.');
    return manifest;
  }

  function semanticAddress(value) {
    return record(value)
      && value.contractVersion === SEMANTIC_ADDRESS_VERSION
      && typeof value.kind === 'string'
      && typeof value.documentId === 'string'
      && typeof value.revisionId === 'string';
  }

  function editorState(controller) {
    const document = controller.getDocument();
    if (!document) return null;
    const session = document.session;
    const score = session?.history?.present?.score;
    if (!score || !session.renderRequest) return null;
    return {
      document,
      documentId: score.id,
      revisionId: score.revision.id,
      pastLength: session.history.past.length,
      futureLength: session.history.future.length,
      selection: session.selection ?? null,
    };
  }

  function sameIdentity(left, right) {
    return Boolean(left && right
      && left.documentId === right.documentId
      && left.revisionId === right.revisionId
      && left.pastLength === right.pastLength
      && left.futureLength === right.futureLength);
  }

  function create({
    reviewPort,
    editorController,
    rendererRuntimeUrl = null,
    rendererApi: suppliedRendererApi = null,
    rendererManifest: suppliedRendererManifest = null,
    onDiagnostic = null,
  }) {
    requireMethods(reviewPort, 'Stage 06 review port', [
      'snapshot',
      'selectIssue',
      'selectTarget',
      'resolvePresentationAddress',
      'command',
      'undo',
      'redo',
      'save',
      'revalidate',
    ]);
    requireMethods(editorController, 'Editor Core controller', [
      'getDocument',
      'getRendererState',
      'attachOsmdRenderer',
      'detachRenderer',
      'renderCurrent',
      'select',
      'selectRenderedScoreNoteRef',
      'resolveRenderedScoreNoteRef',
      'resolveRenderedScoreMeasureRef',
    ]);
    if (onDiagnostic !== null) assert(typeof onDiagnostic === 'function', 'onDiagnostic must be a function.');
    assert(suppliedRendererApi || typeof rendererRuntimeUrl === 'string', 'Rendering Layer runtime URL or API is required.');

    let rendererApi = suppliedRendererApi;
    let rendererManifest = suppliedRendererManifest;
    let rendererFrame = null;
    let rendererDocument = null;
    let rendererPointerListener = null;
    let rendererPointerEvent = null;
    let scoreElement = null;
    let renderEvidence = null;
    let renderTicket = 0;
    let loadSucceeded = false;
    let pendingClear = Promise.resolve();
    let renderQueue = Promise.resolve();
    let mounted = false;
    let disposed = false;
    let latestModel = null;
    let selectionCallbacks = null;
    let resizeTimer = null;

    function diagnostic(code) {
      if (onDiagnostic) onDiagnostic(Object.freeze({ code }));
    }

    function currentRevision() {
      return editorState(editorController)?.revisionId ?? null;
    }

    async function loadRendererManifest(runtimeUrl) {
      if (rendererManifest !== null) return exactRendererManifest(rendererManifest);
      assert(typeof global.fetch === 'function', 'fetch() is required to validate the Rendering Layer runtime manifest.');
      const manifestUrl = new URL('./runtime-manifest.json', runtimeUrl);
      assert(manifestUrl.origin === global.location.origin, 'Rendering Layer runtime must be same-origin.');
      const response = await global.fetch(manifestUrl.href, { cache: 'no-store', credentials: 'same-origin' });
      assert(response.ok, 'Rendering Layer runtime manifest could not be loaded.');
      rendererManifest = exactRendererManifest(await response.json());
      return rendererManifest;
    }

    function validateRendererApi(api) {
      requireMethods(api, 'Rendering Layer browser host', [
        'renderMusicXml',
        'hitTestNoteDetailed',
        'highlight',
        'clearHighlights',
        'moveCursor',
        'dispose',
      ]);
      return api;
    }

    async function waitForRendererApi(frame) {
      const started = Date.now();
      while (!disposed && Date.now() - started <= RUNTIME_WAIT_MS) {
        try {
          const api = frame.contentWindow?.__ST_SCORE_RENDER_HOST__;
          if (api) return validateRendererApi(api);
        } catch {
          // Same-origin frame may still be booting.
        }
        await new Promise((resolve) => global.setTimeout(resolve, 50));
      }
      throw new Error('Rendering Layer browser host timed out.');
    }

    function osmdHost(api) {
      return Object.freeze({
        packageName: 'opensheetmusicdisplay',
        packageVersion: OSMD_VERSION,
        license: OSMD_LICENSE,
        instance: Object.freeze({
          async load(musicxml) {
            await pendingClear;
            const before = editorState(editorController);
            assert(before, 'Editor Core has no current score to render.');
            const ticket = `stage07-${++renderTicket}`;
            const result = await api.renderMusicXml({
              contractVersion: RENDERER_CONTRACT_VERSION,
              musicxml,
              ticket,
              pageMode: 'continuous',
              autoResize: false,
              drawTitle: true,
              drawComposer: true,
            });
            assert(result && typeof result.renderEpoch === 'string' && result.renderEpoch.length > 0, 'Rendering Layer did not return a render epoch.');
            const after = editorState(editorController);
            assert(after && before.documentId === after.documentId && before.revisionId === after.revisionId, 'Renderer completed for a stale Editor Core revision.');
            renderEvidence = Object.freeze({
              documentId: after.documentId,
              revisionId: after.revisionId,
              renderEpoch: result.renderEpoch,
              sourceId: result.sourceId ?? null,
            });
            loadSucceeded = true;
          },
          render() {
            assert(loadSucceeded, 'Renderer render() called without a successful load().');
          },
          clear() {
            renderEvidence = null;
            loadSucceeded = false;
            pendingClear = pendingClear.then(() => api.dispose()).catch(() => undefined);
          },
        }),
      });
    }

    function renderedCurrent() {
      const current = editorState(editorController);
      const rendererState = editorController.getRendererState();
      return Boolean(current && renderEvidence
        && rendererState?.renderedDocumentId === current.documentId
        && rendererState?.renderedRevisionId === current.revisionId
        && renderEvidence.documentId === current.documentId
        && renderEvidence.revisionId === current.revisionId);
    }

    function ensureRenderedCurrent({ force = false } = {}) {
      renderQueue = renderQueue.then(async () => {
        if (disposed || !mounted || !rendererApi) return;
        const current = editorState(editorController);
        if (!current) return;
        if (!force && renderedCurrent()) return;
        await editorController.renderCurrent();
        const after = editorState(editorController);
        const rendererState = editorController.getRendererState();
        assert(after && renderEvidence, 'Current revision did not produce renderer evidence.');
        assert(rendererState?.renderedDocumentId === after.documentId && rendererState?.renderedRevisionId === after.revisionId, 'Editor Core rejected the current renderer presentation.');
        assert(renderEvidence.documentId === after.documentId && renderEvidence.revisionId === after.revisionId, 'Rendering Layer evidence is stale after renderCurrent().');
      });
      return renderQueue;
    }

    async function clearPresentation() {
      if (!rendererApi) return;
      await rendererApi.clearHighlights();
    }

    async function exactPresentationAddress(selectedTarget, selectedIssueId) {
      const resolved = await reviewPort.resolvePresentationAddress({ selectedTarget, selectedIssueId });
      if (resolved === null || resolved === undefined) return null;
      assert(semanticAddress(resolved), 'Stage 06 review port returned a non-semantic presentation address.');
      return resolved;
    }

    function selectEditorAddressOnly(address) {
      const before = editorState(editorController);
      assert(before, 'Editor Core has no current document for selection.');
      const result = editorController.select(address);
      const after = editorState(editorController);
      assert(result?.error === null, 'Editor Core rejected the semantic presentation selection.');
      assert(sameIdentity(before, after), 'Presentation selection must not mutate Editor Core history or revision.');
      return after?.selection ?? null;
    }

    async function syncScoreSelection({ selectedTarget, selectedIssueId }) {
      if (!mounted || !rendererApi) return;
      await ensureRenderedCurrent();
      if (selectedTarget === null || selectedTarget === undefined) {
        await clearPresentation();
        return;
      }
      let address;
      try {
        address = await exactPresentationAddress(selectedTarget, selectedIssueId);
      } catch {
        diagnostic('PRESENTATION_ADDRESS_REJECTED');
        await clearPresentation();
        return;
      }
      if (!address) {
        diagnostic('PRESENTATION_ADDRESS_UNRESOLVED');
        await clearPresentation();
        return;
      }
      try {
        selectEditorAddressOnly(address);
        const noteRef = editorController.resolveRenderedScoreNoteRef(address);
        if (noteRef) {
          await rendererApi.clearHighlights();
          await rendererApi.highlight({ target: noteRef, className: 'st-score-review-issue' });
          return;
        }
        const measureRef = editorController.resolveRenderedScoreMeasureRef(address);
        await rendererApi.clearHighlights();
        if (measureRef) await rendererApi.moveCursor(measureRef);
      } catch {
        diagnostic('PRESENTATION_SYNC_REJECTED');
        await clearPresentation();
      }
    }

    async function selectScorePoint(point) {
      if (!mounted || !rendererApi) return Object.freeze({ kind: 'MISS', reason: 'RENDERER_NOT_READY' });
      await ensureRenderedCurrent();
      const evidence = renderEvidence;
      if (!evidence) return Object.freeze({ kind: 'MISS', reason: 'RENDER_EVIDENCE_MISSING' });
      const hit = rendererApi.hitTestNoteDetailed({ clientX: point.clientX, clientY: point.clientY });
      if (!hit || hit.kind !== 'HIT') {
        diagnostic(hit?.kind === 'MISS' ? `RENDERER_${hit.reason || 'MISS'}` : 'RENDERER_HIT_REJECTED');
        return hit || Object.freeze({ kind: 'MISS', reason: 'INVALID_HIT' });
      }
      if (hit.renderEpoch !== evidence.renderEpoch || (hit.sourceId ?? null) !== evidence.sourceId) {
        diagnostic('STALE_RENDERER_HIT');
        return Object.freeze({ kind: 'MISS', reason: 'STALE_RENDERER_HIT' });
      }
      const before = editorState(editorController);
      const selected = editorController.selectRenderedScoreNoteRef(hit.target);
      const after = editorState(editorController);
      assert(selected?.error === null && before && after && sameIdentity(before, after), 'Renderer hit must resolve as an Editor Core selection-only operation.');
      assert(after.selection && (after.selection.kind === 'note' || after.selection.kind === 'grace-note'), 'Renderer hit did not resolve to a current note selection.');
      await reviewPort.selectTarget(after.selection);
      await rendererApi.clearHighlights();
      await rendererApi.highlight({ target: hit.target, className: 'st-score-review-selection' });
      return hit;
    }

    async function afterPossibleEdit(operation) {
      const beforeRevision = currentRevision();
      const result = await operation();
      const afterRevision = currentRevision();
      if (mounted && beforeRevision !== afterRevision) await ensureRenderedCurrent();
      return result;
    }

    function scheduleControlledRerender() {
      if (disposed || !mounted) return;
      if (resizeTimer !== null) global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(() => {
        resizeTimer = null;
        void ensureRenderedCurrent({ force: true }).catch(() => diagnostic('CONTROLLED_RERENDER_REJECTED'));
      }, 80);
    }

    function installLayoutLifecycle() {
      global.addEventListener('resize', scheduleControlledRerender);
      global.addEventListener('orientationchange', scheduleControlledRerender);
      global.visualViewport?.addEventListener?.('resize', scheduleControlledRerender);
    }

    function removeLayoutLifecycle() {
      global.removeEventListener('resize', scheduleControlledRerender);
      global.removeEventListener('orientationchange', scheduleControlledRerender);
      global.visualViewport?.removeEventListener?.('resize', scheduleControlledRerender);
      if (resizeTimer !== null) global.clearTimeout(resizeTimer);
      resizeTimer = null;
    }

    async function mountScore(element, callbacks = {}) {
      assert(element && element.ownerDocument, 'Score mount element is required.');
      assert(!mounted, 'Integrated Stage 07 score host is already mounted.');
      scoreElement = element;
      selectionCallbacks = callbacks;

      if (!rendererApi) {
        const runtimeUrl = new URL(rendererRuntimeUrl, element.ownerDocument.baseURI || global.location.href);
        assert(runtimeUrl.origin === global.location.origin, 'Rendering Layer runtime must be same-origin.');
        await loadRendererManifest(runtimeUrl);
        const frame = element.ownerDocument.createElement('iframe');
        frame.src = runtimeUrl.href;
        frame.title = 'ST Score Rendering Layer';
        frame.setAttribute('data-stage07-renderer-frame', 'true');
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.minHeight = '260px';
        frame.style.border = '0';
        frame.style.display = 'block';
        element.replaceChildren(frame);
        rendererFrame = frame;
        rendererApi = await waitForRendererApi(frame);
        rendererDocument = frame.contentDocument;
      } else {
        exactRendererManifest(rendererManifest);
        validateRendererApi(rendererApi);
      }

      editorController.attachOsmdRenderer(osmdHost(rendererApi));
      mounted = true;
      installLayoutLifecycle();
      await ensureRenderedCurrent({ force: true });

      if (rendererFrame && rendererDocument) {
        const childWindow = rendererFrame.contentWindow;
        rendererPointerEvent = childWindow && 'PointerEvent' in childWindow ? 'pointerup' : 'click';
        rendererPointerListener = (event) => {
          const point = { clientX: event.clientX, clientY: event.clientY };
          if (typeof selectionCallbacks?.onScorePoint === 'function') {
            void selectionCallbacks.onScorePoint(point);
          } else {
            void selectScorePoint(point)
              .then(() => selectionCallbacks?.onSelectionChanged?.())
              .catch(() => diagnostic('POINTER_SELECTION_REJECTED'));
          }
        };
        rendererDocument.addEventListener(rendererPointerEvent, rendererPointerListener);
      }

      return Object.freeze({ dispose });
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      removeLayoutLifecycle();
      if (rendererDocument && rendererPointerListener && rendererPointerEvent) {
        rendererDocument.removeEventListener(rendererPointerEvent, rendererPointerListener);
      }
      rendererPointerListener = null;
      rendererPointerEvent = null;
      try { editorController.detachRenderer(); } catch { /* presentation cleanup only */ }
      if (rendererApi) void rendererApi.dispose().catch?.(() => undefined);
      rendererFrame?.remove();
      rendererFrame = null;
      rendererDocument = null;
      rendererApi = null;
      renderEvidence = null;
      mounted = false;
      scoreElement = null;
    }

    async function snapshot() {
      const value = await reviewPort.snapshot();
      latestModel = value?.uiModel ?? value;
      if (mounted && latestModel?.documentStatus === 'REVIEW_REQUIRED') await ensureRenderedCurrent();
      return value;
    }

    async function continueToTab() {
      if (typeof reviewPort.continueToTab === 'function') return reviewPort.continueToTab();
      const detail = Object.freeze({
        from: 'STAGE_07_EDITOR_UI',
        to: 'STAGE_08_REVALIDATION_AND_TAB',
        status: latestModel?.documentStatus ?? null,
      });
      if (scoreElement && typeof global.CustomEvent === 'function') {
        scoreElement.dispatchEvent(new global.CustomEvent('stage07:continue-to-tab', { detail }));
      }
      return detail;
    }

    return Object.freeze({
      contractVersion: INTEGRATED_HOST_VERSION,
      pins: Object.freeze({
        rendererSourceRevision: RENDERER_SOURCE_REVISION,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        osmdVersion: OSMD_VERSION,
        osmdLicense: OSMD_LICENSE,
      }),
      snapshot,
      mountScore,
      syncScoreSelection,
      selectIssue: (issueId) => reviewPort.selectIssue(issueId),
      selectScorePoint,
      command: (payload) => afterPossibleEdit(() => reviewPort.command(payload)),
      undo: () => afterPossibleEdit(() => reviewPort.undo()),
      redo: () => afterPossibleEdit(() => reviewPort.redo()),
      save: () => afterPossibleEdit(() => reviewPort.save()),
      revalidate: () => afterPossibleEdit(() => reviewPort.revalidate()),
      continueToTab,
      dispose,
    });
  }

  global.ReviewScoreEditorIntegratedHost = Object.freeze({
    version: INTEGRATED_HOST_VERSION,
    pins: Object.freeze({
      rendererSourceRevision: RENDERER_SOURCE_REVISION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      osmdVersion: OSMD_VERSION,
      osmdLicense: OSMD_LICENSE,
    }),
    create,
  });
}(window));