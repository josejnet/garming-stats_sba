import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { ActivityDetail, ActivitySummary } from '../types/garmin'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { formatPace, formatDuration, formatDistance, formatDate, sportLabel } from '../utils/formatters'
import { HR_ZONE_DEFS } from '../utils/calculations'
import ActivityMap from '../components/ActivityMap'
import MetricCard from '../components/MetricCard'

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const loadDetail = useActivityStore(s => s.loadDetail)
  const activities = useVisibleActivities()
  const [detail, setDetail] = useState<ActivityDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    loadDetail(Number(id)).then(d => {
      setDetail(d)
      setLoading(false)
    })
  }, [id, loadDetail])

  const summary = activities.find(a => a.id === Number(id))

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Cargando actividad...
      </div>
    )
  }

  const act = detail ?? summary
  if (!act) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        Actividad no encontrada.{' '}
        <Link to="/activities" className="text-blue-400 ml-1">Volver</Link>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-5">
        <Link to="/activities" className="text-xs text-slate-500 hover:text-slate-300 mb-2 inline-block">← Actividades</Link>
        <h1 className="text-xl font-bold text-slate-100">{act.title}</h1>
        <div className="text-sm text-slate-500 mt-0.5">
          {formatDate(act.startTime)} · {sportLabel(act.sport)}
          <SourceLink activity={act} />
        </div>
      </div>

      {/* Map */}
      {detail?.gpxCoords && detail.gpxCoords.length > 0 && (
        <div className="mb-6">
          <ActivityMap coords={detail.gpxCoords} sport={act.sport} height={320} />
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {buildMetricCards(act).map(metric => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            unit={metric.unit}
            sub={metric.sub}
          />
        ))}
      </div>

      {detail && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <DetailInsight title="Datos disponibles" items={availableDataItems(detail)} />
          <DetailInsight title="Resumen técnico" items={technicalSummaryItems(detail)} />
        </div>
      )}

      {/* HR Zones */}
      {detail?.hrZones && detail.hrZones.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Zonas de frecuencia cardíaca</h2>
          <div className="space-y-2">
            {detail.hrZones.map((zone) => {
              const total = detail.hrZones.reduce((s, z) => s + z.seconds, 0)
              const pct = total > 0 ? (zone.seconds / total) * 100 : 0
              const def = HR_ZONE_DEFS[zone.zone - 1]
              return (
                <div key={zone.zone} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-slate-400">{zone.name}</div>
                  <div className="flex-1 bg-slate-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, background: def?.color ?? '#6b7280' }}
                    />
                  </div>
                  <div className="w-16 text-xs text-slate-400 text-right">{formatDuration(zone.seconds)}</div>
                  <div className="w-10 text-xs text-slate-500 text-right">{pct.toFixed(0)}%</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Laps */}
      {detail?.laps && detail.laps.length > 1 && (
        <section className="mb-6">
          <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">
            Splits ({detail.laps.length} km)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                  <th className="pb-2 pr-4">Km</th>
                  <th className="pb-2 pr-4">Tiempo</th>
                  {(act.sport === 'running' || act.sport === 'walking') && <th className="pb-2 pr-4">Ritmo</th>}
                  {act.sport === 'cycling' && <th className="pb-2 pr-4">Velocidad</th>}
                  {act.avgPower != null && <th className="pb-2 pr-4">Potencia</th>}
                  <th className="pb-2 pr-4">FC</th>
                  <th className="pb-2">Elev.</th>
                </tr>
              </thead>
              <tbody>
                {detail.laps.map(lap => (
                  <tr key={lap.index} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="py-2 pr-4 text-slate-400">{lap.index}</td>
                    <td className="py-2 pr-4 font-mono text-slate-200">{formatDuration(lap.duration)}</td>
                    {(act.sport === 'running' || act.sport === 'walking') && (
                      <td className="py-2 pr-4 font-mono text-slate-200">{formatPace(lap.avgPace)}</td>
                    )}
                    {act.sport === 'cycling' && (
                      <td className="py-2 pr-4 text-slate-200">{lap.avgSpeed ? `${lap.avgSpeed} km/h` : '–'}</td>
                    )}
                    {act.avgPower != null && (
                      <td className="py-2 pr-4 text-slate-200">{lap.avgPower ? `${lap.avgPower}W` : '–'}</td>
                    )}
                    <td className="py-2 pr-4 text-slate-400">{lap.avgHR ?? '–'}</td>
                    <td className="py-2 text-slate-400">{lap.elevationGain}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function SourceLink({ activity }: { activity: ActivityDetail | ActivitySummary }) {
  if (!activity.source) return null
  const label = activity.source === 'strava' ? 'Strava' : 'Garmin'
  const url = activity.sourceUrl || (
    activity.source === 'strava'
      ? `https://www.strava.com/activities/${activity.id}`
      : `https://connect.garmin.com/modern/activity/${activity.id}`
  )
  const color = activity.source === 'strava' ? 'text-orange-300 hover:text-orange-200' : 'text-blue-300 hover:text-blue-200'
  return (
    <>
      {' · '}
      <a href={url} target="_blank" rel="noreferrer" className={color}>
        Abrir en {label} ↗
      </a>
    </>
  )
}

interface DetailMetric {
  label: string
  value: string | number
  unit?: string
  sub?: string
}

type InsightItem = string | { key: string; content: ReactNode }

function DetailInsight({ title, items }: { title: string; items: InsightItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
      <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <span
            key={typeof item === 'string' ? item : item.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-900/30 px-2.5 py-1 text-xs text-slate-300"
          >
            {typeof item === 'string' ? item : item.content}
          </span>
        ))}
      </div>
    </section>
  )
}

function buildMetricCards(activity: ActivityDetail | ActivitySummary): DetailMetric[] {
  const metrics: DetailMetric[] = [
    { label: 'Distancia', value: formatDistance(activity.distance, activity.sport) },
    { label: 'Duración', value: formatDuration(activity.duration), sub: movingTimeSub(activity) },
  ]

  if ((activity.sport === 'running' || activity.sport === 'walking' || activity.sport === 'swimming') && activity.avgPace) {
    metrics.push({ label: activity.sport === 'swimming' ? 'Ritmo medio' : 'Ritmo medio', value: formatPace(activity.avgPace) })
  }

  if ((activity.sport === 'cycling' || activity.sport === 'walking') && activity.avgSpeed) {
    metrics.push({ label: 'Velocidad media', value: activity.avgSpeed, unit: 'km/h' })
  }

  if (activity.avgHR > 0) metrics.push({ label: 'FC media', value: activity.avgHR, unit: 'bpm' })
  if (activity.maxHR > 0) metrics.push({ label: 'FC máxima', value: activity.maxHR, unit: 'bpm' })
  if (activity.elevationGain > 0) metrics.push({ label: 'Elevación +', value: activity.elevationGain, unit: 'm' })

  if (activity.sport === 'cycling') {
    if (activity.avgPower) metrics.push({ label: 'Potencia media', value: activity.avgPower, unit: 'W' })
    if (activity.normalizedPower) metrics.push({ label: 'Potencia NP', value: activity.normalizedPower, unit: 'W' })
    if (activity.avgCadence) metrics.push({ label: 'Cadencia', value: activity.avgCadence, unit: 'rpm' })
  }

  if (activity.sport === 'running' || activity.sport === 'walking') {
    if (activity.avgCadence) metrics.push({ label: 'Cadencia', value: activity.avgCadence, unit: 'spm' })
    const stride = 'avgStrideLength' in activity ? activity.avgStrideLength : null
    if (stride) metrics.push({ label: 'Zancada media', value: stride.toFixed(2), unit: 'm' })
  }

  if (activity.sport === 'swimming') {
    if (activity.swolf) metrics.push({ label: 'SWOLF', value: Math.round(activity.swolf) })
    if (activity.avgStrokesPerLength) {
      metrics.push({ label: 'Brazadas/largo', value: activity.avgStrokesPerLength.toFixed(1) })
    }
  }

  if (activity.calories > 0) metrics.push({ label: 'Calorías', value: activity.calories, unit: 'kcal' })
  if (activity.aerobicTE != null) metrics.push({ label: 'TE aeróbico', value: activity.aerobicTE.toFixed(1) })
  if (activity.anaerobicTE != null) metrics.push({ label: 'TE anaeróbico', value: activity.anaerobicTE.toFixed(1) })
  const trainingEffect = 'trainingEffect' in activity ? activity.trainingEffect : null
  if (trainingEffect != null && activity.aerobicTE == null) {
    metrics.push({ label: 'Training Effect', value: trainingEffect.toFixed(1) })
  }

  return metrics
}

function movingTimeSub(activity: ActivityDetail | ActivitySummary) {
  if (!activity.movingTime || activity.movingTime === activity.duration) return undefined
  return `Movimiento: ${formatDuration(activity.movingTime)}`
}

function availableDataItems(activity: ActivityDetail): InsightItem[] {
  const items: InsightItem[] = []
  if (activity.gpxCoords.length > 0) items.push(`${activity.gpxCoords.length} puntos GPS`)
  if (activity.laps.length > 0) items.push(`${activity.laps.length} splits/vueltas`)
  if (activity.hrZones.length > 0) items.push(`${activity.hrZones.length} zonas FC`)
  if (activity.avgPower || activity.normalizedPower) items.push('Potencia')
  if (activity.avgCadence) items.push(activity.sport === 'cycling' ? 'Cadencia bici' : 'Cadencia zancada')
  if (activity.aerobicTE != null || activity.anaerobicTE != null || activity.trainingEffect != null) items.push('Training Effect')
  if (activity.startLocation) {
    const location = formatLocation(activity.startLocation)
    if (location) items.push({ key: `location-${location}`, content: <LocationChip location={activity.startLocation} /> })
  }
  return items
}

function LocationChip({ location }: { location: NonNullable<ActivitySummary['startLocation']> }) {
  const label = formatLocation(location)
  const code = countryCode(location.countryCode, location.country)
  return (
    <>
      {code && (
        <img
          src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
          srcSet={`https://flagcdn.com/32x24/${code.toLowerCase()}.png 2x`}
          alt={code}
          className="h-3 w-4 shrink-0 rounded-[1px]"
          loading="lazy"
        />
      )}
      <span>{label}</span>
    </>
  )
}

function formatLocation(location: ActivitySummary['startLocation']) {
  if (!location) return ''
  const parts = [location.city, location.region, location.country]
    .filter((part): part is string => Boolean(part?.trim()))
  return parts.length ? parts.join(', ') : location.label || ''
}

function countryCode(countryCode?: string | null, country?: string | null) {
  const code = countryCode || countryCodeFromName(country)
  if (!code || !/^[A-Z]{2}$/.test(code)) return ''
  return code
}

function countryCodeFromName(country?: string | null) {
  const normalized = country
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (!normalized) return ''
  const countries: Record<string, string> = {
    espana: 'ES',
    spain: 'ES',
    francia: 'FR',
    france: 'FR',
    colombia: 'CO',
    japon: 'JP',
    japan: 'JP',
    barein: 'BH',
    bahrain: 'BH',
    'arabia saudita': 'SA',
    'saudi arabia': 'SA',
    portugal: 'PT',
    italia: 'IT',
    italy: 'IT',
    alemania: 'DE',
    germany: 'DE',
    'reino unido': 'GB',
    'united kingdom': 'GB',
  }
  return countries[normalized] ?? ''
}

function technicalSummaryItems(activity: ActivityDetail): string[] {
  const items = []
  const zoneTotal = activity.hrZones.reduce((sum, zone) => sum + zone.seconds, 0)
  if (zoneTotal > 0) {
    const mainZone = activity.hrZones.reduce((best, zone) => zone.seconds > best.seconds ? zone : best, activity.hrZones[0])
    if (mainZone) items.push(`Zona dominante: ${mainZone.name} (${Math.round(mainZone.seconds / zoneTotal * 100)}%)`)
  }

  const laps = activity.laps.filter(lap => lap.duration > 0)
  if (laps.length > 0) {
    const fastestPaceLap = laps
      .filter(lap => lap.avgPace)
      .sort((a, b) => (a.avgPace ?? Infinity) - (b.avgPace ?? Infinity))[0]
    const fastestSpeedLap = laps
      .filter(lap => lap.avgSpeed)
      .sort((a, b) => (b.avgSpeed ?? 0) - (a.avgSpeed ?? 0))[0]
    if ((activity.sport === 'running' || activity.sport === 'walking') && fastestPaceLap?.avgPace) {
      items.push(`Mejor split: km ${fastestPaceLap.index} · ${formatPace(fastestPaceLap.avgPace)}`)
    } else if (activity.sport === 'cycling' && fastestSpeedLap?.avgSpeed) {
      items.push(`Split más rápido: ${fastestSpeedLap.avgSpeed} km/h`)
    }
  }

  if (activity.distance > 0 && activity.elevationGain > 0) {
    items.push(`Desnivel/km: ${(activity.elevationGain / activity.distance).toFixed(1)} m/km`)
  }
  if (activity.calories > 0 && activity.duration > 0) {
    items.push(`${Math.round(activity.calories / (activity.duration / 3600))} kcal/h`)
  }
  return items
}
