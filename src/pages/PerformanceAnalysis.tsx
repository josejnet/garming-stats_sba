import { useMemo, useState } from 'react'
import { formatDuration, sportColor, sportIcon } from '../utils/formatters'
import {
  HEATMAP_SPORTS,
  useAerobicEfficiency,
  useTrainingBalance,
  useVo2maxTrend,
  useConsistencyHeatmap,
} from '../hooks/usePerformanceData'
import { useVisibleActivities } from '../stores/activityStore'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts'

const VO2_RANGES = [
  { key: '1w', label: '1 semana', days: 7 },
  { key: '1m', label: '1 mes', days: 30 },
  { key: '3m', label: '3 meses', days: 90 },
  { key: '6m', label: '6 meses', days: 180 },
  { key: '12m', label: '12 meses', days: 365 },
  { key: '1y', label: 'Año actual', yearToDate: true },
  { key: '2y', label: '2 a\u00f1os', days: 730 },
] as const

type Vo2RangeKey = typeof VO2_RANGES[number]['key']

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
      <div className="mb-4">
        <div className="text-sm font-medium text-slate-200">{title}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function Insight({ label, color }: { label: string; color: string }) {
  return (
    <div className="text-xs px-2.5 py-1 rounded-full border"
      style={{ borderColor: color + '40', background: color + '12', color }}>
      {label}
    </div>
  )
}

export default function PerformanceAnalysis() {
  const activities = useVisibleActivities()
  const [vo2Range, setVo2Range] = useState<Vo2RangeKey>('12m')

  const { data: efData, trendPct: efTrend } = useAerobicEfficiency()
  const balance = useTrainingBalance(21)
  const { points: vo2Points, current: currentVo2, hasEstimated: hasEstimatedVo2 } = useVo2maxTrend()
  const heatmap = useConsistencyHeatmap(28)
  const filteredVo2Points = useMemo(() => filterVo2Points(vo2Points, vo2Range), [vo2Points, vo2Range])

  const vo2Label = currentVo2
    ? currentVo2 >= 60 ? 'Elite' : currentVo2 >= 55 ? 'Excelente' : currentVo2 >= 48 ? 'Buena' : currentVo2 >= 42 ? 'Moderada' : 'Mejorable'
    : null

  const insights = deriveInsights({ efTrend, heatmap })

  if (activities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        Sin datos. Actualiza desde Ajustes.
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h1 className="text-xl font-bold text-slate-100 mb-1">Analisis de rendimiento</h1>
      <p className="text-sm text-slate-500 mb-5">Carga, consistencia, eficiencia y distribución real de entrenamiento.</p>

      {insights.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {insights.map((ins, i) => <Insight key={i} label={ins.text} color={ins.color} />)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Section
          title="Eficiencia aeróbica"
          sub={efTrend != null
            ? `Running: ${efTrend > 0 ? '+' : ''}${efTrend}% en 12 meses`
            : 'Velocidad / FC o W / FC en sesiones comparables. Sube = mejor base aeróbica'}
        >
          {efData.some(d => d.run || d.bike || d.walk) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={efData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={36} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: unknown, n: unknown) => [Number(v).toFixed(2), String(n)]}
                />
                <Line type="monotone" dataKey="run" name="Running EF" stroke="#ef4444" dot={{ r: 3 }} strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="bike" name="Cycling EF" stroke="#f97316" dot={{ r: 3 }} strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="walk" name="Walking EF" stroke="#14b8a6" dot={{ r: 3 }} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty label="Sin datos suficientes" />
          )}
          <p className="text-xs text-slate-600 mt-2">Running/Caminar: km/h dividido por bpm. Cycling: W dividido por bpm.</p>
        </Section>

        <Section
          title="Balance de entrenamiento (ultimas 3 semanas)"
          sub="Distribución real por tiempo en movimiento y carga estimada."
        >
          <div className="space-y-4 py-2">
            {balance.length > 0 ? balance.map(row => {
              const color = sportColor(row.sport)
              return (
                <div key={row.sport}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{row.icon} {row.label}</span>
                    <span style={{ color }}>
                      {row.pct}% tiempo · {row.loadPct}% carga · {row.hours}h · {row.load} TSS · {row.count} sesiones
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-700 rounded-full">
                    <div className="h-2.5 rounded-full" style={{ width: `${Math.min(row.pct, 100)}%`, background: color }} />
                  </div>
                </div>
              )
            }) : <Empty label="Sin actividad reciente" />}
          </div>
          <p className="text-xs text-slate-600 mt-3">No hay ideal fijo: muestra dónde se va tu tiempo y dónde se acumula la carga.</p>
        </Section>

        <Section
          title="Tendencia VO2max"
          sub={currentVo2 ? `Actual: ${currentVo2.toFixed(1)} ml/kg/min - ${vo2Label}${hasEstimatedVo2 ? ' - estimado cuando no hay dato directo' : ''}` : 'Estimado desde tus actividades de running'}
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {VO2_RANGES.map(range => (
              <button
                key={range.key}
                type="button"
                onClick={() => setVo2Range(range.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  vo2Range === range.key
                    ? 'bg-purple-500 text-white'
                    : 'bg-slate-900/40 text-slate-400 hover:bg-slate-700/70 hover:text-slate-200'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          {filteredVo2Points.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={filteredVo2Points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} interval={Math.floor(filteredVo2Points.length / 6)} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={36} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: unknown) => [Number(v).toFixed(1), 'VO2max']}
                />
                <ReferenceArea y1={55} y2={70} fill="#22c55e" fillOpacity={0.05} />
                <ReferenceArea y1={48} y2={55} fill="#3b82f6" fillOpacity={0.05} />
                <Line type="monotone" dataKey="vo2max" stroke="#a855f7" dot={{ r: 3 }} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty label={vo2Points.length === 0 ? 'Sin datos VO2max' : 'Pocas mediciones en este rango'} />
          )}
        </Section>

        <Section
          title="Consistencia (últimos 28 días)"
          sub={`${heatmap.activeDaysCount} días con actividad real · mínimo 15 min · intensidad = horas en movimiento`}
        >
          <div className="space-y-2 py-1">
            {HEATMAP_SPORTS.map(sport => {
              const data = heatmap.bySport[sport]
              const color = sportColor(sport)
              const maxH = Math.max(...data, 0.01)
              return (
                <div key={sport} className="flex items-center gap-2">
                  <div className="w-5 text-sm">{sportIcon(sport)}</div>
                  <div className="flex gap-0.5 flex-1">
                    {data.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: 20,
                          background: h > 0 ? colorWithAlpha(color, 0.18 + (h / maxH) * 0.82) : 'rgba(51,65,85,0.3)',
                        }}
                        title={`${heatmap.dates[i]}: ${h > 0 ? formatDuration(h * 3600) : '-'}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="flex gap-0.5 pl-7">
              {heatmap.dates.map((d, i) => (
                i % 7 === 0
                  ? <div key={i} className="flex-1 text-center" style={{ fontSize: 8, color: '#475569' }}>{d}</div>
                  : <div key={i} className="flex-1" />
              ))}
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="h-48 flex items-center justify-center text-slate-600 text-sm">{label}</div>
}

function colorWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function filterVo2Points(points: ReturnType<typeof useVo2maxTrend>['points'], rangeKey: Vo2RangeKey) {
  const range = VO2_RANGES.find(item => item.key === rangeKey) ?? VO2_RANGES[4]
  if ('yearToDate' in range) {
    const yearStart = `${new Date().getFullYear()}-01-01`
    return points.filter(point => point.isoDate >= yearStart)
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - range.days)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return points.filter(point => point.isoDate >= cutoffIso)
}

function deriveInsights({
  efTrend,
  heatmap,
}: {
  efTrend: number | null
  heatmap: ReturnType<typeof useConsistencyHeatmap>
}): { text: string; color: string }[] {
  const result: { text: string; color: string }[] = []

  if (efTrend != null && efTrend > 2) result.push({ text: 'Eficiencia aeróbica mejorando', color: '#22c55e' })
  if (efTrend != null && efTrend < -2) result.push({ text: 'Eficiencia aeróbica bajando: más Z1/Z2', color: '#f97316' })

  if (heatmap.activeDaysCount >= 20) result.push({ text: 'Consistencia excelente en 28 días', color: '#22c55e' })
  else if (heatmap.activeDaysCount < 12) result.push({ text: 'Aumenta la frecuencia semanal', color: '#eab308' })

  return result
}
