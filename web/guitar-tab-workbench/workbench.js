(function attachGuitarTabWorkbench(global) {
  'use strict';

  const MAX_CLIENT_UPLOAD_BYTES = 5 * 1024 * 1024;
  const MAX_REVISION_COMMANDS = 128;
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

  function cloneCommand(command) {
    if (command && typeof command.sourceEventId === 'string') {
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
    }
    return {
      measureIndex: command.measureIndex,
      eventIndex: command.eventIndex,
      eventId: command.eventId,
      pitch: {
        step: command.pitch.step,
        alter: command.pitch.alter,
        octave: command.pitch.octave,
      },
    };
  }

  function mount(options) {
    assert(options && typeof options === 'object', 'Workbench options are required.');
    const root = options.root;
    const alphaTab = options.alphaTab;
    const upload = options.upload;
    const edit = options.edit;
    const polyphonicEdit = options.polyphonicEdit;
    assert(root && root.ownerDocument, 'A workbench root element is required.');
    assert(alphaTab && typeof alphaTab.AlphaTabApi === 'function', 'alphaTab is required.');
    assert(typeof upload === 'function', 'A bounded upload function is required.');
    assert(typeof edit === 'function', 'A bounded structured-edit function is required.');
    assert(
      polyphonicEdit === undefined || typeof polyphonicEdit === 'function',
      'polyphonicEdit must be a function when provided.',
    );

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
    const selectedNote = root.querySelector('[data-role="selected-note"]');
    const editStatus = root.querySelector('[data-role="edit-status"]');
    const editStep = root.querySelector('[data-role="edit-step"]');
    const editAlter = root.querySelector('[data-role="edit-alter"]');
    const editOctave = root.querySelector('[data-role="edit-octave"]');
    const applyEditButton = root.querySelector('[data-role="apply-edit"]');
    const cancelEditButton = root.querySelector('[data-role="cancel-edit"]');

    assert(
      fileInput && playButton && stopButton && scoreHost && issueList
      && selectedNote && editStatus && editStep && editAlter && editOctave
      && applyEditButton && cancelEditButton,
      'Workbench markup is incomplete.',
    );

    const state = {
      destroyed: false,
      loading: false,
      editing: false,
      runtimeResult: null,
      scoreLoaded: false,
      playerReady: false,
      playerState: null,
      positionTick: 0,
      currentMeasureIndex: null,
      currentMeasureNumber: null,
      issueCount: 0,
      revisionNumber: 0,
      selectedEvent: null,
      lastError: null,
    };

    const session = {
      sourceFileName: null,
      sourceBytes: null,
      expectedInputSha256: null,
      commands: [],
      pendingFocus: null,
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

    function clearSelection(message = 'Select a note in the score or TAB.') {
      state.selectedEvent = null;
      setText(selectedNote, 'None');
      setText(editStatus, message);
      editStep.value = 'C';
      editAlter.value = '0';
      editOctave.value = '4';
    }

    function clearSession() {
      session.sourceFileName = null;
      session.sourceBytes = null;
      session.expectedInputSha256 = null;
      session.commands = [];
      session.pendingFocus = null;
      state.revisionNumber = 0;
      clearSelection();
    }

    function clearActiveScoreState() {
      state.scoreLoaded = false;
      state.positionTick = 0;
      state.currentMeasureIndex = null;
      state.currentMeasureNumber = null;
      scoreHost.hidden = true;
      setText(cursorStatus, 'No active measure');
    }

    function canEdit() {
      const route = state.runtimeResult?.route;
      const routeReady = route === 'MONO_V1'
        ? typeof edit === 'function'
        : route === 'POLY_V2'
          ? typeof polyphonicEdit === 'function' && !state.selectedEvent?.groupContainsTies
          : false;
      return Boolean(
        !state.loading
        && !state.editing
        && state.scoreLoaded
        && state.runtimeResult?.status === 'PASS'
        && routeReady
        && state.selectedEvent
        && session.sourceBytes
        && session.expectedInputSha256
        && session.commands.length < MAX_REVISION_COMMANDS,
      );
    }

    function updateControls() {
      const busy = state.loading || state.editing;
      const playbackReady = !busy
        && state.scoreLoaded
        && state.playerReady
        && state.runtimeResult?.status === 'PASS';
      fileInput.disabled = busy;
      playButton.disabled = !playbackReady;
      stopButton.disabled = !playbackReady;
      applyEditButton.disabled = !canEdit();
      cancelEditButton.disabled = busy || !state.selectedEvent;
      editStep.disabled = busy || !state.selectedEvent || Boolean(state.selectedEvent?.groupContainsTies);
      editAlter.disabled = busy || !state.selectedEvent || Boolean(state.selectedEvent?.groupContainsTies);
      editOctave.disabled = busy || !state.selectedEvent || Boolean(state.selectedEvent?.groupContainsTies);
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

    function visibleMeasureNumber(measure) {
      return measure?.visibleMeasureNumber ?? measure?.number ?? null;
    }

    function focusMeasure(location) {
      if (!state.scoreLoaded || state.runtimeResult?.status !== 'PASS') return false;
      let index = Number.isInteger(location?.measureIndex) ? location.measureIndex : null;
      if (index === null && location?.measure !== null && location?.measure !== undefined) {
        const visible = String(location.measure);
        const measures = state.runtimeResult?.canonicalTabResult?.measures || [];
        index = measures.findIndex((measure) => String(visibleMeasureNumber(measure)) === visible);
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
        const empty = createElement(
          documentRef,
          'li',
          'workbench-issue workbench-issue--empty',
          'No blocking issues.',
        );
        issueList.appendChild(empty);
        return;
      }

      for (const issue of safeIssues) {
        const item = createElement(documentRef, 'li', 'workbench-issue');
        const button = createElement(documentRef, 'button', 'workbench-issue__button');
        button.type = 'button';
        const code = typeof issue?.code === 'string' ? issue.code : 'UPLOAD_ISSUE';
        const message = typeof issue?.message === 'string'
          ? issue.message
          : 'MusicXML processing issue.';
        const visibleMeasure = issue?.location?.measure
          ?? (Number.isInteger(issue?.location?.measureIndex)
            ? issue.location.measureIndex + 1
            : null);
        const locationText = visibleMeasure === null || visibleMeasure === undefined
          ? ''
          : ` · measure ${visibleMeasure}`;
        button.textContent = `${code}${locationText}: ${message}`;
        button.addEventListener('click', () => focusMeasure(issue?.location || null));
        item.appendChild(button);
        issueList.appendChild(item);
      }
    }

    function renderMonoSelectedEvent(event, measure) {
      if (!event || event.type !== 'note' || !event.pitch) {
        clearSelection('Only note events can be edited.');
        updateControls();
        return false;
      }
      state.selectedEvent = {
        route: 'MONO_V1',
        measureIndex: measure.measureIndex,
        eventIndex: event.eventIndex,
        eventId: event.eventId,
        visibleMeasureNumber: measure.visibleMeasureNumber,
        pitch: {
          step: event.pitch.step,
          alter: event.pitch.alter,
          octave: event.pitch.octave,
          written: event.pitch.written,
          midi: event.pitch.midi,
        },
        tied: Boolean(event.rhythm?.tieStart || event.rhythm?.tieStop),
        groupContainsTies: false,
      };
      setText(
        selectedNote,
        `${event.pitch.written} · measure ${measure.visibleMeasureNumber} · event ${event.eventIndex + 1}`,
      );
      editStep.value = event.pitch.step;
      editAlter.value = String(event.pitch.alter);
      editOctave.value = String(event.pitch.octave);
      if (state.selectedEvent.tied) {
        setText(editStatus, `Ready · tied chain validated on Apply · revision ${state.revisionNumber}`);
      } else {
        setText(editStatus, `Ready · revision ${state.revisionNumber}`);
      }
      updateControls();
      return true;
    }

    function polyphonicIndexes() {
      const canonical = state.runtimeResult?.canonicalTabResult;
      const dispositions = new Map();
      for (const entry of canonical?.noteDispositions || []) {
        if (entry && typeof entry.sourceEventId === 'string') dispositions.set(entry.sourceEventId, entry);
      }
      const events = new Map();
      for (const measure of canonical?.measures || []) {
        for (const event of measure?.events || []) {
          if (event && typeof event.sourceEventId === 'string') events.set(event.sourceEventId, event);
        }
      }
      const groupsByEvent = new Map();
      for (const group of canonical?.simultaneousGroups || []) {
        if (!group || !Array.isArray(group.sourceEventIds)) continue;
        for (const sourceEventId of group.sourceEventIds) {
          if (groupsByEvent.has(sourceEventId)) groupsByEvent.set(sourceEventId, null);
          else groupsByEvent.set(sourceEventId, group);
        }
      }
      return { canonical, dispositions, events, groupsByEvent };
    }

    function rendererPitchedOnsetOrdinal(note) {
      const bar = note?.beat?.voice?.bar;
      const targetStart = note?.beat?.absolutePlaybackStart;
      if (!bar || !Array.isArray(bar.voices) || !Number.isFinite(targetStart)) return null;
      const starts = [];
      for (const voice of bar.voices) {
        if (!voice || !Array.isArray(voice.beats)) continue;
        for (const beat of voice.beats) {
          if (!beat || !Array.isArray(beat.notes) || beat.notes.length === 0) continue;
          if (!Number.isFinite(beat.absolutePlaybackStart)) return null;
          starts.push(beat.absolutePlaybackStart);
        }
      }
      const ordered = [...new Set(starts)].sort((left, right) => left - right);
      const ordinal = ordered.indexOf(targetStart);
      if (ordinal < 0) return null;
      return { ordinal, count: ordered.length };
    }

    function resolvePolyphonicRendererNote(note, measureIndex) {
      const mapping = rendererPitchedOnsetOrdinal(note);
      const midi = note?.realValue;
      if (!mapping || !Number.isSafeInteger(midi)) return null;

      const { canonical, dispositions, groupsByEvent } = polyphonicIndexes();
      const measure = canonical?.measures?.[measureIndex];
      if (!measure || !Array.isArray(measure.events)) return null;
      const renderedNotes = measure.events.filter((event) => {
        const disposition = dispositions.get(event?.sourceEventId);
        return event?.type === 'note'
          && disposition?.disposition === 'KEEP'
          && disposition?.targetPitch
          && Number.isSafeInteger(event.onsetDivisions);
      });
      const canonicalOnsets = [...new Set(renderedNotes.map((event) => event.onsetDivisions))]
        .sort((left, right) => left - right);
      if (canonicalOnsets.length !== mapping.count || mapping.ordinal >= canonicalOnsets.length) return null;
      const onsetDivisions = canonicalOnsets[mapping.ordinal];
      const candidates = renderedNotes.filter((event) => {
        const disposition = dispositions.get(event.sourceEventId);
        return event.onsetDivisions === onsetDivisions && disposition.targetPitch.midi === midi;
      });
      if (candidates.length !== 1) return null;

      const event = candidates[0];
      const group = groupsByEvent.get(event.sourceEventId) || null;
      if (groupsByEvent.has(event.sourceEventId) && group === null) return null;
      const sourceGroupEventIds = group ? [...group.sourceEventIds] : [event.sourceEventId];
      if (sourceGroupEventIds.length < 1 || new Set(sourceGroupEventIds).size !== sourceGroupEventIds.length) {
        return null;
      }
      return {
        measureIndex,
        sourceOrder: event.sourceOrder,
        sourceEventId: event.sourceEventId,
        sourceGroupId: group?.groupId ?? null,
        sourceGroupEventIds,
      };
    }

    function renderPolySelectedEvent(event, measure, groupIdentity) {
      if (!event || event.type !== 'note' || !event.pitch) {
        clearSelection('Only pitched POLY_V2 source events can be edited.');
        updateControls();
        return false;
      }
      const { events } = polyphonicIndexes();
      const groupMembers = groupIdentity.sourceGroupEventIds.map((sourceEventId) => events.get(sourceEventId));
      if (groupMembers.some((member) => !member || member.type !== 'note')) {
        clearSelection('The selected polyphonic group could not be resolved safely.');
        updateControls();
        return false;
      }
      const groupContainsTies = groupMembers.some((member) => member.tieStart || member.tieStop);
      const number = visibleMeasureNumber(measure);
      state.selectedEvent = {
        route: 'POLY_V2',
        measureIndex: groupIdentity.measureIndex,
        sourceOrder: event.sourceOrder,
        sourceEventId: event.sourceEventId,
        sourceGroupId: groupIdentity.sourceGroupId,
        sourceGroupEventIds: [...groupIdentity.sourceGroupEventIds],
        visibleMeasureNumber: number,
        pitch: {
          step: event.pitch.step,
          alter: event.pitch.alter,
          octave: event.pitch.octave,
          written: event.pitch.written,
          midi: event.pitch.midi,
        },
        tied: Boolean(event.tieStart || event.tieStop),
        groupContainsTies,
      };
      setText(
        selectedNote,
        `${event.pitch.written} · measure ${number} · source ${event.sourceOrder + 1}`,
      );
      editStep.value = event.pitch.step;
      editAlter.value = String(event.pitch.alter);
      editOctave.value = String(event.pitch.octave);
      if (groupContainsTies) {
        setText(editStatus, 'Blocked · simultaneous group contains tied notes.');
      } else {
        setText(
          editStatus,
          `Ready · POLY_V2 group ${groupIdentity.sourceGroupEventIds.length} acknowledged · revision ${state.revisionNumber}`,
        );
      }
      updateControls();
      return true;
    }

    function selectEventByIdentity(identity) {
      if (state.runtimeResult?.status !== 'PASS') {
        clearSelection('Load a valid score before selecting a structured event.');
        updateControls();
        return false;
      }
      const route = state.runtimeResult.route;
      const measures = state.runtimeResult.canonicalTabResult?.measures;
      if (!Array.isArray(measures)) return false;

      if (route === 'MONO_V1') {
        const measure = measures[identity?.measureIndex];
        const event = measure?.events?.[identity?.eventIndex];
        if (!measure || !event || (identity.eventId && event.eventId !== identity.eventId)) {
          clearSelection('The selected renderer note could not be matched to the canonical event.');
          updateControls();
          return false;
        }
        return renderMonoSelectedEvent(event, measure);
      }

      if (route === 'POLY_V2') {
        if (typeof polyphonicEdit !== 'function') {
          clearSelection('POLY_V2 editing is not connected to this host.');
          updateControls();
          return false;
        }
        const measure = measures[identity?.measureIndex];
        const event = measure?.events?.[identity?.sourceOrder];
        if (
          !measure
          || !event
          || event.sourceOrder !== identity?.sourceOrder
          || event.sourceEventId !== identity?.sourceEventId
        ) {
          clearSelection('The selected renderer note could not be matched to one POLY_V2 source event.');
          updateControls();
          return false;
        }
        const { groupsByEvent } = polyphonicIndexes();
        const group = groupsByEvent.get(event.sourceEventId) || null;
        if (groupsByEvent.has(event.sourceEventId) && group === null) {
          clearSelection('The selected source event has ambiguous simultaneous-group identity.');
          updateControls();
          return false;
        }
        const expectedGroupId = group?.groupId ?? null;
        const expectedIds = group ? [...group.sourceEventIds] : [event.sourceEventId];
        const acknowledgedIds = Array.isArray(identity?.sourceGroupEventIds)
          ? identity.sourceGroupEventIds
          : expectedIds;
        if (
          (identity?.sourceGroupId !== undefined && identity.sourceGroupId !== expectedGroupId)
          || acknowledgedIds.length !== expectedIds.length
          || acknowledgedIds.some((value, index) => value !== expectedIds[index])
        ) {
          clearSelection('The selected source event no longer matches its simultaneous-group identity.');
          updateControls();
          return false;
        }
        return renderPolySelectedEvent(event, measure, {
          measureIndex: measure.index,
          sourceOrder: event.sourceOrder,
          sourceEventId: event.sourceEventId,
          sourceGroupId: expectedGroupId,
          sourceGroupEventIds: expectedIds,
        });
      }

      clearSelection('Structured pitch editing is not enabled for this route.');
      updateControls();
      return false;
    }

    function selectNote(note) {
      const bar = note?.beat?.voice?.bar;
      const measureIndex = Number.isInteger(bar?.masterBar?.index)
        ? bar.masterBar.index
        : (Number.isInteger(bar?.index) ? bar.index : null);
      if (measureIndex === null) {
        clearSelection('The clicked note does not expose a stable measure location.');
        updateControls();
        return false;
      }

      if (state.runtimeResult?.route === 'MONO_V1') {
        const eventIndex = Number.isInteger(note?.beat?.index) ? note.beat.index : null;
        if (eventIndex === null) {
          clearSelection('The clicked note does not expose a stable measure/event location.');
          updateControls();
          return false;
        }
        return selectEventByIdentity({ measureIndex, eventIndex });
      }

      if (state.runtimeResult?.route === 'POLY_V2') {
        const identity = resolvePolyphonicRendererNote(note, measureIndex);
        if (!identity) {
          clearSelection('POLY_V2 renderer mapping is ambiguous or incomplete; no edit target was selected.');
          updateControls();
          return false;
        }
        return selectEventByIdentity(identity);
      }

      clearSelection('Structured pitch editing is not enabled for this route.');
      updateControls();
      return false;
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
        clearSelection('Load a valid score before editing.');
        updateControls();
        return false;
      }

      assert(
        typeof result.musicXml === 'string' && result.musicXml.length > 0,
        'PASS result is missing renderer MusicXML.',
      );
      clearActiveScoreState();
      if (result.route === 'MONO_V1') {
        clearSelection('Select a note in the score or TAB.');
      } else if (result.route === 'POLY_V2' && typeof polyphonicEdit === 'function') {
        clearSelection('Select a uniquely mappable polyphonic note in the score or TAB.');
      } else {
        clearSelection('Structured pitch editing is not connected for this route.');
      }
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
      clearSession();
      setText(documentStatus, 'LOADING');
      setText(routeStatus, 'UNRESOLVED');
      updateControls();

      try {
        const ownedBytes = new Uint8Array(await file.arrayBuffer());
        if (ownedBytes.byteLength !== file.size) {
          throw new Error('MusicXML file size changed while creating the workbench snapshot.');
        }
        const result = await upload(file, new Uint8Array(ownedBytes));
        if (
          result?.status === 'PASS'
          && (typeof result?.input?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(result.input.sha256))
        ) {
          throw new Error('PASS upload result is missing an exact source SHA-256 identity.');
        }

        if (result?.status === 'PASS') {
          session.sourceFileName = file.name;
          session.sourceBytes = ownedBytes;
          session.expectedInputSha256 = result.input.sha256;
          session.commands = [];
          state.revisionNumber = 0;
        }
        return setRuntimeResult(result);
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        clearActiveScoreState();
        clearSession();
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

    function requestedPitch() {
      const step = editStep.value;
      const alter = Number.parseInt(editAlter.value, 10);
      const octave = Number.parseInt(editOctave.value, 10);
      if (!/^[A-G]$/.test(step)) throw new Error('Pitch step must be A through G.');
      if (!Number.isSafeInteger(alter) || alter < -2 || alter > 2) {
        throw new Error('Pitch accidental must be between double-flat and double-sharp.');
      }
      if (!Number.isSafeInteger(octave) || octave < -1 || octave > 9) {
        throw new Error('Pitch octave must be between -1 and 9.');
      }
      return { step, alter, octave };
    }

    function commandForSelection(pitch) {
      if (state.selectedEvent?.route === 'POLY_V2') {
        return {
          measureIndex: state.selectedEvent.measureIndex,
          sourceOrder: state.selectedEvent.sourceOrder,
          sourceEventId: state.selectedEvent.sourceEventId,
          sourceGroupId: state.selectedEvent.sourceGroupId,
          sourceGroupEventIds: [...state.selectedEvent.sourceGroupEventIds],
          pitch,
        };
      }
      return {
        measureIndex: state.selectedEvent.measureIndex,
        eventIndex: state.selectedEvent.eventIndex,
        eventId: state.selectedEvent.eventId,
        pitch,
      };
    }

    function selectionIdentityForCommand(command) {
      if (typeof command.sourceEventId === 'string') {
        return {
          measureIndex: command.measureIndex,
          sourceOrder: command.sourceOrder,
          sourceEventId: command.sourceEventId,
          sourceGroupId: command.sourceGroupId,
          sourceGroupEventIds: [...command.sourceGroupEventIds],
        };
      }
      return {
        measureIndex: command.measureIndex,
        eventIndex: command.eventIndex,
        eventId: command.eventId,
      };
    }

    async function applySelectedEdit() {
      if (!canEdit()) return false;

      let pitch;
      try {
        pitch = requestedPitch();
      } catch (error) {
        setText(editStatus, error.message);
        return false;
      }

      const route = state.runtimeResult.route;
      const command = commandForSelection(pitch);
      const pendingCommands = [...session.commands.map(cloneCommand), cloneCommand(command)];
      if (pendingCommands.length > MAX_REVISION_COMMANDS) {
        setText(editStatus, 'Revision limit reached. Reload the source before continuing.');
        updateControls();
        return false;
      }

      const selectionIdentity = selectionIdentityForCommand(command);
      const editFunction = route === 'POLY_V2' ? polyphonicEdit : edit;
      assert(typeof editFunction === 'function', 'Structured edit host is not connected for this route.');

      state.editing = true;
      state.lastError = null;
      if (state.playerReady) api.stop();
      setText(editStatus, `Applying revision ${pendingCommands.length}…`);
      updateControls();

      try {
        const result = await editFunction({
          fileName: session.sourceFileName,
          bytes: new Uint8Array(session.sourceBytes),
          expectedInputSha256: session.expectedInputSha256,
          commands: pendingCommands.map(cloneCommand),
        });

        assert(result && typeof result === 'object', 'Edit result is invalid.');
        assert(result.status === 'PASS' || result.status === 'BLOCKED', 'Edit result status is invalid.');

        if (result.status === 'BLOCKED') {
          state.lastError = result.preflight?.issues?.[0]?.message || 'The edit was blocked.';
          renderIssues(result.preflight?.issues || []);
          setText(editStatus, `Blocked · revision ${pendingCommands.length} not applied`);
          focusMeasure(selectionIdentity);
          return false;
        }

        assert(result.route === route, 'Structured edit returned an unexpected route.');
        assert(
          typeof result.musicXml === 'string' && result.musicXml.length > 0,
          'PASS edit result is missing renderer MusicXML.',
        );
        assert(
          result.revision?.revisionNumber === pendingCommands.length,
          'PASS edit result revision number does not match the requested command chain.',
        );

        session.commands = pendingCommands.map(cloneCommand);
        state.revisionNumber = pendingCommands.length;
        session.pendingFocus = selectionIdentity;
        state.runtimeResult = result;
        setText(documentStatus, 'PASS');
        setText(routeStatus, result.route);
        renderIssues(result.preflight?.issues || []);
        setText(editStatus, `Applied · revision ${state.revisionNumber}`);
        clearActiveScoreState();

        const accepted = api.load(new TextEncoder().encode(result.musicXml));
        if (!accepted) throw new Error('alphaTab rejected revised renderer MusicXML.');
        return true;
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        setText(editStatus, `Edit failed: ${state.lastError}`);
        renderIssues([{
          code: 'WORKBENCH_EDIT_FAILED',
          message: state.lastError,
          location: selectionIdentity,
        }]);
        return false;
      } finally {
        state.editing = false;
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
    applyEditButton.addEventListener('click', async () => {
      await applySelectedEdit();
    });
    cancelEditButton.addEventListener('click', () => {
      clearSelection();
      updateControls();
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
      if (session.pendingFocus) {
        const pending = session.pendingFocus;
        session.pendingFocus = null;
        focusMeasure(pending);
        selectEventByIdentity(pending);
      }
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
    api.noteMouseDown.on((note) => {
      selectNote(note);
    });

    clearActiveScoreState();
    clearSession();
    renderIssues([]);
    setText(documentStatus, 'EMPTY');
    setText(routeStatus, 'UNRESOLVED');
    updateControls();

    return Object.freeze({
      api,
      loadFile,
      loadRuntimeResult: setRuntimeResult,
      focusMeasure,
      selectNote,
      selectEvent: selectEventByIdentity,
      applySelectedEdit,
      snapshot() {
        const track = state.scoreLoaded ? api.score?.tracks?.[0] : null;
        return Object.freeze({
          ...state,
          selectedEvent: state.selectedEvent
            ? Object.freeze({
              ...state.selectedEvent,
              sourceGroupEventIds: state.selectedEvent.sourceGroupEventIds
                ? Object.freeze([...state.selectedEvent.sourceGroupEventIds])
                : undefined,
              pitch: Object.freeze({ ...state.selectedEvent.pitch }),
            })
            : null,
          sourceFileName: session.sourceFileName,
          sourceSha256: session.expectedInputSha256,
          revisionCommandCount: session.commands.length,
          scoreTracks: state.scoreLoaded ? (api.score?.tracks?.length || 0) : 0,
          scoreStaves: state.scoreLoaded ? (track?.staves?.length || 0) : 0,
          scoreMeasures: state.scoreLoaded ? (api.score?.masterBars?.length || 0) : 0,
          scoreHidden: scoreHost.hidden,
          playDisabled: playButton.disabled,
          stopDisabled: stopButton.disabled,
          applyEditDisabled: applyEditButton.disabled,
        });
      },
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        if (session.sourceBytes) session.sourceBytes.fill(0);
        clearSession();
        api.destroy();
      },
    });
  }

  global.GuitarTabWorkbench = Object.freeze({
    mount,
    MAX_CLIENT_UPLOAD_BYTES,
    MAX_REVISION_COMMANDS,
    ALLOWED_EXTENSIONS: Object.freeze([...ALLOWED_EXTENSIONS]),
  });
}(window));
