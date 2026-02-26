import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/database'
import {
  LayoutDashboard,
  Anchor,
  Users,
  BarChart3,
  MapPin,
  Wrench,
  Download,
  Settings,
  AlertTriangle,
  ShieldCheck,
  X,
  Search,
} from 'lucide-react'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const ship = useLiveQuery(() => db.ship.toCollection().first())
  const shipLabel = ship?.name ? `SV ${ship.name}` : 'Maritime Log'

  // Live counters for nav badges
  const passageCount    = useLiveQuery(() => db.passages.count()) ?? 0
  const pendingMaint    = useLiveQuery(() =>
    db.maintenance.filter(e => !e.archivedAt && (e.status === 'planned' || e.status === 'in_progress')).count()
  ) ?? 0

  useEffect(() => {
    document.title = ship?.name ? `Logbuch SV ${ship.name}` : 'Logbuch'
  }, [ship?.name])

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), end: true, badge: 0 },
    { to: '/ports',       icon: MapPin,        label: t('nav.portLog'),     badge: passageCount },
    { to: '/search',      icon: Search,        label: t('nav.search'),      badge: 0 },
    { to: '/crew',        icon: Users,         label: t('nav.crew'),        badge: 0 },
    { to: '/summary',     icon: BarChart3,     label: t('nav.summary'),     badge: 0 },
    { to: '/maintenance', icon: Wrench,        label: t('nav.maintenance'), badge: pendingMaint },
    { to: '/export',      icon: Download,      label: t('nav.export'),      badge: 0 },
    { to: '/ship',        icon: Anchor,        label: t('nav.ship'),        badge: 0 },
    { to: '/settings',    icon: Settings,      label: t('nav.settings'),    badge: 0 },
  ]

  const emergencyItems = [
    { to: '/emergency', icon: AlertTriangle, label: t('nav.emergency') },
    { to: '/safety', icon: ShieldCheck, label: t('nav.safety') },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-900 z-40 flex flex-col transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Anchor className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">Logbuch</div>
              <div className="text-xs text-gray-400 truncate max-w-[120px]">{shipLabel}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => window.innerWidth < 1024 && onClose()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-200 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="ml-auto text-[10px] font-semibold bg-white/20 text-gray-200 px-1.5 py-0.5 rounded-full leading-none tabular-nums">
                  {badge > 999 ? '999+' : badge}
                </span>
              )}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="pt-3 pb-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Quick Access
            </div>
          </div>

          {emergencyItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => window.innerWidth < 1024 && onClose()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? to === '/emergency' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                    : to === '/emergency' ? 'text-red-300 hover:bg-red-900/50 hover:text-red-200' : 'text-gray-200 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom version info */}
        <div className="px-4 py-3 border-t border-gray-700">
          <p className="text-xs text-gray-500">Logbuch v1.0.0</p>
          <p className="text-xs text-gray-600">Offline-ready PWA</p>
        </div>
      </aside>
    </>
  )
}
