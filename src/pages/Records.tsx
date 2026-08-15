import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { formatShortDate } from '../utils/formatters'
import { computePRs } from '../utils/calculations'
import type { PR } from '../utils/calculations'

const SPORT_SECTIONS = [
  { key: 'running', title: 'Running', icon: '🏃' },
  { key: 'cycling', title: 'Ciclismo', icon: '🚴' },
  { key: 'walking', title: 'Caminar', icon: '🚶' },
  { key: 'gym', title: 'Gym', icon: '🏋️' },
] as const

function PRTable({ title, prs, icon }: { title: string; prs: PR[]; icon: string }) {
  if (prs.length === 0) return null
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
      <h2 className="text-sm font-medium text-slate-200 mb-4">{icon} {title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
            <th className="pb-2 pr-4">Tipo</th>
            <th className="pb-2 pr-4">Récord</th>
            <th className="pb-2 pr-4">Marca</th>
            <th className="pb-2 pr-4">Detalle</th>
            <th className="pb-2 pr-4">Actividad</th>
            <th className="pb-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {prs.map(pr => (
            <tr key={pr.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
              <td className="py-2.5 pr-4 text-xs text-slate-500">{pr.category}</td>
              <td className="py-2.5 pr-4 font-medium text-slate-200">{pr.label}</td>
              <td className="py-2.5 pr-4 font-mono text-slate-200">{pr.value}</td>
              <td className="py-2.5 pr-4 font-mono text-slate-400">{pr.detail ?? '–'}</td>
              <td className="py-2.5 pr-4 max-w-md">
                <Link to={`/activity/${pr.activityId}`} className="text-blue-400 hover:text-blue-300 line-clamp-1">
                  {pr.activityTitle}
                </Link>
              </td>
              <td className="py-2.5 text-slate-400">{formatShortDate(pr.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Records() {
  const activities = useVisibleActivities()
  const settings = useActivityStore(s => s.settings)
  const loadActivities = useActivityStore(s => s.loadActivities)
  const loadStats = useActivityStore(s => s.loadStats)
  const [lastRecalculatedAt, setLastRecalculatedAt] = useState<string | null>(null)
  const personalRecords = computePRs(activities, settings)
  const hasAny = Object.values(personalRecords).some(prs => prs.length > 0)

  async function recalculate() {
    await Promise.all([loadActivities(), loadStats()])
    setLastRecalculatedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100 mb-1">Récords personales</h1>
          <p className="text-sm text-slate-500">
            Mejores medias por distancia, máximos de distancia, tiempo en movimiento, desnivel, carga y potencia.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Los récords por distancia usan la media de la actividad completa; los segmentos reales vendrán cuando usemos laps/GPS.
          </p>
          {lastRecalculatedAt && (
            <p className="text-xs text-slate-600 mt-1">Recalculado a las {lastRecalculatedAt}</p>
          )}
        </div>
        <button
          onClick={() => recalculate().catch(() => undefined)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Recalcular records
        </button>
      </div>

      {!hasAny ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No hay suficientes datos para calcular récords.
        </div>
      ) : (
        <div className="space-y-4">
          {SPORT_SECTIONS.map(section => (
            <PRTable
              key={section.key}
              title={section.title}
              icon={section.icon}
              prs={personalRecords[section.key] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
