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

  // Tauri only: unregister any lingering SWs (stale cache in WebView2/WKWebView)
  if ('__TAURI_INTERNALS__' in window) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister())
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
