import { useMemo } from 'react'
import { useVisibleActivities } from '../stores/activityStore'
import { isoDateOffset } from '../utils/date'
import { effectiveDuration } from '../utils/calculations'
import type { Sport } from '../types/garmin'

export interface SportVolume {
  hours: number
  count: number
  estimatedSteps: number
}

export type SportVolumeMap = Record<Sport, SportVolume>

export interface SportsVolumeData {
  bySport: SportVolumeMap
  totalHours: number
  totalEstimatedSteps: number
  avgDailyEstimatedSteps: number
  percentages: Record<Sport, number>
}

export const VOLUME_SPORTS: Sport[] = ['running', 'cycling', 'walking', 'gym', 'swimming', 'other']

export function useSportVolume(windowDays = 30): SportsVolumeData {
  const activities = useVisibleActivities()

  return useMemo(() => {
    const cutoff = isoDateOffset(windowDays)
    const recent = activities.filter(a => a.startTime.slice(0, 10) >= cutoff)

    const bySport = Object.fromEntries(
      VOLUME_SPORTS.map(s => [s, { hours: 0, count: 0, estimatedSteps: 0 }])
    ) as SportVolumeMap

    for (const a of recent) {
      const sport = a.sport as Sport
      if (Object.hasOwn(bySport, sport)) {
        bySport[sport].hours += effectiveDuration(a) / 3600
        bySport[sport].count += 1
        bySport[sport].estimatedSteps += estimateStepsForActivity(a)
      }
    }

    const totalHours = VOLUME_SPORTS.reduce((s, sp) => s + bySport[sp].hours, 0)
    const totalEstimatedSteps = VOLUME_SPORTS.reduce((s, sp) => s + bySport[sp].estimatedSteps, 0)

    const percentages = Object.fromEntries(
      VOLUME_SPORTS.map(s => [s, totalHours > 0 ? bySport[s].hours / totalHours * 100 : 0])
    ) as Record<Sport, number>

    return {
      bySport,
      totalHours,
      totalEstimatedSteps,
      avgDailyEstimatedSteps: totalEstimatedSteps / windowDays,
      percentages,
    }
  }, [activities, windowDays])
}

function estimateStepsForActivity(activity: { sport: Sport; duration: number; movingTime: number; avgCadence?: number | null }): number {
  const minutes = effectiveDuration(activity) / 60
  if (minutes <= 0) return 0

  if ((activity.sport === 'running' || activity.sport === 'walking') && activity.avgCadence) {
    return Math.round(activity.avgCadence * minutes)
  }

  const estimatedStepsPerMinute: Record<Sport, number> = {
    running: 165,
    walking: 110,
    cycling: 70,
    gym: 65,
    swimming: 45,
    other: 55,
  }

  return Math.round((estimatedStepsPerMinute[activity.sport] ?? estimatedStepsPerMinute.other) * minutes)
}
