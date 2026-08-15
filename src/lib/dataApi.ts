import type { ActivityDetail, ActivitySummary, GlobalStats } from '../types/garmin'

async function fetchJson<T>(apiPath: string, staticPath: string): Promise<T> {
  const apiRes = await fetch(apiPath)
  if (apiRes.ok) return apiRes.json() as Promise<T>
  if (apiRes.status === 401) throw new Error('login_required')

  const staticRes = await fetch(staticPath)
  if (!staticRes.ok) {
    throw new Error(`No se pudo cargar ${apiPath} ni ${staticPath} (${staticRes.status})`)
  }
  return staticRes.json() as Promise<T>
}

export function fetchActivities(): Promise<ActivitySummary[]> {
  return fetchJson<ActivitySummary[]>('/api/activities', '/data/activities.json')
}

export function fetchStats(): Promise<GlobalStats | null> {
  return fetchJson<GlobalStats>('/api/stats', '/data/stats.json').catch(() => null)
}

export function fetchActivityDetail(id: number): Promise<ActivityDetail | null> {
  return fetchJson<ActivityDetail>(`/api/activities/${id}`, `/data/activity_${id}.json`).catch(() => null)
}
