import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useMemo } from 'react'
import type { ActivitySummary, ActivityDetail, GlobalStats, PrimarySport, UserSettings } from '../types/garmin'
import { DEFAULT_SETTINGS } from '../types/garmin'
import { fetchActivities, fetchActivityDetail, fetchStats } from '../lib/dataApi'

const PRIMARY_SPORTS: PrimarySport[] = ['running', 'cycling', 'swimming', 'walking', 'gym']

export interface ActivityState {
  activities: ActivitySummary[]
  stats: GlobalStats | null
  settings: UserSettings
  loading: boolean
  error: string | null
  detailCache: Record<number, ActivityDetail>

  loadActivities: () => Promise<void>
  loadStats: () => Promise<void>
  updateSettings: (s: Partial<UserSettings>) => void
  loadDetail: (id: number) => Promise<ActivityDetail | null>
  clearUserData: () => void
}

export function normalizeSettings(settings: Partial<UserSettings> | undefined): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    enabledSports: {
      ...DEFAULT_SETTINGS.enabledSports,
      ...settings?.enabledSports,
    },
  }
}

export function isSportEnabled(sport: ActivitySummary['sport'], settings: UserSettings): boolean {
  if (!PRIMARY_SPORTS.includes(sport as PrimarySport)) return true
  return settings.enabledSports[sport as PrimarySport]
}

export function filterActivitiesByEnabledSports(
  activities: ActivitySummary[],
  settings: UserSettings
): ActivitySummary[] {
  return activities.filter(a => isSportEnabled(a.sport, settings))
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      activities: [],
      stats: null,
      settings: DEFAULT_SETTINGS,
      loading: false,
      error: null,
      detailCache: {},

      loadActivities: async () => {
        set({ loading: true, error: null })
        try {
          const data = await fetchActivities()
          data.sort((a, b) => b.startTime.localeCompare(a.startTime))
          set({ activities: data, loading: false })
        } catch (e) {
          set({ loading: false, error: (e as Error).message })
        }
      },

      loadStats: async () => {
        try {
          const data = await fetchStats()
          if (data) set({ stats: data })
        } catch {
          // stats are optional
        }
      },

      updateSettings: (s) => {
        set(state => ({ settings: normalizeSettings({ ...state.settings, ...s }) }))
      },

      clearUserData: () => {
        set({ activities: [], stats: null, loading: false, error: null, detailCache: {} })
      },

      loadDetail: async (id: number) => {
        const cached = get().detailCache[id]
        if (cached) return cached
        try {
          const detail = await fetchActivityDetail(id)
          if (!detail) return null
          set(state => ({ detailCache: { ...state.detailCache, [id]: detail } }))
          return detail
        } catch {
          return null
        }
      },
    }),
    {
      name: 'garmin-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ActivityState> | undefined
        return {
          ...current,
          ...persistedState,
          settings: normalizeSettings(persistedState?.settings),
        }
      },
    }
  )
)

export function useVisibleActivities(): ActivitySummary[] {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)
  return useMemo(
    () => filterActivitiesByEnabledSports(activities, settings),
    [activities, settings]
  )
}
