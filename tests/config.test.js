import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULTS, loadConfig } from '../src/config.js'

test('loadConfig uses safe defaults', () => {
  const config = loadConfig({})
  assert.equal(config.port, DEFAULTS.port)
  assert.equal(config.maxPdfPages, 20)
  assert.equal(config.maxConcurrentJobs, 2)
  assert.equal(Object.isFrozen(config), true)
})

test('loadConfig rejects unsafe numeric values', () => {
  assert.throws(() => loadConfig({ MAX_PDF_PAGES: '1000' }), /MAX_PDF_PAGES/)
  assert.throws(() => loadConfig({ MAX_CONCURRENT_JOBS: '0' }), /MAX_CONCURRENT_JOBS/)
  assert.throws(() => loadConfig({ PORT: 'not-a-number' }), /PORT/)
})
