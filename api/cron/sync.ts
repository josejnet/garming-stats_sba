import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from '../_lib/db.js'
import { json, method } from '../_lib/http.js'
import { syncStravaUser } from '../_lib/sync.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'POST'])) return

  const expected = process.env.CRON_SECRET
  if (expected && req.headers.authorization !== `Bearer ${expected}`) {
    json(res, 401, { error: 'unauthorized' })
    return
  }

  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  const users = await db().query(
    `
      select user_id
      from provider_connections
      where provider = 'strava' and status = 'connected'
      order by updated_at desc
      limit 25
    `
  )

  const results = []
  for (const row of users.rows as { user_id: string }[]) {
    try {
      results.push({ userId: row.user_id, imported: await syncStravaUser(row.user_id, 100) })
    } catch (error) {
      results.push({ userId: row.user_id, error: (error as Error).message })
    }
  }

  json(res, 200, { ok: true, users: results.length, results })
}
