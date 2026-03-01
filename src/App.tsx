import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { toast } from 'sonner'

// GitHub Pages uses HashRouter (no server-side routing) — all other environments use BrowserRouter
const Router = import.meta.env.VITE_GH_PAGES ? HashRouter : BrowserRouter
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { LogEntryForm } from './pages/LogEntryForm'
import { CrewManagement } from './pages/CrewManagement'
import { Summary } from './pages/Summary'
import { PortLog } from './pages/PortLog'
import { Maintenance } from './pages/Maintenance'
import { Export } from './pages/Export'
import { Settings } from './pages/Settings'
import { Emergency } from './pages/Emergency'
import { Safety } from './pages/Safety'
import { Search } from './pages/Search'
import { MapView } from './pages/MapView'
import { Storage } from './pages/Storage'
import { db, initSettings, importAllData } from './db/database'

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
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="logbook" element={<Navigate to="/ports" replace />} />
          <Route path="log/new" element={<LogEntryForm />} />
          <Route path="log/:id" element={<LogEntryForm />} />
          <Route path="log/:id/edit" element={<LogEntryForm />} />
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
    </Router>
  )
}

export default App
