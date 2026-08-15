import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from '../_lib/db.js'
import { currentUserId, json, method } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'POST'])) return

  const userId = currentUserId(req)

  if (!hasDatabase()) {
    json(res, 200, {
      user: { id: userId, mode: 'local-static' },
      databaseConfigured: false,
      next: ['Configure DATABASE_URL', 'Run sql/schema.sql', 'Connect OAuth providers in Phase 2'],
    })
    return
  }

  await db().query(
    `
      insert into app_users (id, display_name)
      values ($1, $2)
      on conflict (id) do nothing
    `,
    [userId, 'Demo user']
  )

  json(res, 200, {
    user: { id: userId, mode: 'database' },
    databaseConfigured: true,
  })
}
