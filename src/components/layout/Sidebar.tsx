import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BarChart2, Settings, LogOut, FlaskConical, Map } from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/insights', label: 'Insights', icon: BarChart2 },
  { to: '/dashboard/reports', label: 'Maps', icon: Map },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  { to: '/dashboard/backend-test', label: 'Backend Test', icon: FlaskConical },
]

export default function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white transition-colors dark:border-gray-800 dark:bg-gray-950">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6 dark:border-gray-800">
        <div className="h-7 w-7 rounded-lg bg-brand-600" />
        <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">Anchor</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
