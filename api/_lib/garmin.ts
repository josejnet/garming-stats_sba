import { db } from './db.js'
import { decryptText, encryptText } from './crypto.js'

interface GarminTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  scope?: string
  token_type?: string
  user_id?: string | number
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function required(name: string): string {
  const value = optional(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function garminConfigured(): boolean {
  return Boolean(
    optional('GARMIN_CLIENT_ID') &&
    optional('GARMIN_CLIENT_SECRET') &&
    optional('GARMIN_REDIRECT_URI') &&
    optional('GARMIN_AUTHORIZATION_URL') &&
    optional('GARMIN_TOKEN_URL')
  )
}

export function garminAuthorizeUrl(state: string): string {
  const url = new URL(required('GARMIN_AUTHORIZATION_URL'))
  url.searchParams.set('client_id', required('GARMIN_CLIENT_ID'))
  url.searchParams.set('redirect_uri', required('GARMIN_REDIRECT_URI'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)

  const scopes = optional('GARMIN_SCOPES')
  if (scopes) url.searchParams.set('scope', scopes)

  return url.toString()
}

export async function exchangeGarminCode(code: string): Promise<GarminTokenResponse> {
  const res = await fetch(required('GARMIN_TOKEN_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('GARMIN_CLIENT_ID'),
      client_secret: required('GARMIN_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: required('GARMIN_REDIRECT_URI'),
    }),
  })
  if (!res.ok) throw new Error(`Garmin token exchange failed: ${res.status}`)
  return res.json() as Promise<GarminTokenResponse>
}

export async function storeGarminConnection(userId: string, tokens: GarminTokenResponse): Promise<void> {
  const expiresAt = tokens.expires_at
    ? new Date(tokens.expires_at * 1000)
    : tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null

  await db().query(
    `
      insert into provider_connections (
        user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted,
        token_expires_at, scopes, status, updated_at
      )
      values ($1, 'garmin', $2, $3, $4, $5, $6, 'connected', now())
      on conflict (user_id, provider) do update set
        provider_user_id = excluded.provider_user_id,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        scopes = excluded.scopes,
        status = 'connected',
        updated_at = now()
    `,
    [
      userId,
      tokens.user_id ? String(tokens.user_id) : null,
      encryptText(tokens.access_token),
      tokens.refresh_token ? encryptText(tokens.refresh_token) : null,
      expiresAt,
      tokens.scope ? tokens.scope.split(/[,\s]+/).filter(Boolean) : [],
    ]
  )
}

export async function garminAccessToken(userId: string): Promise<string> {
  const result = await db().query(
    `
      select access_token_encrypted, refresh_token_encrypted, extract(epoch from token_expires_at)::int as expires_at
      from provider_connections
      where user_id = $1 and provider = 'garmin' and status = 'connected'
      limit 1
    `,
    [userId]
  )
  const connection = result.rows[0]
  if (!connection) throw new Error('garmin_not_connected')

  if (!connection.expires_at || Number(connection.expires_at) > Math.floor(Date.now() / 1000) + 300) {
    return decryptText(connection.access_token_encrypted)
  }

  if (!connection.refresh_token_encrypted) throw new Error('garmin_refresh_token_missing')
  const refreshed = await refreshGarminToken(decryptText(connection.refresh_token_encrypted))
  await storeGarminConnection(userId, refreshed)
  return refreshed.access_token
}

async function refreshGarminToken(refreshTokenValue: string): Promise<GarminTokenResponse> {
  const res = await fetch(required('GARMIN_TOKEN_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('GARMIN_CLIENT_ID'),
      client_secret: required('GARMIN_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
    }),
  })
  if (!res.ok) throw new Error(`Garmin refresh failed: ${res.status}`)
  return res.json() as Promise<GarminTokenResponse>
}
