(function attachGuitarTabWorkbenchHost(global) {
  'use strict';

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function createDocumentController(workbench, adapter) {
    return Object.freeze({
      loadFile(file) {
        return workbench.loadFile(file);
      },
      async loadPreview() {
        assert(typeof adapter.loadPreview === 'function', 'Preview loading is not available in runtime mode.');
        const result = await adapter.loadPreview();
        workbench.loadRuntimeResult(result);
        return result;
      },
      applySelectedEdit() {
        return workbench.applySelectedEdit();
      },
      snapshot() {
        return workbench.snapshot();
      },
    });
  }

  function createPlaybackController(workbench) {
    return Object.freeze({
      play() {
        const state = workbench.snapshot();
        if (state.playDisabled) return false;
        workbench.api.play();
        return true;
      },
      stop() {
        const state = workbench.snapshot();
        if (state.stopDisabled) return false;
        workbench.api.stop();
        return true;
      },
      snapshot() {
        const state = workbench.snapshot();
        return Object.freeze({
          playerReady: state.playerReady,
          playerState: state.playerState,
          playDisabled: state.playDisabled,
          stopDisabled: state.stopDisabled,
          currentMeasureIndex: state.currentMeasureIndex,
          currentMeasureNumber: state.currentMeasureNumber,
          positionTick: state.positionTick,
        });
      },
    });
  }

  function createSelectionController(workbench) {
    return Object.freeze({
      selectEvent(identity) {
        return workbench.selectEvent(identity);
      },
      selectedEvent() {
        return workbench.snapshot().selectedEvent;
      },
      applySelectedEdit() {
        return workbench.applySelectedEdit();
      },
    });
  }

  function createIssueController(workbench) {
    return Object.freeze({
      focus(location) {
        return workbench.focusMeasure(location);
      },
      count() {
        return workbench.snapshot().issueCount;
      },
    });
  }

  function resolvePlayerMode(alphaTab, value) {
    if (value === undefined || value === null || value === 'synthesizer') {
      return alphaTab.PlayerMode.EnabledSynthesizer;
    }
    if (value === 'external-media') return alphaTab.PlayerMode.EnabledExternalMedia;
    throw new Error('Unsupported Workbench playerMode.');
  }

  function resolveAssetUrls(documentRef, configuredBase) {
    const base = new URL(configuredBase || '../assets/', documentRef.baseURI);
    assert(base.origin === documentRef.defaultView.location.origin, 'Workbench assets must stay same-origin.');
    const assetBaseUrl = base.toString().replace(/\/$/, '');
    return Object.freeze({
      assetBaseUrl,
      scriptFileUrl: new URL('alphatab.js', `${assetBaseUrl}/`).toString(),
      soundFontUrl: new URL('soundfont/sonivox.sf2', `${assetBaseUrl}/`).toString(),
    });
  }

  function configureShell(root, mode) {
    const modeBadge = root.querySelector('[data-role="mode-badge"]');
    const modeDescription = root.querySelector('[data-role="mode-description"]');
    const runtimeUploadAction = root.querySelector('[data-role="runtime-upload-action"]');
    const loadDemoButton = root.querySelector('[data-role="load-demo"]');
    const previewNotice = root.querySelector('[data-role="preview-notice"]');

    assert(
      modeBadge && modeDescription && runtimeUploadAction && loadDemoButton && previewNotice,
      'Workbench product shell is incomplete.',
    );

    root.dataset.mode = mode;
    modeBadge.dataset.mode = mode;
    modeBadge.textContent = mode === 'preview' ? 'PREVIEW' : 'RUNTIME';
    modeDescription.textContent = mode === 'preview'
      ? 'Static CI demo · upload/edit API disconnected'
      : 'Runtime host · bounded upload/edit API required';
    runtimeUploadAction.hidden = mode === 'preview';
    loadDemoButton.hidden = mode !== 'preview';
    previewNotice.hidden = mode !== 'preview';

    return Object.freeze({ loadDemoButton, previewNotice });
  }

  function mount(options) {
    assert(options && typeof options === 'object', 'Host options are required.');
    const root = options.root;
    const alphaTab = options.alphaTab;
    const adapters = options.adapters;
    const config = options.config || {};

    assert(root && root.ownerDocument, 'Workbench host root is required.');
    assert(alphaTab && typeof alphaTab.AlphaTabApi === 'function', 'alphaTab is required.');
    assert(adapters && typeof adapters === 'object', 'Workbench host adapters are required.');
    assert(global.GuitarTabWorkbench && typeof global.GuitarTabWorkbench.mount === 'function', 'Workbench core is required.');

    const mode = config.mode === 'preview' ? 'preview' : 'runtime';
    const adapter = mode === 'preview'
      ? adapters.createStaticPreviewAdapter({previewResultUrl: config.previewResultUrl})
      : adapters.createRuntimeApiAdapter({apiBaseUrl: config.apiBaseUrl});
    const assetUrls = resolveAssetUrls(root.ownerDocument, config.assetBaseUrl);
    const shell = configureShell(root, mode);

    const workbench = global.GuitarTabWorkbench.mount({
      root,
      alphaTab,
      upload: adapter.upload,
      edit: adapter.edit,
      assetBaseUrl: assetUrls.assetBaseUrl,
      scriptFileUrl: assetUrls.scriptFileUrl,
      soundFontUrl: assetUrls.soundFontUrl,
      playerMode: resolvePlayerMode(alphaTab, config.playerMode),
    });

    const controllers = Object.freeze({
      document: createDocumentController(workbench, adapter),
      playback: createPlaybackController(workbench),
      selection: createSelectionController(workbench),
      issues: createIssueController(workbench),
    });

    let destroyed = false;
    const onLoadDemo = () => {
      controllers.document.loadPreview().catch((error) => {
        shell.previewNotice.textContent = `Preview load failed: ${error?.message || String(error)}`;
        shell.previewNotice.hidden = false;
      });
    };
    shell.loadDemoButton.addEventListener('click', onLoadDemo);

    const ready = mode === 'preview' && config.autoLoadPreview !== false
      ? controllers.document.loadPreview()
      : Promise.resolve(null);

    return Object.freeze({
      mode,
      workbench,
      controllers,
      ready,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        shell.loadDemoButton.removeEventListener('click', onLoadDemo);
        workbench.destroy();
      },
    });
  }

  global.GuitarTabWorkbenchHost = Object.freeze({
    mount,
    createDocumentController,
    createPlaybackController,
    createSelectionController,
    createIssueController,
  });
}(window));
