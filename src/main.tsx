import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'
import './i18n/index.ts'

if ('serviceWorker' in navigator) {
  if ('__TAURI_INTERNALS__' in window) {
    // In Tauri WebView2, service workers persist across reinstalls via %AppData%
    // and can serve stale cached JS. Tauri serves files directly from the bundle,
    // so service workers are unnecessary and harmful here.
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister())
    })
  } else {
    // PWA: reload when a new service worker takes over to avoid stale asset hashes
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
