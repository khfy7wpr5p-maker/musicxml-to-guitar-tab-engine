(function attachGuitarTabWorkbenchHost(global) {
  'use strict';

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function monoWrittenPitch(pitch) {
    if (!pitch || !Number.isSafeInteger(pitch.octave) || !Number.isSafeInteger(pitch.midi)) {
      return pitch;
    }
    const octave = pitch.octave + 1;
    const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[pitch.alter];
    if (accidental === undefined) return pitch;
    return Object.freeze({
      step: pitch.step,
      alter: pitch.alter,
      octave,
      written: `${pitch.step}${accidental}${octave}`,
      midi: pitch.midi + 12,
    });
  }

  function userFacingSnapshot(snapshot) {
    if (snapshot?.runtimeResult?.route !== 'MONO_V1' || !snapshot?.selectedEvent?.pitch) {
      return snapshot;
    }
    return Object.freeze({
      ...snapshot,
      selectedEvent: Object.freeze({
        ...snapshot.selectedEvent,
        pitch: monoWrittenPitch(snapshot.selectedEvent.pitch),
      }),
    });
  }

  // The core Workbench predates the additive capability contract and still has
  // PASS-only internal render/playback gates. This bridge is deliberately
  // presentation-only: it never changes the authoritative result returned to
  // product controllers. A REVIEW_REQUIRED result is presented to the legacy
  // core as renderable only when the backend explicitly supplies the renderer
  // and provisional TAB capabilities plus both artifacts.
  function createCapabilityBridge(adapter) {
    let authoritativeResult = null;

    function isRenderableReview(result) {
      return Boolean(
        result?.status === 'REVIEW_REQUIRED'
        && result?.capabilities?.renderScore === true
        && result?.capabilities?.generateTab === true
        && result?.artifacts?.provisionalTabAvailable === true
        && typeof result?.musicXml === 'string'
        && result.musicXml.length > 0
        && result?.canonicalTabResult,
      );
    }

    function present(result) {
      authoritativeResult = result && typeof result === 'object' ? result : null;
      if (!isRenderableReview(result)) return result;
      return {
        ...result,
        status: 'PASS',
      };
    }

    function clearAuthority(result) {
      authoritativeResult = null;
      return result;
    }

    const bridgedAdapter = Object.freeze({
      ...adapter,
      async upload(file, ownedBytes) {
        return present(await adapter.upload(file, ownedBytes));
      },
      async edit(request) {
        return clearAuthority(await adapter.edit(request));
      },
      async polyphonicEdit(request) {
        return clearAuthority(await adapter.polyphonicEdit(request));
      },
      async transpose(request) {
        return clearAuthority(await adapter.transpose(request));
      },
      loadPreview: typeof adapter.loadPreview === 'function'
        ? async () => present(await adapter.loadPreview())
        : null,
    });

    return Object.freeze({
      adapter: bridgedAdapter,
      present,
      currentResult() {
        return authoritativeResult;
      },
    });
  }

  function createWorkbenchPresentation(coreWorkbench, root, capabilityBridge) {
    const selectedNote = root.querySelector('[data-role="selected-note"]');
    const editStep = root.querySelector('[data-role="edit-step"]');
    const editAlter = root.querySelector('[data-role="edit-alter"]');
    const editOctave = root.querySelector('[data-role="edit-octave"]');
    const applyEditButton = root.querySelector('[data-role="apply-edit"]');
    const transposeSpelling = root.querySelector('[data-role="transpose-spelling"]');
    const transposeTargetKey = root.querySelector('[data-role="transpose-target-key"]');
    const transposeDownButton = root.querySelector('[data-role="transpose-down"]');
    const transposeUpButton = root.querySelector('[data-role="transpose-up"]');
    const transposeTargetButton = root.querySelector('[data-role="transpose-target"]');
    const playButton = root.querySelector('[data-role="play"]');
    const stopButton = root.querySelector('[data-role="stop"]');
    const documentStatus = root.querySelector('[data-role="document-status"]');

    function authoritativeRuntimeResult(coreSnapshot) {
      return capabilityBridge?.currentResult() || coreSnapshot.runtimeResult;
    }

    function syncMonoEditor() {
      const snapshot = coreWorkbench.snapshot();
      const selected = snapshot?.selectedEvent;
      if (snapshot?.runtimeResult?.route !== 'MONO_V1' || !selected?.pitch) return;
      const pitch = monoWrittenPitch(selected.pitch);
      if (pitch === selected.pitch) return;
      if (selectedNote) {
        selectedNote.textContent = `${pitch.written} · measure ${selected.visibleMeasureNumber} · event ${selected.eventIndex + 1}`;
      }
      if (editStep) editStep.value = pitch.step;
      if (editAlter) editAlter.value = String(pitch.alter);
      if (editOctave) editOctave.value = String(pitch.octave);
    }

    function syncCapabilityUi() {
      const coreSnapshot = coreWorkbench.snapshot();
      const result = authoritativeRuntimeResult(coreSnapshot);
      if (!result || !result.capabilities) return;

      if (documentStatus) documentStatus.textContent = result.status;
      if (playButton) {
        playButton.dataset.playbackReliability = result.capabilities.playback || 'DISABLED';
        playButton.title = result.capabilities.playback === 'APPROXIMATE'
          ? 'Approximate playback: one or more score details require review.'
          : '';
      }

      if (result.status !== 'REVIEW_REQUIRED') return;

      const playbackAllowed = result.capabilities.playback === 'FULL'
        || result.capabilities.playback === 'APPROXIMATE';
      if (!playbackAllowed) {
        if (playButton) playButton.disabled = true;
        if (stopButton) stopButton.disabled = true;
      }

      if (result.capabilities.editPitch !== true) {
        if (editStep) editStep.disabled = true;
        if (editAlter) editAlter.disabled = true;
        if (editOctave) editOctave.disabled = true;
        if (applyEditButton) applyEditButton.disabled = true;
      }

      // Document transposition is not a teacher-review operation. Keep it off
      // until the review revision contract explicitly grants structure edits.
      if (transposeSpelling) transposeSpelling.disabled = true;
      if (transposeTargetKey) transposeTargetKey.disabled = true;
      if (transposeDownButton) transposeDownButton.disabled = true;
      if (transposeUpButton) transposeUpButton.disabled = true;
      if (transposeTargetButton) transposeTargetButton.disabled = true;
    }

    function snapshotWithAuthority() {
      syncCapabilityUi();
      const coreSnapshot = coreWorkbench.snapshot();
      const result = authoritativeRuntimeResult(coreSnapshot);
      const snapshot = result === coreSnapshot.runtimeResult
        ? coreSnapshot
        : Object.freeze({ ...coreSnapshot, runtimeResult: result });
      return userFacingSnapshot(snapshot);
    }

    const presentation = Object.create(coreWorkbench);
    Object.defineProperties(presentation, {
      loadFile: {
        enumerable: true,
        async value(file) {
          const accepted = await coreWorkbench.loadFile(file);
          syncMonoEditor();
          syncCapabilityUi();
          return accepted;
        },
      },
      loadRuntimeResult: {
        enumerable: true,
        value(result) {
          const presented = capabilityBridge ? capabilityBridge.present(result) : result;
          const accepted = coreWorkbench.loadRuntimeResult(presented);
          syncMonoEditor();
          syncCapabilityUi();
          return accepted;
        },
      },
      snapshot: {
        enumerable: true,
        value() {
          return snapshotWithAuthority();
        },
      },
      selectNote: {
        enumerable: true,
        value(note) {
          const accepted = coreWorkbench.selectNote(note);
          syncMonoEditor();
          syncCapabilityUi();
          return accepted;
        },
      },
      selectEvent: {
        enumerable: true,
        value(identity) {
          const accepted = coreWorkbench.selectEvent(identity);
          syncMonoEditor();
          syncCapabilityUi();
          return accepted;
        },
      },
      applySelectedEdit: {
        enumerable: true,
        async value() {
          const result = authoritativeRuntimeResult(coreWorkbench.snapshot());
          if (result?.status === 'REVIEW_REQUIRED' && result?.capabilities?.editPitch !== true) {
            syncCapabilityUi();
            return false;
          }
          syncMonoEditor();
          const applied = await coreWorkbench.applySelectedEdit();
          syncMonoEditor();
          syncCapabilityUi();
          return applied;
        },
      },
      applyDocumentTransposition: {
        enumerable: true,
        async value(operation) {
          const result = authoritativeRuntimeResult(coreWorkbench.snapshot());
          if (result?.status === 'REVIEW_REQUIRED') {
            syncCapabilityUi();
            return false;
          }
          const applied = await coreWorkbench.applyDocumentTransposition(operation);
          syncCapabilityUi();
          return applied;
        },
      },
    });

    coreWorkbench.api.noteMouseDown.on(() => {
      Promise.resolve().then(() => {
        syncMonoEditor();
        syncCapabilityUi();
      });
    });
    coreWorkbench.api.scoreLoaded.on(() => {
      Promise.resolve().then(() => {
        syncMonoEditor();
        syncCapabilityUi();
      });
    });
    coreWorkbench.api.playerReady.on(() => {
      Promise.resolve().then(syncCapabilityUi);
    });

    return Object.freeze(presentation);
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
      applyDocumentTransposition(operation) {
        return workbench.applyDocumentTransposition(operation);
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
    const capabilityBridge = createCapabilityBridge(adapter);
    const assetUrls = resolveAssetUrls(root.ownerDocument, config.assetBaseUrl);
    const shell = configureShell(root, mode);

    const coreWorkbench = global.GuitarTabWorkbench.mount({
      root,
      alphaTab,
      upload: capabilityBridge.adapter.upload,
      edit: capabilityBridge.adapter.edit,
      polyphonicEdit: capabilityBridge.adapter.polyphonicEdit,
      transpose: capabilityBridge.adapter.transpose,
      assetBaseUrl: assetUrls.assetBaseUrl,
      scriptFileUrl: assetUrls.scriptFileUrl,
      soundFontUrl: assetUrls.soundFontUrl,
      playerMode: resolvePlayerMode(alphaTab, config.playerMode),
    });
    const workbench = createWorkbenchPresentation(coreWorkbench, root, capabilityBridge);

    const controllers = Object.freeze({
      // Preview results must enter the presentation bridge exactly once. The
      // document controller therefore reads from the raw adapter; uploads and
      // mutations still use the bridged adapter supplied to the legacy core.
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
        coreWorkbench.destroy();
      },
    });
  }

  global.GuitarTabWorkbenchHost = Object.freeze({
    mount,
    createCapabilityBridge,
    createDocumentController,
    createPlaybackController,
    createSelectionController,
    createIssueController,
  });
}(window));