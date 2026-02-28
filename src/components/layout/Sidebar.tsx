declare const __APP_VERSION__: string

import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/database'
import { getVesselPrefix } from '../../db/models'
import {
  LayoutDashboard,
  Anchor,
  Users,
  BarChart3,
  MapPin,
  Map,
  Wrench,
  Download,
  Search,
  Settings,
  AlertTriangle,
  ShieldCheck,
  X,
  Package,
} from 'lucide-react'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const ship = useLiveQuery(() => db.ship.toCollection().first())

  // In Tauri, read version from the native binary (bypasses any SW-cached JS bundle)
  const [displayVersion, setDisplayVersion] = useState(__APP_VERSION__)
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/app').then(m => m.getVersion()).then(v => setDisplayVersion(v)).catch(() => {})
    }
  }, [])
  const vesselPrefix = getVesselPrefix(ship?.type)
  const shipLabel = ship?.name ? `${vesselPrefix} ${ship.name}` : 'Maritime Log'

  // Live counters for nav badges
  const passageCount    = useLiveQuery(() => db.passages.count()) ?? 0
  const pendingMaint    = useLiveQuery(() =>
    db.maintenance.filter(e => !e.archivedAt && (e.status === 'planned' || e.status === 'in_progress')).count()
  ) ?? 0
  const overdueMaint    = useLiveQuery(() => {
    const today = new Date().toISOString().slice(0, 10)
    return db.maintenance.filter(e =>
      !e.archivedAt && e.status !== 'done' && !!e.dueDate && e.dueDate < today
    ).count()
  }) ?? 0

  const storageAlerts = useLiveQuery(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const soon  = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    const items = await db.storageItems.toArray()
    return items.filter(i =>
      (i.minQuantity != null && i.quantity < i.minQuantity) ||
      (i.expiryDate  != null && i.expiryDate <= soon && i.expiryDate >= today) ||
      (i.expiryDate  != null && i.expiryDate < today)
    ).length
  }) ?? 0

  useEffect(() => {
    document.title = ship?.name ? `Logbuch ${vesselPrefix} ${ship.name}` : 'Logbuch'
  }, [ship?.name, vesselPrefix])

  const navItems = [
    { to: '/',            icon: LayoutDashboard, label: t('nav.dashboard'),    end: true, badge: 0 },
    { to: '/ports',       icon: MapPin,          label: t('nav.portLog'),      badge: passageCount },
    { to: '/summary',     icon: BarChart3,       label: t('nav.summary'),      badge: 0 },
    { to: '/map',         icon: Map,             label: t('nav.map'),          badge: 0 },
    { to: '/maintenance', icon: Wrench,          label: t('nav.maintenance'),  badge: pendingMaint,   badgeAlert: overdueMaint > 0 },
    { to: '/storage',     icon: Package,         label: t('nav.storage'),      badge: storageAlerts,  badgeAlert: storageAlerts > 0 },
    { to: '/crew',        icon: Users,           label: t('nav.crew'),         badge: 0 },
    { to: '/export',      icon: Download,        label: t('nav.export'),       badge: 0 },
    { to: '/search',      icon: Search,          label: t('nav.search'),       badge: 0 },
  ]

  const emergencyItems = [
    { to: '/safety', icon: ShieldCheck, label: t('nav.safety') },
    { to: '/emergency', icon: AlertTriangle, label: t('nav.emergency') },
  ]

  // Close sidebar only on mobile (< md = 768 px)
  const closeOnMobile = () => { if (window.innerWidth < 768) onClose() }

  return (
    <>
      {/* Mobile overlay – hidden at md+ since sidebar is always visible there */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar
          Mobile  (< md):  fixed overlay, w-64, toggles with `open`
          Tablet  (md–lg): fixed rail, w-16, always visible (icon-only)
          Desktop (≥ lg):  static in-flow, w-64, always visible (full)
      */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-gray-900 z-40 flex flex-col transition-all duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:z-auto md:w-16
          lg:w-64
        `}
      >
        {/* Logo – height must match the Header's h-14 (56 px) */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-700
          md:justify-center md:px-2 lg:justify-between lg:px-4">
          <div className="flex items-center gap-3 md:gap-0 lg:gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Anchor className="w-5 h-5 text-white" />
            </div>
            <div className="md:hidden lg:block">
              <div className="font-bold text-white text-sm">Logbuch</div>
              <div className="text-xs text-gray-400 truncate max-w-[120px]">{shipLabel}</div>
            </div>
          </div>
          {/* Close button – only on mobile */}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 md:px-2 lg:px-3">
          {navItems.map(({ to, icon: Icon, label, end, badge, badgeAlert }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              onClick={closeOnMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150
                md:justify-center md:px-0 md:gap-0 lg:justify-start lg:px-3 lg:gap-3
                ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-200 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              {/* Icon with mini dot-badge at tablet size */}
              <div className="relative flex-shrink-0">
                <Icon className="w-4 h-4" />
                {badge > 0 && (
                  <span className={`
                    hidden md:flex lg:hidden
                    absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full
                    ${badgeAlert ? 'bg-red-500' : 'bg-blue-400'}
                  `} />
                )}
              </div>
              {/* Label – hidden at tablet */}
              <span className="flex-1 md:hidden lg:block">{label}</span>
              {/* Full numeric badge – desktop only */}
              {badge > 0 && (
                <span className={`hidden lg:inline ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none tabular-nums ${
                  badgeAlert
                    ? 'bg-red-500 text-white'
                    : 'bg-white/20 text-gray-200'
                }`}>
                  {badge > 999 ? '999+' : badge}
                </span>
              )}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="pt-3 pb-1">
            {/* Text label – desktop only */}
            <div className="hidden lg:block text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Quick Access
            </div>
            {/* Horizontal rule – tablet only */}
            <div className="hidden md:block lg:hidden border-t border-gray-700 mx-1 mb-2" />
          </div>

          {emergencyItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              onClick={closeOnMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150
                md:justify-center md:px-0 md:gap-0 lg:justify-start lg:px-3 lg:gap-3
                ${isActive
                  ? to === '/emergency' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  : to === '/emergency' ? 'text-red-300 hover:bg-red-900/50 hover:text-red-200' : 'text-gray-200 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="md:hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom: version + settings */}
        <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between gap-2
          md:justify-center md:px-2 lg:justify-between lg:px-4">
          <div className="md:hidden lg:block">
            <p className="text-xs text-gray-500">Logbuch v{displayVersion}</p>
            <p className="text-xs text-gray-600">Offline-ready PWA</p>
          </div>
          <NavLink
            to="/settings"
            onClick={closeOnMobile}
            title={t('nav.settings')}
            className={({ isActive }) =>
              `p-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`
            }
          >
            <Settings className="w-4 h-4" />
          </NavLink>
        </div>
      </aside>
    </>
  )
}
