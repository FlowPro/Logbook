import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { LogEntryForm } from './pages/LogEntryForm'
import { ShipData } from './pages/ShipData'
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
import { db, initSettings } from './db/database'

function App() {
  useEffect(() => {
    initSettings().catch(console.error)
    // Uncomment to seed demo data for development:
    // seedDemoData().catch(console.error)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="logbook" element={<Navigate to="/ports" replace />} />
          <Route path="log/new" element={<LogEntryForm />} />
          <Route path="log/:id" element={<LogEntryForm />} />
          <Route path="log/:id/edit" element={<LogEntryForm />} />
          <Route path="ship" element={<ShipData />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
