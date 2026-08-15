import { NavLink } from 'react-router-dom'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { formatShortDate } from '../utils/formatters'
import type { ThemeMode } from '../types/garmin'
import type { SessionUser } from '../pages/Login'

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'O' },
  { to: '/activities', label: 'Actividades', icon: 'A' },
  { to: '/fitness', label: 'Fitness & Forma', icon: 'F' },
  { to: '/zones', label: 'Zonas', icon: 'Z' },
  { to: '/performance', label: 'Rendimiento', icon: 'P' },
  { to: '/records', label: 'Records', icon: 'R' },
  { to: '/settings', label: 'Ajustes', icon: 'S' },
  { to: '/docs', label: 'Documentación', icon: 'D' },
]

export default function Sidebar({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const stats = useActivityStore(s => s.stats)
  const allActivities = useActivityStore(s => s.activities)
  const activities = useVisibleActivities()
  const theme = useActivityStore(s => s.settings.theme)
  const updateSettings = useActivityStore(s => s.updateSettings)

  return (
    <aside className="flex min-h-screen w-16 shrink-0 flex-col border-r border-slate-700/50 bg-slate-900 md:w-56">
      <div className="border-b border-slate-700/50 px-2 py-4 md:px-5 md:py-5">
        <div className="flex items-center justify-center gap-3 md:justify-start">
          <div className="grid size-9 place-items-center rounded-lg bg-blue-500/15 border border-blue-400/30 text-blue-300 font-black">
            Z2
          </div>
          <div className="hidden md:block">
            <div className="text-blue-400 font-bold text-lg tracking-tight">MostlyZ2</div>
            <div className="text-xs text-slate-400">Z2 Agent</div>
          </div>
        </div>
        <div className="mt-3 hidden text-xs text-slate-500 md:block">
          {activities.length > 0 ? `${activities.length} activas` : allActivities.length > 0 ? 'Deportes apagados' : 'Sin datos aun'}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-1 py-3 md:px-2 md:py-4">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors md:justify-start md:px-3 ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`
            }
          >
            <span className="grid size-5 place-items-center rounded text-[10px] font-bold" aria-hidden="true">{icon}</span>
            <span className="hidden md:inline">{label}</span>
            <span className="sr-only md:hidden">{label}</span>
          </NavLink>
        ))}

        <div className="mt-4 px-0 md:px-3">
          <div className="mb-2 hidden text-[10px] uppercase tracking-wider text-slate-600 md:block">Apariencia</div>
          <div className="mx-auto flex w-fit flex-col gap-0.5 rounded-lg bg-slate-800 p-0.5 md:mx-0 md:inline-flex md:flex-row">
            {(['dark', 'light'] as ThemeMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => updateSettings({ theme: mode })}
                aria-label={`Usar modo ${mode === 'dark' ? 'oscuro' : 'claro'}`}
                title={mode === 'dark' ? 'Modo oscuro' : 'Modo claro'}
                className={`rounded-md px-2 py-1.5 text-[10px] transition-colors md:px-2.5 md:text-xs ${
                  theme === mode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="md:hidden">{mode === 'dark' ? 'O' : 'C'}</span>
                <span className="hidden md:inline">{mode === 'dark' ? 'Oscuro' : 'Claro'}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="hidden border-t border-slate-700/50 px-5 py-4 md:block">
        <div className="mb-4 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
          <div className="truncate text-xs font-medium text-slate-300">
            {user.displayName || user.display_name || user.email || 'MostlyZ2 user'}
          </div>
          {user.email && <div className="mt-0.5 truncate text-[11px] text-slate-500">{user.email}</div>}
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined)
              onLogout()
            }}
            className="mt-2 text-[11px] text-slate-500 hover:text-slate-200"
          >
            Salir
          </button>
        </div>
        {stats && (
          <>
          <div className="text-xs text-slate-500">Ultima sync</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {formatShortDate(stats.syncedAt)}
          </div>
          <div className="mt-3 text-xs text-slate-600 leading-relaxed">
            Actualiza desde Ajustes con el boton de datos.
          </div>
          </>
        )}
      </div>
    </aside>
  )
}
