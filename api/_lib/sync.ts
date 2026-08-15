import { db } from './db.js'
import { VISIBLE_ACTIVITY_FILTER_SQL } from './dedupe.js'
import { fetchStravaActivities, normalizeStravaDetail, normalizeStravaSummary, stravaAccessToken } from './strava.js'

export async function syncStravaUser(userId: string, limit = Number(process.env.STRAVA_SYNC_LIMIT || 5000)): Promise<number> {
  const token = await stravaAccessToken(userId)
  const rawActivities = await fetchStravaActivities(token, limit)
  const rows = rawActivities.map(raw => {
    const summary = normalizeStravaSummary(raw)
    const detail = normalizeStravaDetail(raw)
    return {
      activity_id: String(summary.id),
      source_url: summary.sourceUrl,
      sport: summary.sport,
      start_time: summary.startTime,
      distance_km: summary.distance,
      duration_seconds: summary.duration,
      summary,
      dedupe_key: dedupeKey(summary),
      detail,
    }
  })

  // Bulk upserts keep a full Strava history inside Vercel's request window.
  // The former per-activity loop issued two database round trips for every row.
  const chunkSize = 500
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize)
    await db().query(
      `
        with incoming as (
          select *
          from jsonb_to_recordset($2::jsonb) as row(
            activity_id text,
            source_url text,
            sport text,
            start_time timestamptz,
            distance_km double precision,
            duration_seconds integer,
            summary jsonb,
            dedupe_key text,
            detail jsonb
          )
        ), upsert_activities as (
          insert into activities (
            user_id, activity_id, source, source_activity_id, source_url, sport, start_time,
            distance_km, duration_seconds, summary, dedupe_key, updated_at
          )
          select
            $1, activity_id, 'strava', activity_id, source_url, sport, start_time,
            distance_km, duration_seconds, summary, dedupe_key, now()
          from incoming
          on conflict (user_id, activity_id) do update set
            source = 'strava',
            source_activity_id = excluded.source_activity_id,
            source_url = excluded.source_url,
            sport = excluded.sport,
            start_time = excluded.start_time,
            distance_km = excluded.distance_km,
            duration_seconds = excluded.duration_seconds,
            summary = excluded.summary,
            dedupe_key = excluded.dedupe_key,
            updated_at = now()
          returning activity_id
        )
        insert into activity_details (user_id, activity_id, detail, updated_at)
        select $1, activity_id, detail, now()
        from incoming
        on conflict (user_id, activity_id) do update set
          detail = excluded.detail,
          updated_at = now()
      `,
      [userId, JSON.stringify(chunk)]
    )
  }

  await refreshStats(userId)
  return rows.length
}

function dedupeKey(summary: ReturnType<typeof normalizeStravaSummary>): string {
  return [
    summary.startTime.slice(0, 16),
    summary.sport,
    Math.round(summary.distance * 10),
    Math.round(summary.duration / 10),
  ].join(':')
}

export interface RefreshStatsResult {
  total: number
  visible: number
  hiddenDuplicates: number
}

export async function refreshStats(userId: string): Promise<RefreshStatsResult> {
  const result = await db().query(
    `
      with ranked as (
        select
          summary,
          case when ${VISIBLE_ACTIVITY_FILTER_SQL} then 1 else 2 end as duplicate_rank
        from activities
        where user_id = $1
      )
      select summary, duplicate_rank
      from ranked
    `,
    [userId]
  )
  const visibleRows = result.rows.filter((row: { duplicate_rank: number | string }) => Number(row.duplicate_rank) === 1)
  const summaries = visibleRows.map((row: { summary: any }) => row.summary)
  const byType = summaries.reduce((acc: Record<string, number>, item: any) => {
    acc[item.sport] = (acc[item.sport] || 0) + 1
    return acc
  }, {})
  const stats = {
    totalActivities: summaries.length,
    byType,
    vo2maxHistory: summaries
      .filter((item: any) => item.vo2max)
      .map((item: any) => ({ date: item.startTime.slice(0, 10), value: item.vo2max })),
    syncedAt: new Date().toISOString(),
  }
  await db().query(
    `
      insert into user_stats (user_id, stats, calculated_at)
      values ($1, $2, now())
      on conflict (user_id) do update set stats = excluded.stats, calculated_at = now()
    `,
    [userId, stats]
  )
  return {
    total: result.rows.length,
    visible: visibleRows.length,
    hiddenDuplicates: result.rows.length - visibleRows.length,
  }
}
