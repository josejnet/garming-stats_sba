import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from './_lib/db.js'
import { currentUserId, json, method } from './_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  const userId = currentUserId(req)
  if (!userId) {
    json(res, 401, { error: 'login_required' })
    return
  }
  const result = await db().query(
    `
      select stats
      from user_stats
      where user_id = $1
      limit 1
    `,
    [userId]
  )

  if (!result.rows[0]) {
    json(res, 404, { error: 'stats_not_found' })
    return
  }

  json(res, 200, result.rows[0].stats)
}
