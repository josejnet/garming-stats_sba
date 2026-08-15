import { Link } from 'react-router-dom'
import { isSportEnabled, useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { formatShortDate, sportIcon } from '../utils/formatters'
import { useFitnessHistory } from '../hooks/useFitnessHistory'
import { useWeekComparison } from '../hooks/useWeekComparison'
import { useSportVolume } from '../hooks/useSportVolume'
import { useTrainingStreak } from '../hooks/useTrainingStreak'
import { useZoneDistribution } from '../hooks/useZoneDistribution'
import { useVo2maxTrend } from '../hooks/usePerformanceData'
import RadialProgress from '../components/RadialProgress'
import FormBadge from '../components/FormBadge'
import DeltaBadge from '../components/DeltaBadge'
import OnboardingCarousel from '../components/OnboardingCarousel'
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'

// Loading / Empty states

function LoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-slate-400 animate-pulse text-sm">Cargando...</div>
    </div>
  )
}

function EmptyScreen() {
  return <OnboardingCarousel />
}

function FilteredOutScreen() {
  return (
    <div className="flex-1 p-8 max-w-2xl">
      <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-6">
        <h2 className="text-amber-300 font-medium text-lg mb-2">Sin deportes activos con actividad</h2>
        <p className="text-sm text-slate-400">
          Activa running, ciclismo o natacion en Ajustes para que MostlyZ2 vuelva a incluir esas actividades en metricas y graficas.
        </p>
      </div>
    </div>
  )
}

// Dashboard

export default function Dashboard() {
  const allActivities = useActivityStore(s => s.activities)
  const activities = useVisibleActivities()
  const stats = useActivityStore(s => s.stats)
  const settings = useActivityStore(s => s.settings)
  const loading = useActivityStore(s => s.loading)
  const error = useActivityStore(s => s.error)

  const { current: fitness, sparkPoints, sparkRange } = useFitnessHistory()
  const { current: week, previous: lastWeek } = useWeekComparison()
  const { bySport: sportHours, totalHours, totalEstimatedSteps, avgDailyEstimatedSteps, percentages } = useSportVolume(30)
  const streak = useTrainingStreak()
  const { slices: zoneSlices, isAerobicFocused, unknownHours } = useZoneDistribution(30)
  const { current: currentVo2max, hasEstimated: hasEstimatedVo2 } = useVo2maxTrend()

  if (loading) return <LoadingScreen />
  if (error || allActivities.length === 0) return <EmptyScreen />
  if (activities.length === 0) return <FilteredOutScreen />

  const tsb = fitness?.tsb ?? 0
  const ctl = fitness?.ctl ?? 0
  const atl = fitness?.atl ?? 0
  const tsbColor = tsb > 10 ? '#22c55e' : tsb > -5 ? '#3b82f6' : tsb > -15 ? '#eab308' : tsb > -25 ? '#f97316' : '#ef4444'
  const sportRings = [
    { sport: 'running' as const,  label: 'Running',  color: '#ef4444', max: 20 },
    { sport: 'cycling' as const,  label: 'Ciclismo', color: '#f97316', max: 30 },
    { sport: 'walking' as const,  label: 'Caminar',  color: '#14b8a6', max: 8  },
    { sport: 'gym' as const,      label: 'Gym',      color: '#a855f7', max: 6  },
    { sport: 'swimming' as const, label: 'Natacion', color: '#3b82f6', max: 8  },
  ].filter(({ sport }) => isSportEnabled(sport, settings))
  const activeVolumeLabels = [
    { sport: 'running' as const, label: 'R' },
    { sport: 'cycling' as const, label: 'C' },
    { sport: 'walking' as const, label: 'W' },
    { sport: 'gym' as const, label: 'G' },
    { sport: 'swimming' as const, label: 'N' },
  ]
    .filter(({ sport }) => isSportEnabled(sport, settings))
    .map(({ sport, label }) => `${label} ${Math.round(percentages[sport])}%`)
    .join(' · ')
  const activeStepLabels = [
    { sport: 'running' as const, label: 'R' },
    { sport: 'cycling' as const, label: 'C' },
    { sport: 'walking' as const, label: 'W' },
    { sport: 'gym' as const, label: 'G' },
    { sport: 'swimming' as const, label: 'N' },
  ]
    .filter(({ sport }) => isSportEnabled(sport, settings) && sportHours[sport].estimatedSteps > 0)
    .map(({ sport, label }) => `${label} ${formatCompactNumber(sportHours[sport].estimatedSteps)}`)
    .join(' · ')
  const isLightTheme = settings.theme === 'light'
  const tooltipContentStyle = {
    background: isLightTheme ? '#ffffff' : '#1e293b',
    border: `1px solid ${isLightTheme ? '#94a3b8' : '#334155'}`,
    borderRadius: 8,
    boxShadow: isLightTheme ? '0 12px 28px rgb(15 23 42 / 0.18)' : 'none',
    color: isLightTheme ? '#0f172a' : '#e2e8f0',
    fontSize: 11,
  }
  const tooltipLabelStyle = {
    color: isLightTheme ? '#0f172a' : '#cbd5e1',
    fontWeight: 700,
    marginBottom: 4,
  }
  const tooltipItemStyle = {
    color: isLightTheme ? '#1e293b' : '#e2e8f0',
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#080f1e]">

      {/* Hero */}
      <div className="app-hero relative overflow-hidden px-6 pt-7 pb-6">
        <div className="absolute top-0 left-1/4 w-96 h-48 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: tsbColor }} />

        {/* Form title row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Estado de forma</div>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-black" style={{ color: tsbColor, textShadow: `0 0 30px ${tsbColor}66` }}>
                {tsb > 0 ? '+' : ''}{Math.round(tsb)}
              </span>
              <div>
                <FormBadge tsb={tsb} />
                <div className="text-xs text-slate-500 mt-1.5">Forma = Fitness - Fatiga</div>
              </div>
            </div>
          </div>

          {/* VO2max */}
          {currentVo2max ? (
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">VO2max</div>
              <div className="text-3xl font-black text-purple-400" style={{ textShadow: '0 0 20px #a855f766' }}>
                {currentVo2max.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">ml/kg/min</div>
              {hasEstimatedVo2 && <div className="text-[10px] text-slate-600">estimado</div>}
            </div>
          ) : null}
        </div>

        {/* CTL / ATL radials + streak */}
        <div className="flex items-center gap-8 mb-6">
          <div className="flex items-center gap-3">
            <RadialProgress value={ctl} max={100} color="#3b82f6" size={72} stroke={6}>
              <span className="text-base font-bold text-blue-300">{Math.round(ctl)}</span>
            </RadialProgress>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Fitness</div>
              <div className="text-xs text-slate-400">CTL · 42 días</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <RadialProgress value={atl} max={100} color="#f97316" size={72} stroke={6}>
              <span className="text-base font-bold text-orange-300">{Math.round(atl)}</span>
            </RadialProgress>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Fatiga</div>
              <div className="text-xs text-slate-400">ATL · 7 días</div>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {streak > 1 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
                style={{ borderColor: '#f59e0b40', background: '#f59e0b10' }}>
                <span className="text-lg">🔥</span>
                <div>
                  <div className="text-sm font-bold text-amber-400">{streak} días</div>
                  <div className="text-xs text-slate-500">racha activa</div>
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-xs text-slate-500">{activities.length} actividades activas</div>
              {stats?.syncedAt && (
                <div className="text-xs text-slate-600">
                  Sync: {formatShortDate(stats.syncedAt)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fitness sparkline */}
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkPoints} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gCTL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gATL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v: unknown, n: unknown) => [String(v), String(n)]}
                labelFormatter={(_label, payload) => {
                  const fullDate = payload?.[0]?.payload?.fullDate
                  return fullDate
                    ? formatShortDate(fullDate)
                    : ''
                }}
              />
              <Area type="monotone" dataKey="ctl" name="Fitness" stroke="#3b82f6" strokeWidth={2} fill="url(#gCTL)" dot={false} />
              <Area type="monotone" dataKey="atl" name="Fatiga" stroke="#f97316" strokeWidth={1.5} fill="url(#gATL)" dot={false} strokeDasharray="3 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-1">
          <LegendDot color="#3b82f6" label="Fitness (CTL)" />
          <LegendDot color="#f97316" label="Fatiga (ATL)" />
        </div>
        {sparkRange && <TemporalIndicator start={sparkRange.start} end={sparkRange.end} days={sparkRange.days} />}
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">

        {/* Week comparison */}
        <section>
          <SectionHeader left="Esta semana" right="vs semana anterior" />
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sesiones',    value: week.count,            prev: lastWeek.count,            fmt: (v: number) => String(v),              unit: '' },
              { label: 'Distancia',   value: week.distance,         prev: lastWeek.distance,         fmt: (v: number) => v.toFixed(1),           unit: 'km' },
              { label: 'Tiempo activo', value: week.duration / 3600,  prev: lastWeek.duration / 3600,  fmt: (v: number) => v.toFixed(1),           unit: 'h' },
            ].map(({ label, value, prev, fmt, unit }) => (
              <div key={label} className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-colors">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
                <div className="text-2xl font-bold text-slate-100 mb-1">
                  {fmt(value)}<span className="text-sm text-slate-500 ml-1">{unit}</span>
                </div>
                <DeltaBadge value={value - prev} unit={unit ? ` ${unit}` : ''} />
              </div>
            ))}
          </div>
        </section>

        {/* Sport rings + Zone radar */}
        <div className="grid grid-cols-2 gap-4">

          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Volumen · últimos 30 días</div>
              <div className="text-right text-xs text-slate-500 leading-relaxed">
                <div>
                  Total: <span className="text-slate-300 font-medium">{totalHours.toFixed(1)}h</span>
                  {totalHours > 0 && <> · {activeVolumeLabels}</>}
                </div>
                {totalEstimatedSteps > 0 && (
                  <div>
                    Pasos estimados/equiv.: <span className="text-slate-300 font-medium">{formatNumber(totalEstimatedSteps)}</span>
                    <span className="text-slate-600"> · {formatNumber(avgDailyEstimatedSteps)} /día</span>
                    {activeStepLabels && <span className="text-slate-600"> · {activeStepLabels}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {sportRings.map(({ sport, label, color, max }) => (
                <div key={sport} className="flex flex-col items-center gap-2">
                  <RadialProgress value={sportHours[sport].hours} max={max} color={color} size={80} stroke={7}>
                    <div className="text-center">
                      <div className="text-sm font-bold" style={{ color }}>{sportHours[sport].hours.toFixed(1)}</div>
                      <div className="text-xs text-slate-600">h</div>
                    </div>
                  </RadialProgress>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-300">{sportIcon(sport)} {label}</div>
                    <div className="text-xs text-slate-600">de {max}h ref.</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Zonas FC · 30 días</div>
            <div className="text-xs mb-2" style={{ color: isAerobicFocused ? '#22c55e' : '#eab308' }}>
              {isAerobicFocused ? 'OK Buena base aeróbica (Z1+Z2 >60%)' : 'Atención: añade más entrenamiento en Z1-Z2'}
              {unknownHours > 0 && <span className="text-slate-600"> · {unknownHours.toFixed(1)}h sin FC excluidas</span>}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={zoneSlices} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="zone" tick={{ fill: '#64748b', fontSize: 10 }} />
                <Radar dataKey="pct" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={1.5} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(v: unknown) => [`${v}%`, 'Tiempo']}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {zoneSlices.map(z => (
                <span key={z.zone} className="text-xs" style={{ color: z.color }}>{z.zone} {z.pct}%</span>
              ))}
            </div>
          </div>
        </div>

        <div className="h-2" />
      </div>
    </div>
  )
}

// Shared layout helpers

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="w-3 h-0.5 rounded inline-block" style={{ background: color }} />
      {label}
    </span>
  )
}

function TemporalIndicator({ start, end, days }: { start: string; end: string; days: number }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-700/40 bg-slate-900/20 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{formatShortDate(start)}</span>
        <span className="font-semibold uppercase tracking-wider text-slate-400">
          Ultimos {days} dias
        </span>
        <span>{formatShortDate(end)}</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-slate-700/60">
        <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60" style={{ width: '100%' }} />
        <div className="absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow" />
      </div>
      <div className="mt-1 text-right text-[10px] uppercase tracking-wider text-slate-500">
        Hoy
      </div>
    </div>
  )
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('es-ES')
}

function formatCompactNumber(value: number) {
  const rounded = Math.round(value)
  if (rounded >= 1000) return `${(rounded / 1000).toFixed(1).replace('.', ',')}k`
  return rounded.toLocaleString('es-ES')
}

function SectionHeader({
  left,
  right,
  rightLink,
}: {
  left: string
  right?: string
  rightLink?: { to: string; label: string }
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-xs text-slate-500 uppercase tracking-widest">{left}</div>
      {right && <div className="text-xs text-slate-600">{right}</div>}
      {rightLink && (
        <Link to={rightLink.to} className="text-xs text-blue-400 hover:text-blue-300">{rightLink.label}</Link>
      )}
    </div>
  )
}
