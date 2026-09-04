(function pinStage07EditorCore(global) {
  'use strict';

  const EDITOR_CORE_SOURCE_REVISION = '9429116bd5c92d4db4c4edbb21b307c6c74c2391';
  const base = global.ReviewScoreEditorIntegratedHost;

  if (!base || typeof base.create !== 'function') {
    throw new Error('Stage 07 integrated host must load before the Editor Core pin.');
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function create(options) {
    assert(options && typeof options === 'object' && !Array.isArray(options), 'Stage 07 host options are required.');
    assert(
      options.editorCoreSourceRevision === EDITOR_CORE_SOURCE_REVISION,
      'Editor Core source revision mismatch.',
    );

    const host = base.create(options);
    return Object.freeze({
      ...host,
      pins: Object.freeze({
        ...host.pins,
        editorCoreSourceRevision: EDITOR_CORE_SOURCE_REVISION,
      }),
    });
  }

  global.ReviewScoreEditorIntegratedHost = Object.freeze({
    ...base,
    pins: Object.freeze({
      ...base.pins,
      editorCoreSourceRevision: EDITOR_CORE_SOURCE_REVISION,
    }),
    create,
  });
}(window));
