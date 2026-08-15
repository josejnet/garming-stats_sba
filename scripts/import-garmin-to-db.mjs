import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg

loadEnvFile('.env.production.local')
loadEnvFile('.env.local')
loadEnvFile('.env')

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!databaseUrl) {
  console.error('DATABASE_URL o POSTGRES_URL no está configurada.')
  process.exit(1)
}

const userId = process.env.MOSTLYZ2_DEMO_USER_ID || 'demo-user'
const dataDir = path.resolve('public/data')
const summariesPath = path.join(dataDir, 'garmin_activities.json')
const summaries = JSON.parse(fs.readFileSync(summariesPath, 'utf8'))

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query('begin')
  await client.query(
    `
      insert into app_users (id, display_name, updated_at)
      values ($1, 'MostlyZ2 Garmin', now())
      on conflict (id) do update set updated_at = now()
    `,
    [userId]
  )

  await client.query(`delete from activities where user_id = $1 and source = 'garmin'`, [userId])

  let imported = 0
  for (const summary of summaries) {
    if (!summary?.id) continue
    summary.source = 'garmin'
    if (!summary.sourceUrl) {
      summary.sourceUrl = `https://connect.garmin.com/modern/activity/${summary.id}`
    }

    const detailPath = path.join(dataDir, `activity_${summary.id}.json`)
    const detail = fs.existsSync(detailPath)
      ? JSON.parse(fs.readFileSync(detailPath, 'utf8'))
      : { ...summary, laps: [], hrZones: [], gpxCoords: [] }
    detail.source = 'garmin'
    detail.sourceUrl = summary.sourceUrl

    await client.query(
      `
        insert into activities (
          user_id, activity_id, source, source_activity_id, source_url, sport, start_time,
          distance_km, duration_seconds, summary, dedupe_key, updated_at
        )
        values ($1, $2, 'garmin', $2, $3, $4, $5, $6, $7, $8, $9, now())
        on conflict (user_id, activity_id) do update set
          source_url = excluded.source_url,
          sport = excluded.sport,
          start_time = excluded.start_time,
          distance_km = excluded.distance_km,
          duration_seconds = excluded.duration_seconds,
          summary = excluded.summary,
          dedupe_key = excluded.dedupe_key,
          updated_at = now()
      `,
      [
        userId,
        String(summary.id),
        summary.sourceUrl,
        summary.sport || 'other',
        toIsoish(summary.startTime),
        summary.distance ?? null,
        Math.round(summary.movingTime || summary.duration || 0),
        summary,
        dedupeKey(summary),
      ]
    )

    await client.query(
      `
        insert into activity_details (user_id, activity_id, detail, updated_at)
        values ($1, $2, $3, now())
        on conflict (user_id, activity_id) do update set
          detail = excluded.detail,
          updated_at = now()
      `,
      [userId, String(summary.id), detail]
    )
    imported += 1
  }

  await client.query(
    `
      insert into user_stats (user_id, stats, calculated_at)
      values ($1, $2, now())
      on conflict (user_id) do update set stats = excluded.stats, calculated_at = now()
    `,
    [userId, buildStats(summaries)]
  )

  await client.query('commit')
  console.log(`Garmin importado a Neon: ${imported} actividades.`)
} catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
} finally {
  await client.end()
}

function dedupeKey(summary) {
  return [
    String(summary.startTime || '').slice(0, 16),
    summary.sport || 'other',
    Math.round(Number(summary.distance || 0) * 10),
    Math.round(Number(summary.movingTime || summary.duration || 0) / 10),
  ].join(':')
}

function buildStats(items) {
  const byType = {}
  for (const item of items) {
    byType[item.sport || 'other'] = (byType[item.sport || 'other'] || 0) + 1
  }
  return {
    totalActivities: items.length,
    byType,
    vo2maxHistory: items
      .filter(item => item.vo2max)
      .map(item => ({ date: String(item.startTime).slice(0, 10), value: item.vo2max })),
    syncedAt: new Date().toISOString(),
  }
}

function toIsoish(value) {
  return String(value || '').replace(' ', 'T') || new Date().toISOString()
}

function loadEnvFile(fileName) {
  const envPath = path.resolve(fileName)
  if (!fs.existsSync(envPath)) return

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (process.env[key]) continue

    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value.replace(/\\n/g, '\n')
  }
}
