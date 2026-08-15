import type { ActivitySummary, FitnessPoint, HRZone, UserSettings } from '../types/garmin'

export type LoadSource = 'direct' | 'power' | 'pace' | 'hr' | 'fallback'
export type LoadConfidence = 'high' | 'medium' | 'low'

export interface TrainingLoad {
  tss: number
  source: LoadSource
  confidence: LoadConfidence
}

export function effectiveDuration(activity: Pick<ActivitySummary, 'movingTime' | 'duration'>): number {
  return Math.max(0, activity.movingTime || activity.duration || 0)
}

export function elapsedDuration(activity: Pick<ActivitySummary, 'duration'>): number {
  return Math.max(0, activity.duration || 0)
}

export function trainingLoad(activity: ActivitySummary, settings: UserSettings): TrainingLoad {
  if (activity.tss != null && Number.isFinite(activity.tss)) {
    return { tss: Math.max(0, activity.tss), source: 'direct', confidence: 'high' }
  }

  const hours = effectiveDuration(activity) / 3600
  if (hours <= 0) return { tss: 0, source: 'fallback', confidence: 'low' }

  if (activity.sport === 'cycling') {
    const watts = activity.normalizedPower || activity.avgPower
    if (watts && watts > 0 && settings.ftp > 0) {
      const intensityFactor = clamp(watts / settings.ftp, 0.35, 1.4)
      return {
        tss: Math.round(hours * intensityFactor * intensityFactor * 100),
        source: 'power',
        confidence: activity.normalizedPower ? 'high' : 'medium',
      }
    }
  }

  if ((activity.sport === 'running' || activity.sport === 'walking') && activity.avgPace && settings.thresholdPace > 0) {
    const intensityFactor = clamp(settings.thresholdPace / activity.avgPace, 0.3, 1.35)
    const sportFactor = activity.sport === 'walking' ? 0.55 : 1
    return {
      tss: Math.round(hours * intensityFactor * intensityFactor * 100 * sportFactor),
      source: 'pace',
      confidence: activity.sport === 'running' ? 'medium' : 'low',
    }
  }

  const hrLoad = estimateLoadFromHR(activity, settings, hours)
  if (hrLoad) return hrLoad

  const hourlyFallback: Record<string, number> = {
    running: 55,
    cycling: 45,
    swimming: 50,
    walking: 20,
    gym: 35,
    other: 20,
  }
  return {
    tss: Math.round(hours * (hourlyFallback[activity.sport] ?? hourlyFallback.other)),
    source: 'fallback',
    confidence: 'low',
  }
}

export function estimateTSS(activity: ActivitySummary, settings: UserSettings): number {
  return trainingLoad(activity, settings).tss
}

function estimateLoadFromHR(activity: ActivitySummary, settings: UserSettings, hours: number): TrainingLoad | null {
  if (!activity.avgHR || activity.avgHR < 60 || activity.avgHR >= settings.maxHR || settings.maxHR <= 80) return null

  const restingHR = 60
  const reserveRange = settings.maxHR - restingHR
  if (reserveRange <= 0) return null

  const hrReserve = clamp((activity.avgHR - restingHR) / reserveRange, 0, 1)
  const thresholdHRReserve = clamp((settings.lthrRunning - restingHR) / reserveRange, 0.1, 1)

  const trimp = hours * 60 * hrReserve * 0.64 * Math.exp(1.92 * hrReserve)
  const thresholdTRIMP = 60 * thresholdHRReserve * 0.64 * Math.exp(1.92 * thresholdHRReserve)
  if (!Number.isFinite(trimp) || !Number.isFinite(thresholdTRIMP) || thresholdTRIMP <= 0) return null

  const sportFactor: Record<string, number> = {
    running: 1,
    cycling: 0.92,
    swimming: 0.95,
    walking: 0.65,
    gym: 0.75,
    other: 0.65,
  }

  return {
    tss: Math.max(0, Math.round((trimp / thresholdTRIMP) * 100 * (sportFactor[activity.sport] ?? sportFactor.other))),
    source: 'hr',
    confidence: 'medium',
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateFitnessHistory(
  activities: ActivitySummary[],
  settings: UserSettings
): FitnessPoint[] {
  if (activities.length === 0) return []

  const dailyTSS: Record<string, number> = {}
  for (const act of activities) {
    const date = act.startTime.slice(0, 10)
    dailyTSS[date] = (dailyTSS[date] ?? 0) + estimateTSS(act, settings)
  }

  const dates = Object.keys(dailyTSS).sort()
  if (dates.length === 0) return []

  const startDate = new Date(dates[0])
  const endDate = new Date()
  const allDates: string[] = []
  const d = new Date(startDate)
  while (d <= endDate) {
    allDates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }

  const ctlK = 2 / (42 + 1)
  const atlK = 2 / (7 + 1)
  let ctl = 0
  let atl = 0

  return allDates.map(date => {
    const tss = dailyTSS[date] ?? 0
    ctl = ctl + ctlK * (tss - ctl)
    atl = atl + atlK * (tss - atl)
    return {
      date,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
      tss,
    }
  })
}

export interface ZoneDef {
  zone: number
  name: string
  color: string
  minPct: number
  maxPct: number
}

export const HR_ZONE_DEFS: ZoneDef[] = [
  { zone: 1, name: 'Recovery', color: '#22c55e', minPct: 0, maxPct: 0.6 },
  { zone: 2, name: 'Aerobic', color: '#84cc16', minPct: 0.6, maxPct: 0.7 },
  { zone: 3, name: 'Tempo', color: '#eab308', minPct: 0.7, maxPct: 0.8 },
  { zone: 4, name: 'Threshold', color: '#f97316', minPct: 0.8, maxPct: 0.9 },
  { zone: 5, name: 'VO2max', color: '#ef4444', minPct: 0.9, maxPct: 1.0 },
]

export function getZoneBPM(maxHR: number): { zone: number; low: number; high: number }[] {
  return HR_ZONE_DEFS.map((z, i) => ({
    zone: z.zone,
    low: Math.round(maxHR * z.minPct),
    high: i === HR_ZONE_DEFS.length - 1 ? maxHR : Math.round(maxHR * z.maxPct),
  }))
}

export function hrZoneForBPM(bpm: number, maxHR: number): number | null {
  if (!bpm || bpm < 60 || !maxHR || maxHR <= 80 || bpm >= maxHR) return null
  const pct = bpm / maxHR
  for (let i = HR_ZONE_DEFS.length - 1; i >= 0; i--) {
    if (pct >= HR_ZONE_DEFS[i].minPct) return i + 1
  }
  return 1
}

export function estimateZonesFromHR(
  avgHR: number,
  duration: number,
  maxHR: number
): HRZone[] {
  const zone = hrZoneForBPM(avgHR, maxHR)
  return HR_ZONE_DEFS.map((z) => ({
    zone: z.zone,
    name: z.name,
    seconds: zone === z.zone ? Math.max(duration, 0) : 0,
    lowBPM: Math.round(maxHR * z.minPct),
    highBPM: Math.round(maxHR * z.maxPct),
  }))
}

export function hasUsableHR(activity: Pick<ActivitySummary, 'avgHR'>, maxHR: number): boolean {
  return hrZoneForBPM(activity.avgHR, maxHR) != null
}

export interface WeekSummary {
  weekStart: string
  totalTSS: number
  totalDistance: number
  totalDuration: number
  byType: Record<string, { distance: number; duration: number; count: number; tss: number }>
}

export function aggregateByWeek(activities: ActivitySummary[], settings: UserSettings): WeekSummary[] {
  if (activities.length === 0) return []

  const weeks: Record<string, WeekSummary> = {}
  const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const firstWeek = mondayKey(sorted[0].startTime)
  const currentWeek = mondayKey(new Date().toISOString())

  for (let d = new Date(firstWeek); d <= new Date(currentWeek); d.setDate(d.getDate() + 7)) {
    const weekKey = d.toISOString().slice(0, 10)
    weeks[weekKey] = {
      weekStart: weekKey,
      totalTSS: 0,
      totalDistance: 0,
      totalDuration: 0,
      byType: {},
    }
  }

  for (const act of activities) {
    const weekKey = mondayKey(act.startTime)
    weeks[weekKey] ??= {
      weekStart: weekKey,
      totalTSS: 0,
      totalDistance: 0,
      totalDuration: 0,
      byType: {},
    }

    const w = weeks[weekKey]
    const tss = estimateTSS(act, settings)
    const duration = effectiveDuration(act)
    w.totalTSS += tss
    w.totalDistance += act.distance
    w.totalDuration += duration

    const sport = act.sport
    if (!w.byType[sport]) w.byType[sport] = { distance: 0, duration: 0, count: 0, tss: 0 }
    w.byType[sport].distance += act.distance
    w.byType[sport].duration += duration
    w.byType[sport].count += 1
    w.byType[sport].tss += tss
  }

  return Object.values(weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

function mondayKey(isoDate: string): string {
  const d = new Date(isoDate)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export interface PR {
  id: string
  category: 'Tiempo' | 'Distancia' | 'Carga' | 'Potencia' | 'Frecuencia'
  label: string
  value: string
  detail?: string
  activityId: number
  activityTitle: string
  date: string
}

const RUNNING_DISTANCES = [
  { km: 1, label: '1 km' },
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.097, label: 'Half Marathon' },
  { km: 42.195, label: 'Marathon' },
]

const CYCLING_DISTANCES = [
  { km: 40, label: '40 km' },
  { km: 90, label: '90 km' },
  { km: 180, label: '180 km' },
]

export function computePRs(activities: ActivitySummary[], settings?: UserSettings): Record<string, PR[]> {
  return {
    running: [
      ...findFastestDistanceRecords(activities.filter(a => a.sport === 'running'), RUNNING_DISTANCES, 'pace'),
      ...findGeneralRecords(activities.filter(a => a.sport === 'running'), settings),
    ],
    cycling: [
      ...findFastestDistanceRecords(activities.filter(a => a.sport === 'cycling'), CYCLING_DISTANCES, 'speed'),
      ...findGeneralRecords(activities.filter(a => a.sport === 'cycling'), settings, { includePower: true }),
    ],
    walking: [
      ...findFastestDistanceRecords(activities.filter(a => a.sport === 'walking'), [
        { km: 1, label: '1 km' },
        { km: 5, label: '5 km' },
        { km: 10, label: '10 km' },
      ], 'pace'),
      ...findGeneralRecords(activities.filter(a => a.sport === 'walking'), settings),
    ],
    gym: findGeneralRecords(activities.filter(a => a.sport === 'gym'), settings, { includeDistance: false }),
  }
}

function findFastestDistanceRecords(
  activities: ActivitySummary[],
  distances: { km: number; label: string }[],
  detailMode: 'pace' | 'speed'
): PR[] {
  return distances.map(({ km, label }) => {
    const candidates = activities.filter(a => a.distance >= km * 0.95)
    let best: PR | null = null
    for (const act of candidates) {
      const duration = estimatedDurationForDistance(act, km)
      if (!duration) continue
      if (!best || duration < durationValue(best.value)) {
        const speed = km / (duration / 3600)
        best = {
          id: `best-average-${label}`,
          category: 'Tiempo',
          label: `${label} (media actividad)`,
          value: formatRecordDuration(duration),
          detail: detailMode === 'speed' ? `${speed.toFixed(1)} km/h` : `${formatRecordPace(duration / km)} /km`,
          activityId: act.id,
          activityTitle: act.title,
          date: act.startTime.slice(0, 10),
        }
      }
    }
    return best
  }).filter(Boolean) as PR[]
}

function estimatedDurationForDistance(activity: ActivitySummary, km: number): number | null {
  if (activity.distance <= 0) return null
  const duration = effectiveDuration(activity)
  if (duration <= 0) return null
  return Math.round(km * (duration / activity.distance))
}

function findGeneralRecords(
  activities: ActivitySummary[],
  settings?: UserSettings,
  options: { includeDistance?: boolean; includePower?: boolean } = {}
): PR[] {
  const includeDistance = options.includeDistance ?? true
  const records: PR[] = []

  if (includeDistance) {
    const longest = maxBy(activities, a => a.distance)
    if (longest && longest.distance > 0) records.push(recordFromActivity(longest, 'Distancia', 'Mayor distancia', `${longest.distance.toFixed(2)} km`))
  }

  const longestTime = maxBy(activities, a => effectiveDuration(a))
  if (longestTime && effectiveDuration(longestTime) > 0) records.push(recordFromActivity(longestTime, 'Tiempo', 'Mayor tiempo en movimiento', formatRecordDuration(effectiveDuration(longestTime))))

  const elevation = maxBy(activities, a => a.elevationGain)
  if (elevation && elevation.elevationGain > 0) records.push(recordFromActivity(elevation, 'Distancia', 'Mayor desnivel +', `${Math.round(elevation.elevationGain)} m`))

  const avgHr = maxBy(activities, a => a.avgHR)
  if (avgHr && avgHr.avgHR > 0) records.push(recordFromActivity(avgHr, 'Frecuencia', 'FC media más alta', `${Math.round(avgHr.avgHR)} bpm`))

  if (settings) {
    const load = maxBy(activities, a => trainingLoad(a, settings).tss)
    if (load && trainingLoad(load, settings).tss > 0) records.push(recordFromActivity(load, 'Carga', 'Mayor carga estimada', `${Math.round(trainingLoad(load, settings).tss)} TSS`))
  }

  if (options.includePower) {
    const power = maxBy(activities, a => a.normalizedPower || a.avgPower || 0)
    const watts = power ? power.normalizedPower || power.avgPower || 0 : 0
    if (power && watts > 0) records.push(recordFromActivity(power, 'Potencia', power.normalizedPower ? 'Potencia normalizada más alta' : 'Potencia media más alta', `${Math.round(watts)} W`))
  }

  return records
}

function recordFromActivity(activity: ActivitySummary, category: PR['category'], label: string, value: string, detail?: string): PR {
  return {
    id: `${category}-${label}`,
    category,
    label,
    value,
    detail,
    activityId: activity.id,
    activityTitle: activity.title,
    date: activity.startTime.slice(0, 10),
  }
}

function maxBy(activities: ActivitySummary[], value: (activity: ActivitySummary) => number | null | undefined) {
  let best: ActivitySummary | null = null
  let bestValue = Number.NEGATIVE_INFINITY
  for (const activity of activities) {
    const current = value(activity)
    if (current == null || !Number.isFinite(current)) continue
    if (current > bestValue) {
      best = activity
      bestValue = current
    }
  }
  return best
}

function durationValue(value: string): number {
  const hours = value.match(/(\d+)h/)
  const minutes = value.match(/(\d+)m/)
  const seconds = value.match(/(\d+):(\d+)/)
  if (hours || minutes) return (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0)
  if (seconds) return Number(seconds[1]) * 60 + Number(seconds[2])
  return Number.POSITIVE_INFINITY
}

function formatRecordDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatRecordPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
