import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from '../_lib/db.js'
import { currentUserId, json, method } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  const id = String(req.query.id)
  const userId = currentUserId(req)
  if (!userId) {
    json(res, 401, { error: 'login_required' })
    return
  }
  const result = await db().query(
    `
      select detail
      from activity_details
      where user_id = $1 and activity_id = $2
      limit 1
    `,
    [userId, id]
  )

  if (!result.rows[0]) {
    json(res, 404, { error: 'activity_not_found' })
    return
  }

  json(res, 200, result.rows[0].detail)
}
