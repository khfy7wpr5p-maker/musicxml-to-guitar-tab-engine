(function bootGuitarTabWorkbench(global) {
  'use strict';

  const root = global.document.querySelector('[data-guitar-tab-workbench]');
  if (!root) throw new Error('Guitar TAB Workbench root was not found.');

  const host = global.GuitarTabWorkbenchHost.mount({
    root,
    alphaTab: global.alphaTab,
    adapters: global.GuitarTabWorkbenchHostAdapters,
    config: global.GuitarTabWorkbenchConfig,
  });

  global.__workbenchHost = host;
  global.__workbench = host.workbench;

  host.ready.catch((error) => {
    const previewNotice = root.querySelector('[data-role="preview-notice"]');
    if (previewNotice) {
      previewNotice.textContent = `Preview load failed: ${error?.message || String(error)}`;
      previewNotice.hidden = false;
    }
  });
}(window));
