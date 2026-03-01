import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { toast } from 'sonner'

// GitHub Pages uses HashRouter (no server-side routing) — all other environments use BrowserRouter
const Router = import.meta.env.VITE_GH_PAGES ? HashRouter : BrowserRouter
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { db, initSettings, importAllData } from './db/database'

// Heavy pages — loaded on demand to keep initial bundle small
const CrewManagement = lazy(() => import('./pages/CrewManagement').then(m => ({ default: m.CrewManagement })))
const Summary        = lazy(() => import('./pages/Summary').then(m => ({ default: m.Summary })))
const PortLog        = lazy(() => import('./pages/PortLog').then(m => ({ default: m.PortLog })))
const Maintenance    = lazy(() => import('./pages/Maintenance').then(m => ({ default: m.Maintenance })))
const Export         = lazy(() => import('./pages/Export').then(m => ({ default: m.Export })))
const Settings       = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Emergency      = lazy(() => import('./pages/Emergency').then(m => ({ default: m.Emergency })))
const Safety         = lazy(() => import('./pages/Safety').then(m => ({ default: m.Safety })))
const Search         = lazy(() => import('./pages/Search').then(m => ({ default: m.Search })))
const MapView        = lazy(() => import('./pages/MapView').then(m => ({ default: m.MapView })))
const Storage        = lazy(() => import('./pages/Storage').then(m => ({ default: m.Storage })))

function App() {
  useEffect(() => {
    initSettings().catch(console.error)

    // On GitHub Pages: auto-load demo data if the database is empty
    if (import.meta.env.VITE_GH_PAGES) {
      db.logEntries.count().then(count => {
        if (count > 0) return
        return fetch(`${import.meta.env.BASE_URL}demo-backup.json`)
          .then(r => r.json())
          .then(json => importAllData(JSON.stringify(json)))
          .then(() => toast.success('Demo data loaded — explore the app!', { duration: 5000 }))
      }).catch(console.error)
    }
  }, [])

  return (
    <Router>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="logbook" element={<Navigate to="/ports" replace />} />
            <Route path="crew" element={<CrewManagement />} />
            <Route path="summary" element={<Summary />} />
            <Route path="ports" element={<PortLog />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="export" element={<Export />} />
            <Route path="settings" element={<Settings />} />
            <Route path="emergency" element={<Emergency />} />
            <Route path="safety" element={<Safety />} />
            <Route path="search" element={<Search />} />
            <Route path="map" element={<MapView />} />
            <Route path="storage" element={<Storage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App
