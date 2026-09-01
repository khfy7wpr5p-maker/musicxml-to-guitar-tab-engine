'use strict';

const { createGuitarConfiguration } = require('./tuning');

const GUITAR_ARRANGEMENT_REGISTER_VERSION = '1.0.0';

function createGuitarArrangementRegister(options = {}) {
  const guitar = createGuitarConfiguration(options);
  let minimumMidi = Number.POSITIVE_INFINITY;
  let maximumMidi = Number.NEGATIVE_INFINITY;

  for (const string of guitar.tuning) {
    minimumMidi = Math.min(minimumMidi, string.midi + guitar.minimumFret);
    maximumMidi = Math.max(maximumMidi, string.midi + guitar.maximumFret);
  }

  return Object.freeze({
    contractVersion: GUITAR_ARRANGEMENT_REGISTER_VERSION,
    minimumMidi,
    maximumMidi,
  });
}

module.exports = {
  GUITAR_ARRANGEMENT_REGISTER_VERSION,
  createGuitarArrangementRegister,
};
