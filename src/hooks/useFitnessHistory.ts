import { useMemo } from 'react'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { calculateFitnessHistory } from '../utils/calculations'
import type { FitnessPoint } from '../types/garmin'
import { formatShortDate } from '../utils/formatters'

export interface FitnessHistoryData {
  history: FitnessPoint[]
  current: FitnessPoint | null
  sparkPoints: { date: string; fullDate: string; ctl: number; atl: number; tsb: number }[]
  sparkRange: { start: string; end: string; days: number } | null
}

export function useFitnessHistory(): FitnessHistoryData {
  const activities = useVisibleActivities()
  const settings = useActivityStore(s => s.settings)

  const history = useMemo(
    () => calculateFitnessHistory(activities, settings),
    [activities, settings]
  )

  const current = useMemo(
    () => history.length > 0 ? history[history.length - 1] : null,
    [history]
  )

  const sparkPoints = useMemo(
    () => history.slice(-60).map(p => ({
      date: formatShortDate(p.date),
      fullDate: p.date,
      ctl: Math.round(p.ctl),
      atl: Math.round(p.atl),
      tsb: Math.round(p.tsb),
    })),
    [history]
  )

  const sparkRange = useMemo(() => {
    const points = history.slice(-60)
    const start = points[0]?.date
    const end = points.at(-1)?.date
    if (!start || !end) return null
    return { start, end, days: points.length }
  }, [history])

  return { history, current, sparkPoints, sparkRange }
}
