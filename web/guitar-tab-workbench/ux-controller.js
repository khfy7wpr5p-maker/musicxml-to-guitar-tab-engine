(function attachGuitarTabWorkbenchUx(global) {
  'use strict';

  const MIN_SCALE = 0.6;
  const MAX_SCALE = 1.6;
  const SCALE_STEP = 0.1;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function formatDuration(milliseconds) {
    const safeMilliseconds = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
    const totalSeconds = Math.floor(safeMilliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function selectedCanonicalEvent(snapshot) {
    const selected = snapshot?.selectedEvent;
    const canonical = snapshot?.runtimeResult?.canonicalTabResult;
    if (!selected || !canonical) return null;
    const measure = canonical.measures?.[selected.measureIndex];
    if (!measure || !Array.isArray(measure.events)) return null;
    if (selected.route === 'MONO_V1' && Number.isInteger(selected.eventIndex)) {
      return measure.events[selected.eventIndex] || null;
    }
    if (selected.route === 'POLY_V2' && typeof selected.sourceEventId === 'string') {
      return measure.events.find((event) => event?.sourceEventId === selected.sourceEventId) || null;
    }
    return null;
  }

  function selectedPosition(snapshot, event) {
    const selected = snapshot?.selectedEvent;
    const canonical = snapshot?.runtimeResult?.canonicalTabResult;
    const dispositions = Array.isArray(canonical?.noteDispositions) ? canonical.noteDispositions : [];
    const disposition = typeof selected?.sourceEventId === 'string'
      ? dispositions.find((entry) => entry?.sourceEventId === selected.sourceEventId)
      : null;
    const candidates = [
      event?.selectedPosition,
      event?.position,
      event?.guitarPosition,
      disposition?.selectedPosition,
      disposition?.position,
      disposition?.guitarPosition,
    ];
    return candidates.find((position) => (
      position
      && Number.isInteger(position.string)
      && Number.isInteger(position.fret)
    )) || null;
  }

  function alternativeCount(event) {
    const arrays = [event?.alternativePositions, event?.alternatives];
    const value = arrays.find((entry) => Array.isArray(entry));
    return value ? value.length : null;
  }

  function mount(root, host) {
    assert(root && root.ownerDocument, 'Workbench UX root is required.');
    assert(host && host.workbench && host.workbench.api, 'Workbench host is required.');

    const documentRef = root.ownerDocument;
    const workbench = host.workbench;
    const api = workbench.api;
    const tabButtons = [...root.querySelectorAll('[data-inspector-tab]')];
    const tabPanels = [...root.querySelectorAll('[data-inspector-panel]')];
    const tabOpeners = [...root.querySelectorAll('[data-inspector-open]')];
    const zoomOutButton = root.querySelector('[data-role="zoom-out"]');
    const zoomInButton = root.querySelector('[data-role="zoom-in"]');
    const fitWidthButton = root.querySelector('[data-role="fit-width"]');
    const fitPageButton = root.querySelector('[data-role="fit-page"]');
    const zoomStatus = root.querySelector('[data-role="zoom-status"]');
    const speedControl = root.querySelector('[data-role="playback-speed"]');
    const positionStatus = root.querySelector('[data-role="position-status"]');
    const measureStatus = root.querySelector('[data-role="measure-status"]');
    const selectionStatus = root.querySelector('[data-role="selection-status"]');
    const scoreContext = root.querySelector('[data-role="score-context"]');
    const issueCountTab = root.querySelector('[data-role="issue-count-tab"]');
    const issueList = root.querySelector('[data-role="issues"]');
    const documentPanelStatus = root.querySelector('[data-role="document-panel-status"]');
    const documentSource = root.querySelector('[data-role="document-source"]');
    const documentRoute = root.querySelector('[data-role="document-route"]');
    const documentRevision = root.querySelector('[data-role="document-revision"]');
    const documentSha = root.querySelector('[data-role="document-sha"]');
    const fingeringPitch = root.querySelector('[data-role="fingering-pitch"]');
    const fingeringString = root.querySelector('[data-role="fingering-string"]');
    const fingeringFret = root.querySelector('[data-role="fingering-fret"]');
    const fingeringAlternatives = root.querySelector('[data-role="fingering-alternatives"]');
    const fingeringVoice = root.querySelector('[data-role="fingering-voice"]');
    const fingeringSourceEvent = root.querySelector('[data-role="fingering-source-event"]');
    const fingeringGroup = root.querySelector('[data-role="fingering-group"]');
    const fingeringTieChain = root.querySelector('[data-role="fingering-tie-chain"]');
    const fingeringContext = root.querySelector('[data-role="fingering-context"]');

    assert(tabButtons.length === 4 && tabPanels.length === 4, 'Workbench inspector tabs are incomplete.');
    assert(
      zoomOutButton && zoomInButton && fitWidthButton && fitPageButton && zoomStatus
      && speedControl && positionStatus && measureStatus && selectionStatus && scoreContext
      && issueCountTab && issueList && documentPanelStatus && documentSource && documentRoute
      && documentRevision && documentSha && fingeringPitch && fingeringString && fingeringFret
      && fingeringAlternatives && fingeringVoice && fingeringSourceEvent && fingeringGroup
      && fingeringTieChain && fingeringContext,
      'Workbench UX controls are incomplete.',
    );

    let activeTab = 'note';
    let previousSecond = -1;
    let currentPosition = Object.freeze({ currentTime: 0, endTime: 0, originalTempo: null, modifiedTempo: null });

    function activateTab(name, focus = false) {
      if (!tabButtons.some((button) => button.dataset.inspectorTab === name)) return false;
      activeTab = name;
      for (const button of tabButtons) {
        const selected = button.dataset.inspectorTab === name;
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
        if (selected && focus) button.focus();
      }
      for (const panel of tabPanels) panel.hidden = panel.dataset.inspectorPanel !== name;
      root.dataset.inspectorTab = name;
      return true;
    }

    function setViewPreset(name, scale, barsPerRow) {
      const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE);
      api.settings.display.scale = nextScale;
      if (Number.isInteger(barsPerRow)) api.settings.display.barsPerRow = barsPerRow;
      api.updateSettings();
      api.render();
      root.dataset.viewPreset = name;
      zoomStatus.textContent = `${Math.round(nextScale * 100)}%`;
      fitWidthButton.setAttribute('aria-pressed', name === 'fit-width' ? 'true' : 'false');
      fitPageButton.setAttribute('aria-pressed', name === 'fit-page' ? 'true' : 'false');
      return nextScale;
    }

    function changeZoom(delta) {
      const current = Number.isFinite(api.settings.display.scale) ? api.settings.display.scale : 1;
      const next = Math.round((current + delta) * 10) / 10;
      return setViewPreset('custom', next, api.settings.display.barsPerRow);
    }

    function updatePosition(event) {
      const currentTime = Number.isFinite(event?.currentTime) ? event.currentTime : 0;
      const endTime = Number.isFinite(event?.endTime) ? event.endTime : (Number.isFinite(api.endTime) ? api.endTime : 0);
      const second = Math.floor(currentTime / 1000);
      currentPosition = Object.freeze({
        currentTime,
        endTime,
        originalTempo: Number.isFinite(event?.originalTempo) ? event.originalTempo : null,
        modifiedTempo: Number.isFinite(event?.modifiedTempo) ? event.modifiedTempo : null,
      });
      if (second !== previousSecond || event?.isSeek) {
        previousSecond = second;
        positionStatus.textContent = `${formatDuration(currentTime)} / ${formatDuration(endTime)}`;
      }
      syncContext();
    }

    function syncContext() {
      const snapshot = workbench.snapshot();
      const result = snapshot.runtimeResult;
      const selected = snapshot.selectedEvent;
      const activeMeasure = selected?.visibleMeasureNumber ?? snapshot.currentMeasureNumber ?? null;
      const sourceName = snapshot.sourceFileName || result?.input?.fileName || (host.mode === 'preview' ? 'CI preview fixture' : null);
      const sourceSha = snapshot.sourceSha256 || result?.input?.sha256 || null;
      const selectedPitch = selected?.pitch?.written || null;
      const canonicalEvent = selectedCanonicalEvent(snapshot);
      const position = selectedPosition(snapshot, canonicalEvent);
      const alternatives = alternativeCount(canonicalEvent);

      root.dataset.selection = selected ? 'note' : 'none';
      if (activeMeasure !== null && activeMeasure !== undefined) root.dataset.activeMeasure = String(activeMeasure);
      else delete root.dataset.activeMeasure;

      measureStatus.textContent = activeMeasure === null || activeMeasure === undefined ? '—' : String(activeMeasure);
      selectionStatus.textContent = selectedPitch || 'None';
      issueCountTab.textContent = String(snapshot.issueCount || 0);
      documentPanelStatus.textContent = result?.status || 'EMPTY';
      documentSource.textContent = sourceName || 'No document loaded';
      documentRoute.textContent = result?.route || 'UNRESOLVED';
      documentRevision.textContent = String(snapshot.revisionCommandCount || snapshot.revisionNumber || 0);
      documentSha.textContent = sourceSha || '—';

      const playerState = snapshot.playerState;
      root.dataset.playerState = playerState === null || playerState === undefined ? 'idle' : String(playerState);

      if (result?.status === 'PASS') {
        const measureText = activeMeasure === null || activeMeasure === undefined ? 'No active measure' : `Measure ${activeMeasure}`;
        const tempo = currentPosition.originalTempo;
        scoreContext.textContent = tempo ? `${measureText} · ♩ ${Math.round(tempo)}` : measureText;
      } else {
        scoreContext.textContent = result?.status === 'BLOCKED' ? 'Score blocked by validation' : 'No score loaded';
      }

      fingeringPitch.textContent = selectedPitch || '—';
      fingeringString.textContent = position ? String(position.string) : '—';
      fingeringFret.textContent = position ? String(position.fret) : '—';
      fingeringAlternatives.textContent = alternatives === null ? '—' : String(alternatives);
      fingeringVoice.textContent = selected?.voice ? String(selected.voice) : '—';
      fingeringSourceEvent.textContent = selected?.route === 'POLY_V2'
        ? selected.sourceEventId
        : (selected?.eventId || '—');
      fingeringGroup.textContent = selected?.route === 'POLY_V2'
        ? (selected.sourceGroupId || 'single')
        : '—';
      if (Array.isArray(selected?.sourceTieEventIds)) {
        fingeringTieChain.textContent = selected.sourceTieEventIds.length > 1
          ? `${selected.sourceTieEventIds.length} events`
          : 'single event';
      } else if (selected?.tied) {
        fingeringTieChain.textContent = 'guarded MONO chain';
      } else {
        fingeringTieChain.textContent = '—';
      }

      if (!selected) {
        fingeringContext.textContent = 'Select a note to inspect the current TAB placement.';
      } else if (selected.route === 'POLY_V2') {
        const rendererVoice = Number.isInteger(selected.rendererVoiceOrdinal)
          ? ` · renderer voice ${selected.rendererVoiceOrdinal + 1}`
          : '';
        const duplicate = Number.isInteger(selected.rendererDuplicateOrdinal) && selected.rendererDuplicateOrdinal > 0
          ? ` · unison ordinal ${selected.rendererDuplicateOrdinal + 1}`
          : '';
        const tie = selected.sourceTieEventIds?.length > 1
          ? ` · tie chain ${selected.sourceTieEventIds.length} proven`
          : '';
        const placement = position ? ` · string ${position.string} fret ${position.fret}` : '';
        fingeringContext.textContent = `POLY_V2 · measure ${selected.visibleMeasureNumber ?? selected.measureIndex + 1} · voice ${selected.voice}${rendererVoice}${duplicate}${tie}${placement}`;
      } else if (position) {
        const tieText = selected.tied ? ' · tie-chain guarded' : '';
        fingeringContext.textContent = `${selected.route} · measure ${selected.visibleMeasureNumber ?? selected.measureIndex + 1}${tieText}`;
      } else {
        fingeringContext.textContent = `${selected.route} · placement remains authoritative in the rendered TAB.`;
      }
    }

    function syncSoon() {
      global.queueMicrotask(syncContext);
    }

    for (const button of tabButtons) {
      button.addEventListener('click', () => activateTab(button.dataset.inspectorTab, false));
      button.addEventListener('keydown', (event) => {
        const index = tabButtons.indexOf(button);
        let target = null;
        if (event.key === 'ArrowRight') target = tabButtons[(index + 1) % tabButtons.length];
        else if (event.key === 'ArrowLeft') target = tabButtons[(index - 1 + tabButtons.length) % tabButtons.length];
        else if (event.key === 'Home') target = tabButtons[0];
        else if (event.key === 'End') target = tabButtons[tabButtons.length - 1];
        if (!target) return;
        event.preventDefault();
        activateTab(target.dataset.inspectorTab, true);
      });
    }

    for (const opener of tabOpeners) {
      opener.addEventListener('click', (event) => {
        event.preventDefault();
        activateTab(opener.dataset.inspectorOpen, false);
        documentRef.querySelector('#workbench-inspector')?.scrollIntoView({ block: 'nearest' });
      });
    }

    zoomOutButton.addEventListener('click', () => changeZoom(-SCALE_STEP));
    zoomInButton.addEventListener('click', () => changeZoom(SCALE_STEP));
    fitWidthButton.addEventListener('click', () => setViewPreset('fit-width', 1, -1));
    fitPageButton.addEventListener('click', () => setViewPreset('fit-page', 0.8, 3));
    speedControl.addEventListener('change', () => {
      const percentage = Number.parseInt(speedControl.value, 10);
      if (!Number.isSafeInteger(percentage) || percentage < 50 || percentage > 150) {
        speedControl.value = '100';
        api.playbackSpeed = 1;
        return;
      }
      api.playbackSpeed = percentage / 100;
    });

    issueList.addEventListener('click', syncSoon);
    root.querySelector('[data-role="cancel-edit"]')?.addEventListener('click', syncSoon);
    root.querySelector('[data-role="apply-edit"]')?.addEventListener('click', syncSoon);

    api.scoreLoaded.on(syncSoon);
    api.playerReady.on(syncSoon);
    api.playerStateChanged.on(syncSoon);
    api.noteMouseDown.on(syncSoon);
    api.playerPositionChanged.on(updatePosition);

    const issueObserver = new MutationObserver(syncSoon);
    issueObserver.observe(issueList, { childList: true, subtree: true, characterData: true });

    const initialScale = Number.isFinite(api.settings.display.scale) ? api.settings.display.scale : 1;
    zoomStatus.textContent = `${Math.round(initialScale * 100)}%`;
    speedControl.value = String(Math.round((Number.isFinite(api.playbackSpeed) ? api.playbackSpeed : 1) * 100));
    activateTab('note', false);
    syncContext();
    host.ready.then(syncContext, syncContext);

    return Object.freeze({
      activateTab,
      setViewPreset,
      snapshot() {
        return Object.freeze({
          activeTab,
          viewPreset: root.dataset.viewPreset || 'default',
          scale: api.settings.display.scale,
          barsPerRow: api.settings.display.barsPerRow,
          playbackSpeed: api.playbackSpeed,
          position: currentPosition,
        });
      },
      destroy() {
        issueObserver.disconnect();
      },
    });
  }

  const root = global.document.querySelector('[data-guitar-tab-workbench]');
  const host = global.__workbenchHost;
  if (!root || !host) throw new Error('Workbench UX boot requires the mounted host.');

  global.GuitarTabWorkbenchUx = Object.freeze({ mount, formatDuration });
  global.__workbenchUx = mount(root, host);
}(window));
