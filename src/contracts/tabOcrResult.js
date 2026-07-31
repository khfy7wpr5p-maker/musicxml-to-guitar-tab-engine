export const TAB_OCR_SCHEMA_VERSION = '1.0.0'
export const ENGINE_NAME = 'seslitab-tab-ocr'
export const ENGINE_VERSION = '0.1.0-alpha.0'

export function createEmptyTabOcrResult({ sourceType, pageCount = 0 } = {}) {
  return {
    schemaVersion: TAB_OCR_SCHEMA_VERSION,
    engine: {
      name: ENGINE_NAME,
      version: ENGINE_VERSION,
    },
    document: {
      sourceType: sourceType || 'unknown',
      pageCount,
    },
    pages: [],
    warnings: [],
    requiresTeacherReview: true,
  }
}
