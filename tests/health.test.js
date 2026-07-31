import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { createRequestHandler } from '../src/app.js'
import { loadConfig } from '../src/config.js'

async function withServer(run) {
  const server = http.createServer(createRequestHandler({ config: loadConfig({}) }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('GET /health exposes safe skeleton status', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.status, 'ok')
    assert.equal(body.ocrEnabled, false)
    assert.equal(body.mode, 'safe-skeleton')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  })
})

test('OCR API remains disabled until security gates pass', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/tab/jobs`, { method: 'POST' })
    const body = await response.json()
    assert.equal(response.status, 503)
    assert.equal(body.error.code, 'ENGINE_NOT_READY')
  })
})
