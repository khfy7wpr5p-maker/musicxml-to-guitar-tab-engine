(function attachReviewScoreEditor(global) {
  'use strict';

  const REVIEW_REQUIRED = 'REVIEW_REQUIRED';
  const BLOCKED = 'BLOCKED';
  const PASS = 'PASS';

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function text(element, value) {
    if (element) element.textContent = value;
  }

  function uiModel(snapshot) {
    return snapshot && snapshot.uiModel ? snapshot.uiModel : snapshot;
  }

  function targetLabel(target) {
    if (target === null || target === undefined) return 'No target';
    if (typeof target === 'string') return target;
    if (typeof target !== 'object') return 'Selected target';
    const parts = [];
    if (target.measure !== undefined && target.measure !== null) parts.push(`m.${target.measure}`);
    if (target.staff !== undefined && target.staff !== null) parts.push(`staff ${target.staff}`);
    if (target.voice !== undefined && target.voice !== null) parts.push(`voice ${target.voice}`);
    return parts.length > 0 ? parts.join(' · ') : 'Selected target';
  }

  function issueLabel(issue) {
    const measure = issue?.location?.measure;
    const location = measure === null || measure === undefined ? '' : ` · m.${measure}`;
    return `${issue.code}${location}: ${issue.message}`;
  }

  function mount({ root, host }) {
    assert(root && root.ownerDocument, 'Review editor root is required.');
    assert(host && typeof host === 'object', 'Review editor host is required.');
    for (const method of [
      'snapshot',
      'mountScore',
      'selectIssue',
      'selectScorePoint',
      'command',
      'undo',
      'redo',
      'save',
      'revalidate',
    ]) {
      assert(typeof host[method] === 'function', `Review editor host must expose ${method}().`);
    }

    const statusBadge = root.querySelector('[data-role="status-badge"]');
    const documentStatus = root.querySelector('[data-role="document-status"]');
    const blockedPanel = root.querySelector('[data-role="blocked-panel"]');
    const blockedReason = root.querySelector('[data-role="blocked-reason"]');
    const scoreHost = root.querySelector('[data-role="score-host"]');
    const selectionStatus = root.querySelector('[data-role="selection-status"]');
    const issueList = root.querySelector('[data-role="issue-list"]');
    const issueCount = root.querySelector('[data-role="issue-count"]');
    const selectedTarget = root.querySelector('[data-role="selected-target"]');
    const capabilityNote = root.querySelector('[data-role="capability-note"]');
    const revisionStatus = root.querySelector('[data-role="revision-status"]');
    const pitchStep = root.querySelector('[data-role="pitch-step"]');
    const pitchAlter = root.querySelector('[data-role="pitch-alter"]');
    const pitchOctave = root.querySelector('[data-role="pitch-octave"]');
    const durationValue = root.querySelector('[data-role="duration-value"]');
    const voiceValue = root.querySelector('[data-role="voice-value"]');

    assert(
      statusBadge && documentStatus && blockedPanel && blockedReason && scoreHost
      && selectionStatus && issueList && issueCount && selectedTarget && capabilityNote
      && revisionStatus && pitchStep && pitchAlter && pitchOctave && durationValue && voiceValue,
      'Review editor markup is incomplete.',
    );

    let destroyed = false;
    let current = null;
    let scoreDisposer = null;

    async function invoke(operation, fn) {
      if (destroyed) return;
      try {
        revisionStatus.textContent = `${operation}…`;
        await fn();
        await refresh();
      } catch (error) {
        revisionStatus.textContent = `${operation} failed: ${error?.message || String(error)}`;
      }
    }

    function syncControls(model) {
      const unavailable = [];
      for (const fieldset of root.querySelectorAll('[data-control]')) {
        const control = model.controls?.[fieldset.dataset.control];
        fieldset.disabled = !control?.enabled;
        if (control?.availability === 'UNAVAILABLE') unavailable.push(fieldset.dataset.control);
      }
      for (const button of root.querySelectorAll('[data-control-button]')) {
        const control = model.controls?.[button.dataset.controlButton];
        button.disabled = !control?.enabled;
        if (control?.availability === 'UNAVAILABLE') unavailable.push(button.dataset.controlButton);
      }
      capabilityNote.textContent = unavailable.length > 0
        ? `Unavailable in current editor adapter: ${[...new Set(unavailable)].join(', ')}`
        : '';

      for (const button of root.querySelectorAll('[data-action]')) {
        const action = button.dataset.action;
        if (action === 'continue') button.disabled = !model.actions?.continueToTab;
        else button.disabled = !model.actions?.[action];
      }
    }

    function renderIssues(model) {
      issueList.replaceChildren();
      const issues = Array.isArray(model.issues) ? model.issues : [];
      text(issueCount, String(issues.length));
      if (issues.length === 0) {
        const empty = root.ownerDocument.createElement('li');
        empty.textContent = model.documentStatus === PASS ? 'No review issues.' : 'No issue details available.';
        issueList.appendChild(empty);
        return;
      }
      for (const issue of issues) {
        const item = root.ownerDocument.createElement('li');
        const button = root.ownerDocument.createElement('button');
        button.type = 'button';
        button.textContent = issueLabel(issue);
        button.disabled = model.documentStatus !== REVIEW_REQUIRED || !issue.issueId;
        button.setAttribute('aria-current', issue.selected ? 'true' : 'false');
        if (issue.issueId) {
          button.addEventListener('click', () => invoke('Select issue', () => host.selectIssue(issue.issueId)));
        }
        item.appendChild(button);
        issueList.appendChild(item);
      }
    }

    function render(model) {
      current = model;
      root.dataset.status = model.documentStatus;
      text(statusBadge, model.documentStatus);
      text(documentStatus, model.documentStatus === REVIEW_REQUIRED
        ? 'Teacher review required'
        : model.documentStatus === BLOCKED
          ? 'Blocked by safety/structure validation'
          : 'Validated and ready for TAB continuation');
      blockedPanel.hidden = model.documentStatus !== BLOCKED;
      text(blockedReason, model.blockedReason || '');
      scoreHost.hidden = !model.score?.canOpen;
      text(selectedTarget, targetLabel(model.score?.selectedTarget));
      text(selectionStatus, model.score?.selectedTarget ? 'Current score target selected' : 'Select an issue or note');
      text(
        revisionStatus,
        model.revision?.readyForStage08
          ? 'Revision revalidated · Stage 08 may continue.'
          : model.revision?.phase
            ? `${model.revision.phase} · ${model.revision.pendingPatchCount || 0} pending correction(s)`
            : '',
      );
      renderIssues(model);
      syncControls(model);
    }

    async function refresh() {
      const snapshot = await host.snapshot();
      const model = uiModel(snapshot);
      assert(model && ['REVIEW_REQUIRED', 'BLOCKED', 'PASS'].includes(model.documentStatus), 'Host returned an invalid Stage 07 UI model.');
      render(model);
      return model;
    }

    async function onScorePoint(event) {
      if (!current || current.documentStatus !== REVIEW_REQUIRED || !current.score?.canOpen) return;
      await invoke('Select note', () => host.selectScorePoint({
        clientX: event.clientX,
        clientY: event.clientY,
      }));
    }

    scoreHost.addEventListener('pointerdown', onScorePoint);

    for (const button of root.querySelectorAll('[data-command]')) {
      button.addEventListener('click', () => {
        const command = button.dataset.command;
        let value = button.dataset.value || null;
        if (command === 'PITCH_UPDATE') {
          value = {
            step: pitchStep.value,
            alter: Number(pitchAlter.value),
            octave: Number(pitchOctave.value),
          };
        } else if (command === 'DURATION_UPDATE') {
          value = durationValue.value;
        } else if (command === 'VOICE_REASSIGNMENT') {
          value = Number(voiceValue.value);
        }
        invoke(command, () => host.command({ command, value }));
      });
    }

    const actions = {
      undo: () => host.undo(),
      redo: () => host.redo(),
      save: () => host.save(),
      revalidate: () => host.revalidate(),
      continue: () => {
        assert(typeof host.continueToTab === 'function', 'Stage 08 continuation is not connected.');
        return host.continueToTab();
      },
    };
    for (const button of root.querySelectorAll('[data-action]')) {
      button.addEventListener('click', () => invoke(button.textContent.trim(), actions[button.dataset.action]));
    }

    const mountedScore = host.mountScore(scoreHost, {
      onSelectionChanged: refresh,
    });
    if (typeof mountedScore === 'function') scoreDisposer = mountedScore;
    else if (mountedScore && typeof mountedScore.dispose === 'function') scoreDisposer = () => mountedScore.dispose();

    const ready = refresh();

    return Object.freeze({
      ready,
      refresh,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        scoreHost.removeEventListener('pointerdown', onScorePoint);
        if (scoreDisposer) scoreDisposer();
      },
    });
  }

  global.ReviewScoreEditor = Object.freeze({ mount });
}(window));
