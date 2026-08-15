import { useMemo } from 'react'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { aggregateByWeek } from '../utils/calculations'
import { formatShortDate } from '../utils/formatters'

export interface WeekLoadPoint {
  week: string
  tss: number
  rampPct: number
  riskLevel: 'ok' | 'warn' | 'high'
}

export function useWeeklyLoad(windowWeeks = 16): WeekLoadPoint[] {
  const activities = useVisibleActivities()
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const weeks = aggregateByWeek(activities, settings).slice(-windowWeeks)

    return weeks.map((w, i) => {
      const prevTSS = weeks[i - 1]?.totalTSS ?? w.totalTSS
      const rampPct = prevTSS > 0 ? ((w.totalTSS - prevTSS) / prevTSS) * 100 : 0
      const riskLevel = rampPct > 15 ? 'high' : rampPct > 8 ? 'warn' : 'ok'
      return {
        week: formatShortDate(w.weekStart),
        tss: Math.round(w.totalTSS),
        rampPct: +rampPct.toFixed(0),
        riskLevel,
      }
    })
  }, [activities, settings, windowWeeks])
}
