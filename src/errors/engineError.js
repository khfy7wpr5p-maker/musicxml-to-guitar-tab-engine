'use strict';

const ENGINE_ERROR_CONTRACT_VERSION = '1.0.0';

class EngineError extends Error {
  constructor(message, code, details = {}, name = 'EngineError') {
    super(message);
    this.name = name;
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  ENGINE_ERROR_CONTRACT_VERSION,
  EngineError,
};
