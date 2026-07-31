import { randomUUID } from 'node:crypto'
import { sendJson } from './http/respond.js'
import { ENGINE_NAME, ENGINE_VERSION, TAB_OCR_SCHEMA_VERSION } from './contracts/tabOcrResult.js'

export function createRequestHandler({ config, now = () => new Date() }) {
  const startedAt = now()

  return function requestHandler(request, response) {
    const requestId = randomUUID()
    response.setHeader('X-Request-Id', requestId)

    if (request.method === 'GET' && request.url === '/health') {
      return sendJson(response, 200, {
        status: 'ok',
        service: ENGINE_NAME,
        version: ENGINE_VERSION,
        schemaVersion: TAB_OCR_SCHEMA_VERSION,
        mode: 'safe-skeleton',
        ocrEnabled: false,
        uptimeSeconds: Math.max(0, Math.floor((now().getTime() - startedAt.getTime()) / 1000)),
      })
    }

    if (request.url?.startsWith('/api/v1/tab/')) {
      return sendJson(response, 503, {
        success: false,
        error: {
          code: 'ENGINE_NOT_READY',
          message: 'TAB OCR processing is disabled until validation and security gates pass.',
          requestId,
        },
      })
    }

    return sendJson(response, 404, {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found.',
        requestId,
      },
    })
  }
}
