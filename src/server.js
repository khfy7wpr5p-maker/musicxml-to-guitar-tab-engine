import http from 'node:http'
import { createRequestHandler } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const server = http.createServer(createRequestHandler({ config }))

server.requestTimeout = config.requestTimeoutMs
server.headersTimeout = config.headersTimeoutMs
server.keepAliveTimeout = config.keepAliveTimeoutMs

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    host: config.host,
    port: config.port,
    mode: 'safe-skeleton',
    ocrEnabled: false,
  }))
})

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal }))

  server.close((error) => {
    if (error) {
      console.error(JSON.stringify({ level: 'error', event: 'shutdown_failed', message: error.message }))
      process.exitCode = 1
    }
  })

  setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', event: 'shutdown_forced' }))
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export { server }
