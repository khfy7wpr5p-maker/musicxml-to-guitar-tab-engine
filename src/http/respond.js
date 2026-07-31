export function applySecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

export function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  applySecurityHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(body)
}
