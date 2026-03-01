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

  // Tauri only: unregister any stale service workers on startup.
  // Cache clearing (WebView2 HTTP cache + Cache Storage) happens in the update
  // flow (Settings.tsx installUpdate) so it only runs when actually needed.
  if ('__TAURI_INTERNALS__' in window) {
    ;(async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) { await r.unregister() }
    })()
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
