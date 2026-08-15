import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { db, hasDatabase } from '../_lib/db.js'
import { googleConfigured } from '../_lib/google.js'
import { json, method } from '../_lib/http.js'
import { clearSessionCookie, readSessionUserId, setSessionCookie } from '../_lib/session.js'

function userIdFromEmail(email: string): string {
  return `user_${crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24)}`
}

async function readBody(req: VercelRequest): Promise<{ email?: string; displayName?: string }> {
  if (req.body && typeof req.body === 'object') return req.body as { email?: string; displayName?: string }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as { email?: string; displayName?: string }
    } catch {
      return {}
    }
  }

  return new Promise(resolve => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as { email?: string; displayName?: string })
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'POST', 'DELETE'])) return

  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res)
    json(res, 200, { authenticated: false, authProviders: { google: googleConfigured() } })
    return
  }

  if (req.method === 'POST') {
    const body = await readBody(req)
    const email = String(body?.email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      json(res, 400, { error: 'invalid_email' })
      return
    }

    const userId = userIdFromEmail(email)
    const displayName = String(body?.displayName || email.split('@')[0]).trim().slice(0, 80)
    await db().query(
      `
        insert into app_users (id, email, display_name, updated_at)
        values ($1, $2, $3, now())
        on conflict (id) do update set
          email = excluded.email,
          display_name = excluded.display_name,
          updated_at = now()
      `,
      [userId, email, displayName]
    )
    setSessionCookie(res, userId)
    json(res, 200, { authenticated: true, user: { id: userId, email, displayName }, authProviders: { google: googleConfigured() } })
    return
  }

  const userId = readSessionUserId(req)
  if (!userId) {
    json(res, 200, { authenticated: false, user: null, authProviders: { google: googleConfigured() } })
    return
  }

  const result = await db().query(
    `
      select id, email, display_name
      from app_users
      where id = $1
      limit 1
    `,
    [userId]
  )

  if (!result.rows[0]) {
    clearSessionCookie(res)
    json(res, 200, { authenticated: false, user: null, authProviders: { google: googleConfigured() } })
    return
  }

  json(res, 200, {
    authenticated: true,
    user: result.rows[0],
    authProviders: { google: googleConfigured() },
  })
}
