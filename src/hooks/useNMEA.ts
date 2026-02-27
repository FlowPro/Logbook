import { useState, useEffect, useRef, useCallback } from 'react'

export interface NMEAData {
  latitude?: number      // decimal degrees, positive = N
  longitude?: number     // decimal degrees, positive = E
  sog?: number           // speed over ground, knots
  cogTrue?: number       // course over ground, degrees true
  windTrueDirection?: number  // degrees true
  windTrueSpeed?: number      // knots
  windApparentAngle?: number  // degrees relative
  windApparentSpeed?: number  // knots
  baroPressureHPa?: number
  temperature?: number   // °C
  depth?: number         // meters
  updatedAt?: number     // Date.now()
}

export function useNMEA(wsUrl?: string): { connected: boolean; data: NMEAData } {
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState<NMEAData>({})
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!wsUrl) return
    // Immediately mark as disconnected while (re)connecting
    setConnected(false)
    if (wsRef.current) {
      wsRef.current.onclose = null // suppress reconnect from old socket
      wsRef.current.close()
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      // Invalid URL or WebSocket not available — silently skip
      return
    }
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect after 5 s
      timerRef.current = setTimeout(connect, 5000)
    }

    ws.onerror = () => {
      // Error triggers onclose — no extra handling needed
      setConnected(false)
    }

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>
        if (msg._heartbeat) {
          // Heartbeat from bridge — only refresh timestamp, don't pollute data
          setData(prev => ({ ...prev, updatedAt: Date.now() }))
        } else {
          setData(prev => ({ ...prev, ...msg, updatedAt: Date.now() }))
        }
      } catch {
        // Malformed message — ignore
      }
    }
  }, [wsUrl])

  useEffect(() => {
    if (!wsUrl) {
      setConnected(false)
      setData({})
      return
    }
    connect()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [wsUrl, connect])

  return { connected, data }
}
