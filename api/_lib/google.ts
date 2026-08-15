import { db } from './db.js'

interface GoogleTokenResponse {
  access_token: string
  id_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

interface GoogleProfile {
  sub: string
  email?: string
  name?: string
  picture?: string
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function required(name: string): string {
  const value = optional(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function googleConfigured(): boolean {
  return Boolean(optional('GOOGLE_CLIENT_ID') && optional('GOOGLE_CLIENT_SECRET') && optional('GOOGLE_REDIRECT_URI'))
}

export function googleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: required('GOOGLE_CLIENT_ID'),
    redirect_uri: required('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('GOOGLE_CLIENT_ID'),
      client_secret: required('GOOGLE_CLIENT_SECRET'),
      redirect_uri: required('GOOGLE_REDIRECT_URI'),
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
  return res.json() as Promise<GoogleTokenResponse>
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Google profile failed: ${res.status}`)
  return res.json() as Promise<GoogleProfile>
}

export function userIdFromGoogleProfile(profile: GoogleProfile): string {
  return `google_${profile.sub}`
}

export async function upsertGoogleUser(profile: GoogleProfile): Promise<string> {
  const userId = userIdFromGoogleProfile(profile)
  await db().query(
    `
      insert into app_users (id, email, display_name, updated_at)
      values ($1, $2, $3, now())
      on conflict (id) do update set
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = now()
    `,
    [userId, profile.email || null, profile.name || profile.email || 'MostlyZ2 user']
  )
  return userId
}
