import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from '../_lib/db.js'
import { VISIBLE_ACTIVITY_FILTER_SQL } from '../_lib/dedupe.js'
import { currentUserId, json, method } from '../_lib/http.js'

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
      with ranked as (
        select
          summary,
          start_time,
          case when ${VISIBLE_ACTIVITY_FILTER_SQL} then 1 else 2 end as duplicate_rank
        from activities
        where user_id = $1
      )
      select summary
      from ranked
      where duplicate_rank = 1
      order by start_time desc
      limit 5000
    `,
    [userId]
  )

  json(res, 200, result.rows.map((row: { summary: unknown }) => row.summary))
}
