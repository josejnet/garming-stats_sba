import crypto from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sign } from '../../_lib/crypto.js'
import { hasDatabase } from '../../_lib/db.js'
import { garminAuthorizeUrl, garminConfigured } from '../../_lib/garmin.js'
import { googleAuthorizeUrl, googleConfigured } from '../../_lib/google.js'
import { stravaAuthorizeUrl } from '../../_lib/strava.js'
import { ensureSession, readSessionUserId } from '../../_lib/session.js'
import { json, method } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return
  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  const provider = String(req.query.provider || '')
  if (!['strava', 'garmin', 'google'].includes(provider)) {
    json(res, 404, { error: 'provider_not_found', provider })
    return
  }

  if (provider === 'google' && !googleConfigured()) {
    json(res, 501, {
      error: 'google_oauth_not_configured',
      message: 'Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI en Vercel.',
      requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    })
    return
  }

  if (provider === 'garmin' && !garminConfigured()) {
    json(res, 501, {
      error: 'garmin_api_not_configured',
      message:
        'Faltan las credenciales y endpoints oficiales de Garmin Connect Developer Program en Vercel.',
      requiredEnv: [
        'GARMIN_CLIENT_ID',
        'GARMIN_CLIENT_SECRET',
        'GARMIN_REDIRECT_URI',
        'GARMIN_AUTHORIZATION_URL',
        'GARMIN_TOKEN_URL',
        'GARMIN_SCOPES',
      ],
    })
    return
  }

  const userId = provider === 'google' ? ensureSession(req, res) : readSessionUserId(req)
  if (!userId) {
    json(res, 401, {
      error: 'login_required',
      message: 'Primero inicia sesión en MostlyZ2 y después conecta Garmin o Strava.',
    })
    return
  }

  const nonce = crypto.randomBytes(16).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ userId, nonce, provider })).toString('base64url')
  const state = `${payload}.${sign(payload, 'OAUTH_STATE_SECRET')}`
  const location = provider === 'google'
    ? googleAuthorizeUrl(state)
    : provider === 'garmin'
      ? garminAuthorizeUrl(state)
      : stravaAuthorizeUrl(state)

  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}
