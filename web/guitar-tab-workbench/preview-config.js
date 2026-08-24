(function attachGuitarTabWorkbenchConfig(global) {
  'use strict';

  global.GuitarTabWorkbenchConfig = Object.freeze({
    mode: 'runtime',
    apiBaseUrl: '/api',
    assetBaseUrl: '../assets/',
    previewResultUrl: '../preview/demo.json',
    autoLoadPreview: false,
    playerMode: 'synthesizer',
  });
}(window));
