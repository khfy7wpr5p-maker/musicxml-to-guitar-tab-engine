'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriterV2');

function canonicalResult() {
  const bytes = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'runtime-realworld-guitar-poly.musicxml'),
  );
  const result = processMusicXmlUpload({ fileName: 'writer-hardening.musicxml', bytes });
  assert.equal(result.status, 'PASS');
  return result.canonicalTabResult;
}

function assertWriterOptionError(error) {
  return Boolean(
    error
    && error.code === 'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS'
  );
}

test('repeat-aware writer rejects proxy options before invoking get traps', () => {
  let gets = 0;
  const options = new Proxy({}, {
    get() {
      gets += 1;
      throw new Error('proxy get trap must not execute');
    },
  });

  assert.throws(
    () => serializeCanonicalTabResultV2ToMusicXml(canonicalResult(), options),
    assertWriterOptionError,
  );
  assert.equal(gets, 0);
});

test('repeat-aware writer rejects proxy notationContext before own-property traps', () => {
  let ownKeys = 0;
  let descriptors = 0;
  const notationContext = new Proxy({}, {
    ownKeys() {
      ownKeys += 1;
      return [];
    },
    getOwnPropertyDescriptor() {
      descriptors += 1;
      return undefined;
    },
  });

  assert.throws(
    () => serializeCanonicalTabResultV2ToMusicXml(canonicalResult(), { notationContext }),
    assertWriterOptionError,
  );
  assert.equal(ownKeys, 0);
  assert.equal(descriptors, 0);
});

test('repeat-aware writer rejects proxy repeat arrays before array traps', () => {
  const base = [];
  let ownKeys = 0;
  const measureOccurrencePlan = new Proxy(base, {
    ownKeys() {
      ownKeys += 1;
      return Reflect.ownKeys(base);
    },
  });
  const options = {
    notationContext: {
      keySignatures: [],
      measureOccurrencePlan,
      repeatBarlines: [],
    },
  };

  assert.throws(
    () => serializeCanonicalTabResultV2ToMusicXml(canonicalResult(), options),
    assertWriterOptionError,
  );
  assert.equal(ownKeys, 0);
});

test('repeat-aware writer rejects accessor options without invoking getters', () => {
  let gets = 0;
  const options = {};
  Object.defineProperty(options, 'notationContext', {
    enumerable: true,
    get() {
      gets += 1;
      throw new Error('options getter must not execute');
    },
  });

  assert.throws(
    () => serializeCanonicalTabResultV2ToMusicXml(canonicalResult(), options),
    assertWriterOptionError,
  );
  assert.equal(gets, 0);
});

test('repeat-aware writer rejects accessor repeat context without invoking getters', () => {
  let gets = 0;
  const notationContext = {
    keySignatures: [],
    repeatBarlines: [],
  };
  Object.defineProperty(notationContext, 'measureOccurrencePlan', {
    enumerable: true,
    get() {
      gets += 1;
      throw new Error('repeat context getter must not execute');
    },
  });

  assert.throws(
    () => serializeCanonicalTabResultV2ToMusicXml(canonicalResult(), { notationContext }),
    assertWriterOptionError,
  );
  assert.equal(gets, 0);
});
