import { useMemo } from 'react'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { isoDateOffset, monthKey } from '../utils/date'
import { formatShortDate, sportIcon, sportLabel } from '../utils/formatters'
import { effectiveDuration, estimateTSS, hrZoneForBPM } from '../utils/calculations'
import type { ActivitySummary, PrimarySport, Sport } from '../types/garmin'

function aerobicEF(a: ActivitySummary, maxHR: number): number | null {
  if (!a.avgHR || a.avgHR < 60) return null
  const duration = effectiveDuration(a)
  if (duration < 30 * 60) return null
  const zone = hrZoneForBPM(a.avgHR, maxHR)
  if (zone == null || zone > 3) return null
  if (a.sport === 'running' && a.avgSpeed) return +(a.avgSpeed / a.avgHR * 100).toFixed(2)
  if (a.sport === 'cycling' && (a.normalizedPower || a.avgPower)) return +((a.normalizedPower || a.avgPower || 0) / a.avgHR).toFixed(2)
  if (a.sport === 'walking' && a.avgSpeed) return +(a.avgSpeed / a.avgHR * 100).toFixed(2)
  return null
}

export interface AerobicEFPoint {
  month: string
  run: number | null
  bike: number | null
  walk: number | null
}

export function useAerobicEfficiency(): { data: AerobicEFPoint[]; trendPct: number | null } {
  const activities = useVisibleActivities()
  const maxHR = useActivityStore(s => s.settings.maxHR)

  return useMemo(() => {
    const byMonth: Record<string, { run: WeightedValue[]; bike: WeightedValue[]; walk: WeightedValue[] }> = {}

    for (const a of activities) {
      const m = monthKey(a.startTime)
      if (!byMonth[m]) byMonth[m] = { run: [], bike: [], walk: [] }
      const ef = aerobicEF(a, maxHR)
      if (ef == null) continue
      const point = { value: ef, weight: effectiveDuration(a) }
      if (a.sport === 'running') byMonth[m].run.push(point)
      if (a.sport === 'cycling') byMonth[m].bike.push(point)
      if (a.sport === 'walking') byMonth[m].walk.push(point)
    }

    const avg = (arr: WeightedValue[]): number | null => weightedAvg(arr)

    const data = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, d]) => ({ month: month.split('-').reverse().join('/'), run: avg(d.run), bike: avg(d.bike), walk: avg(d.walk) }))

    const runPoints = data.filter(d => d.run != null)
    const trendPct = runPoints.length >= 2
      ? +((runPoints.at(-1)!.run! - runPoints[0].run!) / runPoints[0].run! * 100).toFixed(1)
      : null

    return { data, trendPct }
  }, [activities, maxHR])
}

interface WeightedValue {
  value: number
  weight: number
}

function weightedAvg(arr: WeightedValue[]): number | null {
  const totalWeight = arr.reduce((sum, item) => sum + item.weight, 0)
  if (!arr.length || totalWeight <= 0) return null
  return +(arr.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight).toFixed(2)
}

const BALANCE_SPORTS: PrimarySport[] = ['running', 'cycling', 'walking', 'gym', 'swimming']

export interface SportBalanceRow {
  sport: Sport
  label: string
  icon: string
  pct: number
  hours: number
  load: number
  loadPct: number
  count: number
}

export function useTrainingBalance(windowDays = 21): SportBalanceRow[] {
  const activities = useVisibleActivities()
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const cutoff = isoDateOffset(windowDays)
    const recent = activities.filter(a => a.startTime.slice(0, 10) >= cutoff)
    const totals = Object.fromEntries(
      BALANCE_SPORTS.map(s => [s, { hours: 0, load: 0, count: 0 }])
    ) as Record<PrimarySport, { hours: number; load: number; count: number }>

    for (const a of recent) {
      if (!Object.hasOwn(totals, a.sport)) continue
      const sport = a.sport as PrimarySport
      totals[sport].hours += effectiveDuration(a) / 3600
      totals[sport].load += estimateTSS(a, settings)
      totals[sport].count += 1
    }

    const totalHours = BALANCE_SPORTS.reduce((sum, sport) => sum + totals[sport].hours, 0) || 1
    const totalLoad = BALANCE_SPORTS.reduce((sum, sport) => sum + totals[sport].load, 0) || 1

    return BALANCE_SPORTS
      .filter(sport => settings.enabledSports[sport])
      .map(sport => ({
        sport,
        label: sportLabel(sport),
        icon: sportIcon(sport),
        pct: Math.round(totals[sport].hours / totalHours * 100),
        hours: +totals[sport].hours.toFixed(1),
        load: Math.round(totals[sport].load),
        loadPct: Math.round(totals[sport].load / totalLoad * 100),
        count: totals[sport].count,
      }))
      .filter(row => row.hours > 0 || row.count > 0)
  }, [activities, settings, windowDays])
}

export interface Vo2maxPoint {
  isoDate: string
  date: string
  vo2max: number
  source: 'direct' | 'estimated'
}

export function useVo2maxTrend(): { points: Vo2maxPoint[]; current: number | null; hasEstimated: boolean } {
  const activities = useVisibleActivities()
  const maxHR = useActivityStore(s => s.settings.maxHR)

  return useMemo(() => {
    const directPerDay: Record<string, number> = {}
    const estimatedPerDay: Record<string, number[]> = {}

    for (const a of activities) {
      const day = a.startTime.slice(0, 10)
      if (a.vo2max) {
        directPerDay[day] = Math.max(directPerDay[day] ?? 0, a.vo2max)
        continue
      }

      const estimated = estimateVo2maxFromActivity(a, maxHR)
      if (estimated == null) continue
      estimatedPerDay[day] = [...(estimatedPerDay[day] ?? []), estimated]
    }

    const dates = Array.from(new Set([...Object.keys(directPerDay), ...Object.keys(estimatedPerDay)])).sort()
    const points = dates.map(date => {
      const direct = directPerDay[date]
      if (direct != null) return { isoDate: date, date: formatShortDate(date), vo2max: +direct.toFixed(1), source: 'direct' as const }
      const estimates = estimatedPerDay[date]
      const avg = estimates.reduce((sum, value) => sum + value, 0) / estimates.length
      return { isoDate: date, date: formatShortDate(date), vo2max: +avg.toFixed(1), source: 'estimated' as const }
    })

    const current = points.length > 0 ? points.at(-1)!.vo2max : null
    return { points, current, hasEstimated: points.some(point => point.source === 'estimated') }
  }, [activities, maxHR])
}

function estimateVo2maxFromActivity(activity: ActivitySummary, maxHR: number): number | null {
  if (activity.sport !== 'running') return null
  const duration = effectiveDuration(activity)
  if (!activity.avgSpeed || !activity.avgHR || activity.avgHR < 95 || maxHR <= activity.avgHR) return null
  if (duration < 12 * 60) return null
  if (activity.elevationGain > 0 && activity.distance > 0 && activity.elevationGain / activity.distance > 25) return null

  const metersPerMinute = activity.avgSpeed * 1000 / 60
  const runningVo2Cost = 3.5 + 0.2 * metersPerMinute
  const hrFraction = Math.min(Math.max(activity.avgHR / maxHR, 0.55), 0.98)
  const estimate = runningVo2Cost / hrFraction
  return Math.min(Math.max(estimate, 25), 75)
}

export interface HeatmapData {
  dates: string[]
  bySport: Record<ConsistencySport, number[]>
  activeDaysCount: number
}

type ConsistencySport = Extract<PrimarySport, 'running' | 'cycling' | 'walking' | 'gym'>

export const HEATMAP_SPORTS: ConsistencySport[] = ['running', 'cycling', 'walking', 'gym']

export function useConsistencyHeatmap(windowDays = 28): HeatmapData {
  const activities = useVisibleActivities()

  return useMemo(() => {
    const days: Record<string, Record<Sport, number>> = {}
    for (let i = windowDays - 1; i >= 0; i--) {
      const key = isoDateOffset(i)
      days[key] = { running: 0, cycling: 0, swimming: 0, walking: 0, gym: 0, other: 0 }
    }

    for (const a of activities) {
      const key = a.startTime.slice(0, 10)
      if (Object.hasOwn(days, key) && Object.hasOwn(days[key], a.sport)) {
        days[key][a.sport] += effectiveDuration(a) / 3600
      }
    }

    const dateKeys = Object.keys(days).sort()

    const bySport = Object.fromEntries(
      HEATMAP_SPORTS.map(s => [s, dateKeys.map(d => days[d][s])])
    ) as Record<ConsistencySport, number[]>

    const activeDaysCount = dateKeys.filter(d =>
      HEATMAP_SPORTS.some(s => days[d][s] >= 0.25)
    ).length

    return { dates: dateKeys.map(formatShortDate), bySport, activeDaysCount }
  }, [activities, windowDays])
}

export { useWeeklyLoad } from './useWeeklyLoad'
export type { WeekLoadPoint } from './useWeeklyLoad'
