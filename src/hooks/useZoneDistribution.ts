import { useMemo } from 'react'
import { useActivityStore, useVisibleActivities } from '../stores/activityStore'
import { effectiveDuration, estimateZonesFromHR, hasUsableHR, HR_ZONE_DEFS } from '../utils/calculations'
import { isoDateOffset } from '../utils/date'
import type { Sport } from '../types/garmin'

export interface ZoneSlice {
  zone: string
  pct: number
  hours: number
  color: string
}

export interface ZoneDistributionData {
  slices: ZoneSlice[]
  isAerobicFocused: boolean
  unknownHours: number
  knownHours: number
}

export function useZoneDistribution(windowDays = 30, sport: Sport | 'all' = 'all'): ZoneDistributionData {
  const activities = useVisibleActivities()
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const cutoff = isoDateOffset(windowDays)
    const recent = activities.filter(a =>
      a.startTime.slice(0, 10) >= cutoff &&
      (sport === 'all' || a.sport === sport)
    )

    const totals = [0, 0, 0, 0, 0]
    let unknownHours = 0
    for (const a of recent) {
      const duration = effectiveDuration(a)
      if (!hasUsableHR(a, settings.maxHR)) {
        unknownHours += duration / 3600
        continue
      }
      const zones = estimateZonesFromHR(a.avgHR, duration, settings.maxHR)
      zones.forEach(z => { totals[z.zone - 1] += z.seconds / 3600 })
    }

    const knownHours = totals.reduce((s, v) => s + v, 0)
    const total = knownHours || 1
    const slices = HR_ZONE_DEFS.map((z, i) => ({
      zone: z.name,
      pct: Math.round(totals[i] / total * 100),
      hours: +totals[i].toFixed(2),
      color: z.color,
    }))

    const aerobicPct = slices[0].pct + slices[1].pct
    return { slices, isAerobicFocused: knownHours > 0 && aerobicPct >= 60, unknownHours: +unknownHours.toFixed(2), knownHours: +knownHours.toFixed(2) }
  }, [activities, settings.maxHR, windowDays, sport])
}
