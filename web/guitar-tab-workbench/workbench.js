(function attachGuitarTabWorkbench(global) {
  'use strict';

  const MAX_CLIENT_UPLOAD_BYTES = 5 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = ['.musicxml', '.xml'];

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function extensionOf(fileName) {
    const lower = String(fileName || '').toLowerCase();
    return ALLOWED_EXTENSIONS.find((extension) => lower.endsWith(extension)) || null;
  }

  function firstMusicalBeat(bar) {
    if (!bar || !Array.isArray(bar.voices)) return null;
    for (const voice of bar.voices) {
      if (!voice || !Array.isArray(voice.beats)) continue;
      for (const beat of voice.beats) {
        if (!beat) continue;
        if ((Array.isArray(beat.notes) && beat.notes.length > 0) || (beat.isRest && !beat.isEmpty)) {
          return beat;
        }
      }
    }
    return null;
  }

  function createElement(documentRef, name, className, text) {
    const element = documentRef.createElement(name);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function mount(options) {
    assert(options && typeof options === 'object', 'Workbench options are required.');
    const root = options.root;
    const alphaTab = options.alphaTab;
    const upload = options.upload;
    assert(root && root.ownerDocument, 'A workbench root element is required.');
    assert(alphaTab && typeof alphaTab.AlphaTabApi === 'function', 'alphaTab is required.');
    assert(typeof upload === 'function', 'A bounded upload function is required.');

    const documentRef = root.ownerDocument;
    const fileInput = root.querySelector('[data-role="musicxml-file"]');
    const playButton = root.querySelector('[data-role="play"]');
    const stopButton = root.querySelector('[data-role="stop"]');
    const scoreHost = root.querySelector('[data-role="score"]');
    const issueList = root.querySelector('[data-role="issues"]');
    const issueCount = root.querySelector('[data-role="issue-count"]');
    const documentStatus = root.querySelector('[data-role="document-status"]');
    const cursorStatus = root.querySelector('[data-role="cursor-status"]');
    const routeStatus = root.querySelector('[data-role="route-status"]');

    assert(fileInput && playButton && stopButton && scoreHost && issueList, 'Workbench markup is incomplete.');

    const state = {
      destroyed: false,
      loading: false,
      runtimeResult: null,
      scoreLoaded: false,
      playerReady: false,
      playerState: null,
      positionTick: 0,
      currentMeasureIndex: null,
      currentMeasureNumber: null,
      issueCount: 0,
      lastError: null,
    };

    const assetBaseUrl = String(options.assetBaseUrl || '/assets').replace(/\/$/, '');
    const scriptFileUrl = options.scriptFileUrl || `${assetBaseUrl}/alphatab.js`;
    const soundFontUrl = options.soundFontUrl || `${assetBaseUrl}/soundfont/sonivox.sf2`;
    const playerMode = options.playerMode ?? alphaTab.PlayerMode.EnabledSynthesizer;
    const outputMode = options.outputMode ?? alphaTab.PlayerOutputMode.WebAudioScriptProcessor;

    const api = new alphaTab.AlphaTabApi(scoreHost, {
      core: {
        engine: 'svg',
        useWorkers: false,
        enableLazyLoading: false,
        includeNoteBounds: true,
        fontDirectory: `${assetBaseUrl}/font/`,
        scriptFile: scriptFileUrl,
      },
      display: {
        barsPerRow: options.barsPerRow || 3,
      },
      player: {
        enablePlayer: true,
        playerMode,
        outputMode,
        soundFont: soundFontUrl,
        enableCursor: true,
        enableElementHighlighting: true,
        enableAnimatedBeatCursor: false,
      },
    });

    function setText(element, value) {
      if (element) element.textContent = value;
    }

    function clearActiveScoreState() {
      state.scoreLoaded = false;
      state.positionTick = 0;
      state.currentMeasureIndex = null;
      state.currentMeasureNumber = null;
      scoreHost.hidden = true;
      setText(cursorStatus, 'No active measure');
    }

    function updateControls() {
      const ready = !state.loading
        && state.scoreLoaded
        && state.playerReady
        && state.runtimeResult?.status === 'PASS';
      playButton.disabled = !ready;
      stopButton.disabled = !ready;
    }

    function measureStarts() {
      const track = api.score?.tracks?.[0];
      const staff = track?.staves?.[0];
      if (!staff || !Array.isArray(staff.bars)) return [];
      const starts = [];
      for (let index = 0; index < staff.bars.length; index += 1) {
        const beat = firstMusicalBeat(staff.bars[index]);
        if (!beat || !Number.isFinite(beat.absolutePlaybackStart)) continue;
        starts.push({
          index,
          tick: beat.absolutePlaybackStart,
          number: String(index + 1),
        });
      }
      return starts;
    }

    function locateMeasureForTick(tick) {
      const starts = measureStarts();
      let selected = starts[0] || null;
      for (const entry of starts) {
        if (entry.tick > tick) break;
        selected = entry;
      }
      return selected;
    }

    function updateCursorStatus(tick) {
      const measure = locateMeasureForTick(tick);
      state.positionTick = tick;
      state.currentMeasureIndex = measure?.index ?? null;
      state.currentMeasureNumber = measure?.number ?? null;
      setText(
        cursorStatus,
        measure ? `Measure ${measure.number} · tick ${Math.round(tick)}` : `Tick ${Math.round(tick)}`,
      );
    }

    function focusMeasure(location) {
      if (!state.scoreLoaded || state.runtimeResult?.status !== 'PASS') return false;
      let index = Number.isInteger(location?.measureIndex) ? location.measureIndex : null;
      if (index === null && location?.measure !== null && location?.measure !== undefined) {
        const visible = String(location.measure);
        const masterBars = api.score?.masterBars || [];
        index = masterBars.findIndex((_, candidateIndex) => String(candidateIndex + 1) === visible);
        if (index < 0) index = null;
      }
      if (index === null || index < 0) return false;
      const start = measureStarts().find((entry) => entry.index === index);
      if (!start) return false;
      api.tickPosition = start.tick;
      updateCursorStatus(start.tick);
      return true;
    }

    function renderIssues(issues) {
      issueList.replaceChildren();
      const safeIssues = Array.isArray(issues) ? issues : [];
      state.issueCount = safeIssues.length;
      setText(issueCount, String(safeIssues.length));

      if (safeIssues.length === 0) {
        const empty = createElement(documentRef, 'li', 'workbench-issue workbench-issue--empty', 'No blocking issues.');
        issueList.appendChild(empty);
        return;
      }

      for (const issue of safeIssues) {
        const item = createElement(documentRef, 'li', 'workbench-issue');
        const button = createElement(documentRef, 'button', 'workbench-issue__button');
        button.type = 'button';
        const code = typeof issue?.code === 'string' ? issue.code : 'UPLOAD_ISSUE';
        const message = typeof issue?.message === 'string' ? issue.message : 'MusicXML processing issue.';
        const measure = issue?.location?.measure ?? issue?.location?.measureIndex;
        const locationText = measure === null || measure === undefined ? '' : ` · measure ${measure}`;
        button.textContent = `${code}${locationText}: ${message}`;
        button.addEventListener('click', () => focusMeasure(issue?.location || null));
        item.appendChild(button);
        issueList.appendChild(item);
      }
    }

    function setRuntimeResult(result) {
      assert(result && typeof result === 'object', 'Upload result is invalid.');
      assert(result.status === 'PASS' || result.status === 'BLOCKED', 'Upload result status is invalid.');
      state.runtimeResult = result;
      state.lastError = null;
      setText(documentStatus, result.status);
      setText(routeStatus, result.route || 'UNRESOLVED');
      renderIssues(result.preflight?.issues || []);

      if (result.status !== 'PASS') {
        clearActiveScoreState();
        updateControls();
        return false;
      }

      assert(typeof result.musicXml === 'string' && result.musicXml.length > 0, 'PASS result is missing renderer MusicXML.');
      clearActiveScoreState();
      const bytes = new TextEncoder().encode(result.musicXml);
      const accepted = api.load(bytes);
      if (!accepted) throw new Error('alphaTab rejected renderer MusicXML.');
      return true;
    }

    async function loadFile(file) {
      assert(file && typeof file.name === 'string', 'A MusicXML file is required.');
      if (!extensionOf(file.name)) throw new Error('Only .musicxml and .xml files are accepted.');
      if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_CLIENT_UPLOAD_BYTES) {
        throw new Error('MusicXML file exceeds the 5 MiB client boundary.');
      }

      state.loading = true;
      state.runtimeResult = null;
      state.lastError = null;
      if (state.playerReady) api.stop();
      clearActiveScoreState();
      setText(documentStatus, 'LOADING');
      setText(routeStatus, 'UNRESOLVED');
      updateControls();
      try {
        const result = await upload(file);
        return setRuntimeResult(result);
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        clearActiveScoreState();
        setText(documentStatus, 'ERROR');
        renderIssues([{
          code: 'WORKBENCH_UPLOAD_FAILED',
          message: state.lastError,
          location: null,
        }]);
        updateControls();
        throw error;
      } finally {
        state.loading = false;
        updateControls();
      }
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        await loadFile(file);
      } catch {
        // The visible issue panel is the user-facing error surface.
      }
    });

    playButton.addEventListener('click', () => {
      if (playButton.disabled) return;
      api.play();
    });
    stopButton.addEventListener('click', () => {
      if (stopButton.disabled) return;
      api.stop();
    });

    api.error.on((error) => {
      state.lastError = error?.message || String(error);
      clearActiveScoreState();
      setText(documentStatus, 'RENDER_ERROR');
      renderIssues([{
        code: 'ALPHATAB_RENDER_FAILED',
        message: state.lastError,
        location: null,
      }]);
      updateControls();
    });
    api.scoreLoaded.on(() => {
      state.scoreLoaded = true;
      scoreHost.hidden = false;
      updateControls();
    });
    api.playerReady.on(() => {
      state.playerReady = true;
      updateControls();
    });
    api.playerStateChanged.on((event) => {
      state.playerState = event?.state ?? null;
    });
    api.playerPositionChanged.on((event) => {
      if (state.scoreLoaded && Number.isFinite(event?.currentTick)) updateCursorStatus(event.currentTick);
    });

    clearActiveScoreState();
    renderIssues([]);
    setText(documentStatus, 'EMPTY');
    setText(routeStatus, 'UNRESOLVED');
    updateControls();

    return Object.freeze({
      api,
      loadFile,
      loadRuntimeResult: setRuntimeResult,
      focusMeasure,
      snapshot() {
        const track = state.scoreLoaded ? api.score?.tracks?.[0] : null;
        return Object.freeze({
          ...state,
          scoreTracks: state.scoreLoaded ? (api.score?.tracks?.length || 0) : 0,
          scoreStaves: state.scoreLoaded ? (track?.staves?.length || 0) : 0,
          scoreMeasures: state.scoreLoaded ? (api.score?.masterBars?.length || 0) : 0,
          scoreHidden: scoreHost.hidden,
          playDisabled: playButton.disabled,
          stopDisabled: stopButton.disabled,
        });
      },
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        api.destroy();
      },
    });
  }

  global.GuitarTabWorkbench = Object.freeze({
    mount,
    MAX_CLIENT_UPLOAD_BYTES,
    ALLOWED_EXTENSIONS: Object.freeze([...ALLOWED_EXTENSIONS]),
  });
}(window));
