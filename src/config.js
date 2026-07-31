const DEFAULTS = Object.freeze({
  host: '0.0.0.0',
  port: 3000,
  requestTimeoutMs: 15_000,
  headersTimeoutMs: 20_000,
  keepAliveTimeoutMs: 5_000,
  maxUploadBytes: 10 * 1024 * 1024,
  maxPdfPages: 20,
  maxImagePixels: 40_000_000,
  maxConcurrentJobs: 2,
})

function readBoundedInteger(env, name, fallback, min, max) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`)
  }
  return parsed
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    environment: env.NODE_ENV || 'development',
    host: env.HOST || DEFAULTS.host,
    port: readBoundedInteger(env, 'PORT', DEFAULTS.port, 1, 65_535),
    requestTimeoutMs: readBoundedInteger(env, 'REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs, 1_000, 120_000),
    headersTimeoutMs: readBoundedInteger(env, 'HEADERS_TIMEOUT_MS', DEFAULTS.headersTimeoutMs, 1_000, 120_000),
    keepAliveTimeoutMs: readBoundedInteger(env, 'KEEP_ALIVE_TIMEOUT_MS', DEFAULTS.keepAliveTimeoutMs, 1_000, 60_000),
    maxUploadBytes: readBoundedInteger(env, 'MAX_UPLOAD_BYTES', DEFAULTS.maxUploadBytes, 1, 25 * 1024 * 1024),
    maxPdfPages: readBoundedInteger(env, 'MAX_PDF_PAGES', DEFAULTS.maxPdfPages, 1, 100),
    maxImagePixels: readBoundedInteger(env, 'MAX_IMAGE_PIXELS', DEFAULTS.maxImagePixels, 1_000_000, 100_000_000),
    maxConcurrentJobs: readBoundedInteger(env, 'MAX_CONCURRENT_JOBS', DEFAULTS.maxConcurrentJobs, 1, 8),
  })
}

export { DEFAULTS }
