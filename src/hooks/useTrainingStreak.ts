import { useMemo } from 'react'
import { useVisibleActivities } from '../stores/activityStore'
import { effectiveDuration } from '../utils/calculations'

export function useTrainingStreak(): number {
  const activities = useVisibleActivities()

  return useMemo(() => {
    const activeDays = new Set(
      activities
        .filter(a => effectiveDuration(a) >= 15 * 60)
        .map(a => a.startTime.slice(0, 10))
    )

    const candidate = new Date()
    let iso = candidate.toISOString().slice(0, 10)

    // Allow streak to start from yesterday if today has no activity yet
    if (!activeDays.has(iso)) {
      candidate.setDate(candidate.getDate() - 1)
      iso = candidate.toISOString().slice(0, 10)
      if (!activeDays.has(iso)) return 0
    }

    let streak = 0
    while (activeDays.has(iso)) {
      streak++
      candidate.setDate(candidate.getDate() - 1)
      iso = candidate.toISOString().slice(0, 10)
    }

    return streak
  }, [activities])
}
