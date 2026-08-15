import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from './_lib/db.js'
import { encryptText } from './_lib/crypto.js'
import { currentUserId, json, method } from './_lib/http.js'

interface ConnectionBody {
  provider?: string
  email?: string
  password?: string
}

async function readBody(req: VercelRequest): Promise<ConnectionBody> {
  if (req.body && typeof req.body === 'object') return req.body as ConnectionBody
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as ConnectionBody
    } catch {
      return {}
    }
  }

  return new Promise(resolve => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ConnectionBody)
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
    json(res, 200, { databaseConfigured: false, connections: [] })
    return
  }

  const userId = currentUserId(req)
  if (!userId) {
    json(res, 401, { error: 'login_required' })
    return
  }

  if (req.method === 'POST') {
    const body = await readBody(req)
    const provider = String(body.provider || '').trim().toLowerCase()
    if (provider !== 'garmin') {
      json(res, 400, { error: 'provider_not_supported_here', message: 'Strava se conecta con OAuth. Garmin personal usa este formulario.' })
      return
    }

    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (!email || !password) {
      json(res, 400, { error: 'missing_garmin_credentials', message: 'Introduce usuario y contraseña de Garmin.' })
      return
    }

    await db().query(
      `
        insert into provider_connections (
          user_id, provider, provider_user_id, access_token_encrypted,
          refresh_token_encrypted, scopes, status, updated_at
        )
        values ($1, 'garmin', $2, $3, $4, $5, 'connected', now())
        on conflict (user_id, provider) do update set
          provider_user_id = excluded.provider_user_id,
          access_token_encrypted = excluded.access_token_encrypted,
          refresh_token_encrypted = excluded.refresh_token_encrypted,
          scopes = excluded.scopes,
          status = 'connected',
          updated_at = now()
      `,
      [userId, email, encryptText(email), encryptText(password), ['personal_credentials']]
    )

    json(res, 200, { ok: true, provider: 'garmin', status: 'connected', provider_user_id: email })
    return
  }

  if (req.method === 'DELETE') {
    const provider = String((req.query.provider as string | undefined) || '').trim().toLowerCase()
    if (!['garmin', 'strava'].includes(provider)) {
      json(res, 400, { error: 'invalid_provider' })
      return
    }
    await db().query(`delete from provider_connections where user_id = $1 and provider = $2`, [userId, provider])
    json(res, 200, { ok: true, provider, status: 'deleted' })
    return
  }

  const result = await db().query(
    `
      select provider, provider_user_id, status, updated_at
      from provider_connections
      where user_id = $1
      order by provider
    `,
    [userId]
  )

  json(res, 200, { databaseConfigured: true, connections: result.rows })
}
