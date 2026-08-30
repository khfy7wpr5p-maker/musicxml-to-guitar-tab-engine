'use strict';

const { EngineError } = require('../errors/engineError');
const { createGuitarConfiguration } = require('./tuning');

const GUITAR_CONFIGURATION_AUTHORITY_VERSION = '1.0.0';

class GuitarConfigurationAuthorityError extends EngineError {
  constructor(message, code = 'INVALID_GUITAR_CONFIGURATION_AUTHORITY', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'GuitarConfigurationAuthorityError');
  }
}

function configurationFacts(configuration) {
  return {
    tuning: configuration.tuning.map(({ number, pitch, midi }) => ({ number, pitch, midi })),
    minimumFret: configuration.minimumFret,
    maximumFret: configuration.maximumFret,
    capoFret: configuration.capoFret,
    fretSemantics: configuration.fretSemantics,
  };
}

function sameConfiguration(left, right) {
  return JSON.stringify(configurationFacts(left)) === JSON.stringify(configurationFacts(right));
}

function assertConfiguration(value, label) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tuning)) {
    throw new GuitarConfigurationAuthorityError(`${label} must be a normalized GuitarConfiguration.`);
  }
  try {
    const normalized = createGuitarConfiguration({
      tuning: value.tuning.map(({ number, pitch, midi }) => ({ number, pitch, midi })),
      minimumFret: value.minimumFret,
      maximumFret: value.maximumFret,
      capoFret: value.capoFret,
    });
    if (!sameConfiguration(normalized, value)) {
      throw new GuitarConfigurationAuthorityError(`${label} does not match the production GuitarConfiguration contract.`);
    }
    return value;
  } catch (error) {
    if (error instanceof GuitarConfigurationAuthorityError) throw error;
    throw new GuitarConfigurationAuthorityError(`${label} is not a valid GuitarConfiguration.`, 'INVALID_GUITAR_CONFIGURATION_AUTHORITY', {
      causeCode: error?.code || null,
    });
  }
}

function sourceConfigurationFromProvenance(sourceProvenance) {
  if (sourceProvenance === undefined || sourceProvenance === null) return null;
  if (
    !sourceProvenance
    || sourceProvenance.documentType !== 'MusicXmlGuitarConfigurationProvenance'
    || !['ABSENT', 'EXPLICIT'].includes(sourceProvenance.status)
  ) {
    throw new GuitarConfigurationAuthorityError('sourceProvenance is not a supported provenance result.');
  }
  if (sourceProvenance.status === 'ABSENT') {
    if (sourceProvenance.configuration !== null) {
      throw new GuitarConfigurationAuthorityError('ABSENT source provenance cannot carry a configuration.');
    }
    return null;
  }
  return assertConfiguration(sourceProvenance.configuration, 'sourceProvenance.configuration');
}

function resolveGuitarConfigurationAuthority({ userConfiguration = null, sourceProvenance = null } = {}) {
  const user = userConfiguration === null ? null : assertConfiguration(userConfiguration, 'userConfiguration');
  const source = sourceConfigurationFromProvenance(sourceProvenance);

  if (user && source && !sameConfiguration(user, source)) {
    throw new GuitarConfigurationAuthorityError(
      'Explicit user and MusicXML guitar configurations conflict.',
      'CONFIGURATION_CONFLICT',
      Object.freeze({
        user: Object.freeze(configurationFacts(user)),
        source: Object.freeze(configurationFacts(source)),
      }),
    );
  }

  let configuration;
  let authority;
  if (user) {
    configuration = user;
    authority = source ? 'EXPLICIT_USER_AND_SOURCE_AGREE' : 'EXPLICIT_USER';
  } else if (source) {
    configuration = source;
    authority = 'EXPLICIT_MUSICXML_SOURCE';
  } else {
    configuration = createGuitarConfiguration();
    authority = 'STANDARD_DEFAULT';
  }

  return Object.freeze({
    documentType: 'ResolvedGuitarConfigurationAuthority',
    contractVersion: GUITAR_CONFIGURATION_AUTHORITY_VERSION,
    authority,
    configuration,
  });
}

module.exports = {
  GUITAR_CONFIGURATION_AUTHORITY_VERSION,
  GuitarConfigurationAuthorityError,
  sameConfiguration,
  resolveGuitarConfigurationAuthority,
};
