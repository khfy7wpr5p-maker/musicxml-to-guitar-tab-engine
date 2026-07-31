import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyTabOcrResult } from '../src/contracts/tabOcrResult.js'

test('empty result is independent, versioned and always requires teacher review', () => {
  const result = createEmptyTabOcrResult({ sourceType: 'pdf', pageCount: 1 })
  assert.equal(result.schemaVersion, '1.0.0')
  assert.equal(result.engine.name, 'seslitab-tab-ocr')
  assert.equal(result.document.sourceType, 'pdf')
  assert.equal(result.document.pageCount, 1)
  assert.deepEqual(result.pages, [])
  assert.equal(result.requiresTeacherReview, true)
})
