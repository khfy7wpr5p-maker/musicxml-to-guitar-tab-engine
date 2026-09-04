'use strict';

const {
  extractMusicXmlGuitarConfigurationProvenance,
} = require('../parser/musicXmlGuitarConfigurationProvenance');
const {
  normalizePolyphonicFingeringProvenance,
} = require('../parser/polyphonicFingeringProvenance');

function normalizeInstrumentAwareFingeringProvenance(parsedDocument, runtime = null) {
  let sourceConfigurationProvenance = null;
  try {
    sourceConfigurationProvenance = extractMusicXmlGuitarConfigurationProvenance(parsedDocument);
  } catch {
    // Fingering classification is not configuration-validation authority. If
    // source guitar configuration cannot be proved here, the safe result is
    // untrusted/generic fingering. The owning upload runtime independently
    // validates source guitar configuration and preserves its established
    // BLOCKED / legacy-presentation behavior.
    sourceConfigurationProvenance = null;
  }

  return normalizePolyphonicFingeringProvenance(
    parsedDocument,
    sourceConfigurationProvenance,
    runtime,
  );
}

module.exports = {
  normalizeInstrumentAwareFingeringProvenance,
};