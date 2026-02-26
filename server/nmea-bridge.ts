/**
 * NMEA Bridge Server
 * ──────────────────
 * Connects to an NMEA 0183/2000 gateway on the boat network (TCP or UDP),
 * parses incoming sentences, and forwards the results to browser clients
 * via a local WebSocket server.
 *
 * Configuration: edit server/config.json  (or use the Settings UI)
 * Start:         npm run server
 * Start with app: npm run dev:nmea
 */

import http from 'node:http'
import net from 'node:net'
import dgram from 'node:dgram'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseSentence } from './nmea-parser.js'

// ── Config ────────────────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const configPath = join(__dir, 'config.json')

interface Config {
  nmea: { host: string; port: number; protocol: 'tcp' | 'udp'; reconnectIntervalMs: number }
  websocket: { port: number }
}

const DEFAULT_CONFIG: Config = {
  nmea: { host: '192.168.0.1', port: 10110, protocol: 'tcp', reconnectIntervalMs: 5000 },
  websocket: { port: 3001 },
}

function loadConfig(): Config {
  if (!existsSync(configPath)) {
    console.warn('[nmea] config.json not found, using defaults')
    return DEFAULT_CONFIG
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Config
  } catch {
    console.warn('[nmea] Failed to parse config.json, using defaults')
    return DEFAULT_CONFIG
  }
}

const cfg = loadConfig()
const WS_PORT = cfg.websocket.port

// ── Module state ──────────────────────────────────────────────────────────────

let nmeaConnected = false
let autoReconnect = true
let tcpSocket: net.Socket | null = null
let udpSocket: dgram.Socket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// ── HTTP API ──────────────────────────────────────────────────────────────────

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  setCorsHeaders(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
  const { method, url } = req

  // Preflight
  if (method === 'OPTIONS') {
    setCorsHeaders(res)
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'GET' && url === '/api/status') {
    sendJson(res, 200, {
      nmeaConnected,
      wsClients: clients.size,
      config: { nmea: cfg.nmea },
    })
    return
  }

  if (method === 'POST' && url === '/api/config') {
    readBody(req).then(body => {
      try {
        const patch = JSON.parse(body) as Partial<Config['nmea']>
        Object.assign(cfg.nmea, patch)
        writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
        console.log('[nmea] Config updated:', cfg.nmea)
        reconnect()
        sendJson(res, 200, { ok: true, config: { nmea: cfg.nmea } })
      } catch (e) {
        sendJson(res, 400, { error: String(e) })
      }
    }).catch(e => sendJson(res, 500, { error: String(e) }))
    return
  }

  if (method === 'POST' && url === '/api/connect') {
    reconnect()
    sendJson(res, 200, { ok: true })
    return
  }

  if (method === 'POST' && url === '/api/disconnect') {
    disconnectNMEA()
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 404, { error: 'Not found' })
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const httpServer = http.createServer(handleHttp)
const wss = new WebSocketServer({ server: httpServer })
const clients = new Set<WebSocket>()

httpServer.listen(WS_PORT, () => {
  console.log(`[nmea] HTTP + WebSocket server listening on port ${WS_PORT}`)
})

wss.on('connection', ws => {
  clients.add(ws)
  console.log(`[nmea] Browser client connected (${clients.size} total)`)
  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[nmea] Browser client disconnected (${clients.size} remaining)`)
  })
})

function broadcast(data: object): void {
  if (clients.size === 0) return
  const msg = JSON.stringify(data)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg)
  }
}

// ── NMEA sentence processing ─────────────────────────────────────────────────

let lineBuffer = ''

function processChunk(chunk: string): void {
  lineBuffer += chunk
  const lines = lineBuffer.split('\n')
  lineBuffer = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parsed = parseSentence(trimmed)
    if (parsed) broadcast({ ...parsed, _raw: trimmed })
  }
}

// ── NMEA connection management ────────────────────────────────────────────────

function disconnectNMEA(): void {
  autoReconnect = false
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  tcpSocket?.destroy(); tcpSocket = null
  udpSocket?.close(); udpSocket = null
  nmeaConnected = false
  console.log('[nmea] NMEA connection disconnected')
}

function reconnect(): void {
  disconnectNMEA()
  autoReconnect = true
  if (cfg.nmea.protocol === 'udp') {
    listenUDP()
  } else {
    connectTCP()
  }
}

// ── TCP connection ────────────────────────────────────────────────────────────

function connectTCP(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

  const socket = new net.Socket()
  tcpSocket = socket

  socket.connect(cfg.nmea.port, cfg.nmea.host, () => {
    console.log(`[nmea] Connected to NMEA device at ${cfg.nmea.host}:${cfg.nmea.port} (TCP)`)
    nmeaConnected = true
    lineBuffer = ''
  })

  socket.on('data', (data: Buffer) => processChunk(data.toString('ascii')))

  socket.on('error', (err: Error) => {
    console.warn(`[nmea] TCP error: ${err.message} — retrying in ${cfg.nmea.reconnectIntervalMs}ms`)
    nmeaConnected = false
  })

  socket.on('close', () => {
    console.log('[nmea] TCP connection closed')
    nmeaConnected = false
    tcpSocket = null
    if (autoReconnect) {
      reconnectTimer = setTimeout(connectTCP, cfg.nmea.reconnectIntervalMs)
    }
  })
}

// ── UDP listener ─────────────────────────────────────────────────────────────

function listenUDP(): void {
  const socket = dgram.createSocket('udp4')
  udpSocket = socket

  socket.on('message', (msg: Buffer) => processChunk(msg.toString('ascii')))

  socket.on('error', (err: Error) => {
    console.warn(`[nmea] UDP error: ${err.message}`)
    nmeaConnected = false
    socket.close()
    udpSocket = null
  })

  socket.bind(cfg.nmea.port, () => {
    const addr = socket.address()
    console.log(`[nmea] Listening for UDP NMEA on port ${addr.port}`)
    nmeaConnected = true
  })
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log(`[nmea] Starting bridge — NMEA source: ${cfg.nmea.protocol.toUpperCase()} ${cfg.nmea.host}:${cfg.nmea.port}`)

if (cfg.nmea.protocol === 'udp') {
  listenUDP()
} else {
  connectTCP()
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[nmea] Shutting down...')
  disconnectNMEA()
  httpServer.close()
  process.exit(0)
})
