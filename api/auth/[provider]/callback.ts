import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifySigned } from '../../_lib/crypto.js'
import { db } from '../../_lib/db.js'
import { json, method } from '../../_lib/http.js'
import { exchangeGarminCode, storeGarminConnection } from '../../_lib/garmin.js'
import { exchangeGoogleCode, fetchGoogleProfile, upsertGoogleUser } from '../../_lib/google.js'
import { exchangeCode, storeStravaConnection } from '../../_lib/strava.js'
import { setSessionCookie } from '../../_lib/session.js'

function parseState(state: string): { userId: string; provider?: string } | null {
  const [payload, signature] = state.split('.')
  if (!payload || !signature || !verifySigned(payload, signature, 'OAUTH_STATE_SECRET')) return null
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId: string; provider?: string }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  const provider = String(req.query.provider || '')
  const code = String(req.query.code || '')
  const state = String(req.query.state || '')
  const parsed = parseState(state)
  if (!['strava', 'garmin', 'google'].includes(provider) || !code || !parsed) {
    json(res, 400, { error: 'invalid_provider_callback', provider })
    return
  }

  if (provider === 'google') {
    const tokens = await exchangeGoogleCode(code)
    const profile = await fetchGoogleProfile(tokens.access_token)
    const userId = await upsertGoogleUser(profile)
    setSessionCookie(res, userId)
    res.statusCode = 302
    res.setHeader('Location', '/')
    res.end()
    return
  }

  const user = await db().query(
    `
      select id
      from app_users
      where id = $1
      limit 1
    `,
    [parsed.userId]
  )

  if (!user.rows[0]) {
    json(res, 401, { error: 'login_required', message: 'La sesión de MostlyZ2 ya no es válida.' })
    return
  }

  if (provider === 'garmin') {
    const tokens = await exchangeGarminCode(code)
    await storeGarminConnection(parsed.userId, tokens)
  } else {
    const tokens = await exchangeCode(code)
    await storeStravaConnection(parsed.userId, tokens)
  }

  setSessionCookie(res, parsed.userId)
  res.statusCode = 302
  res.setHeader('Location', `/?connected=${provider}`)
  res.end()
}
