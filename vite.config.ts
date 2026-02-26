import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

// ── Bridge-Control Plugin ─────────────────────────────────────────────────────
// Exposes /api/bridge-control/{status,start,stop} on the Vite dev server so
// the Settings UI can start/stop the NMEA bridge process without a terminal.

function bridgeControlPlugin() {
  let bridgeProcess: ChildProcess | null = null

  function isRunning() {
    return bridgeProcess !== null && !bridgeProcess.killed
  }

  function stopBridge() {
    if (bridgeProcess) {
      bridgeProcess.kill('SIGTERM')
      bridgeProcess = null
    }
  }

  return {
    name: 'bridge-control',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/api/bridge-control', (req, res, next) => {
        const url = req.url ?? ''
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-cache')

        if (url.startsWith('/status')) {
          res.end(JSON.stringify({ running: isRunning() }))
          return
        }

        if (url.startsWith('/start') && req.method === 'POST') {
          if (isRunning()) {
            res.end(JSON.stringify({ ok: true, already: true }))
            return
          }
          bridgeProcess = spawn('npm', ['run', 'server'], {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: true,
          })
          bridgeProcess.on('exit', () => { bridgeProcess = null })
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (url.startsWith('/stop') && req.method === 'POST') {
          stopBridge()
          res.end(JSON.stringify({ ok: true }))
          return
        }

        next()
      })

      // Kill bridge process when Vite shuts down
      server.httpServer?.on('close', stopBridge)
    },
  }
}

// ── Vite Config ───────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [
    react(),
    bridgeControlPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Logbuch – Segelschiff',
        short_name: 'Logbuch',
        description: 'Maritime sailing logbook for offshore navigation',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true, // fail instead of silently switching ports (prevents IndexedDB origin mismatch)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
