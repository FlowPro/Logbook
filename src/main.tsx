import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n/index.ts'

if ('serviceWorker' in navigator) {
  // Always: reload when a new SW takes over — prevents white screen on PWA update
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })

  // Tauri only: unregister stale SWs and clear Workbox caches.
  // The Rust setup() also clears the WebView2 HTTP cache before the webview
  // starts; this JS cleanup handles the Cache Storage layer on top of that.
  // Preserves 'protomaps-tiles-precache' (explicitly pre-downloaded map tiles).
  if ('__TAURI_INTERNALS__' in window) {
    ;(async () => {
      let changed = false
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) { await r.unregister(); changed = true }
      if ('caches' in window) {
        for (const k of await caches.keys()) {
          if (k !== 'protomaps-tiles-precache') { await caches.delete(k); changed = true }
        }
      }
      if (changed && !sessionStorage.__tauri_cleared) {
        sessionStorage.__tauri_cleared = '1'
        window.location.reload()
      }
    })()
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
