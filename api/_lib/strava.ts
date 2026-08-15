import { db } from './db.js'
import { decryptText, encryptText } from './crypto.js'

const SPORT_MAP: Record<string, string> = {
  Run: 'running',
  TrailRun: 'running',
  VirtualRun: 'running',
  Ride: 'cycling',
  MountainBikeRide: 'cycling',
  GravelRide: 'cycling',
  VirtualRide: 'cycling',
  EBikeRide: 'cycling',
  Swim: 'swimming',
  Walk: 'walking',
  Hike: 'walking',
  WeightTraining: 'gym',
  Workout: 'gym',
  Crossfit: 'gym',
  Elliptical: 'gym',
  Yoga: 'gym',
  Pilates: 'gym',
}

interface StravaTokenResponse {
  token_type: string
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; username?: string; firstname?: string; lastname?: string }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function stravaAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: required('STRAVA_CLIENT_ID'),
    redirect_uri: required('STRAVA_REDIRECT_URI'),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state,
  })
  return `https://www.strava.com/oauth/authorize?${params.toString()}`
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('STRAVA_CLIENT_ID'),
      client_secret: required('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`)
  return res.json() as Promise<StravaTokenResponse>
}

export async function storeStravaConnection(userId: string, tokens: StravaTokenResponse): Promise<void> {
  await db().query(
    `
      insert into provider_connections (
        user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted,
        token_expires_at, scopes, status, updated_at
      )
      values ($1, 'strava', $2, $3, $4, to_timestamp($5), $6, 'connected', now())
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
      tokens.athlete?.id ? String(tokens.athlete.id) : null,
      encryptText(tokens.access_token),
      encryptText(tokens.refresh_token),
      tokens.expires_at,
      ['activity:read_all'],
    ]
  )
}

export async function stravaAccessToken(userId: string): Promise<string> {
  const result = await db().query(
    `
      select access_token_encrypted, refresh_token_encrypted, extract(epoch from token_expires_at)::int as expires_at
      from provider_connections
      where user_id = $1 and provider = 'strava' and status = 'connected'
      limit 1
    `,
    [userId]
  )
  const connection = result.rows[0]
  if (!connection) throw new Error('strava_not_connected')

  if (Number(connection.expires_at) > Math.floor(Date.now() / 1000) + 300) {
    return decryptText(connection.access_token_encrypted)
  }

  const refreshed = await refreshToken(decryptText(connection.refresh_token_encrypted))
  await storeStravaConnection(userId, refreshed)
  return refreshed.access_token
}

async function refreshToken(refreshTokenValue: string): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('STRAVA_CLIENT_ID'),
      client_secret: required('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
    }),
  })
  if (!res.ok) throw new Error(`Strava refresh failed: ${res.status}`)
  return res.json() as Promise<StravaTokenResponse>
}

export async function fetchStravaActivities(accessToken: string, limit = 5000): Promise<unknown[]> {
  const all: unknown[] = []
  for (let page = 1; all.length < limit; page += 1) {
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${Math.min(100, limit - all.length)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Strava activities failed: ${res.status}`)
    const batch = await res.json() as unknown[]
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

export function normalizeStravaSummary(activity: any) {
  const speed = Number(activity.average_speed || 0)
  const sportKey = activity.sport_type || activity.type || 'Other'
  const sport = SPORT_MAP[sportKey] || 'other'
  const id = Number(activity.id)
  return {
    id,
    source: 'strava' as const,
    sourceType: sportKey,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    title: activity.name || 'Untitled',
    sport,
    startTime: activity.start_date_local || activity.start_date,
    distance: Math.round(Number(activity.distance || 0) / 10) / 100,
    duration: Math.round(Number(activity.elapsed_time || 0)),
    movingTime: Math.round(Number(activity.moving_time || activity.elapsed_time || 0)),
    elevationGain: Math.round(Number(activity.total_elevation_gain || 0)),
    avgHR: Math.round(Number(activity.average_heartrate || 0)),
    maxHR: Math.round(Number(activity.max_heartrate || 0)),
    calories: Math.round(Number(activity.calories || 0)),
    tss: null,
    avgPace: speed && ['running', 'walking', 'swimming'].includes(sport) ? Math.round(1000 / speed) : null,
    avgSpeed: speed ? Math.round(speed * 36) / 10 : null,
    avgPower: Math.round(Number(activity.average_watts || 0)) || null,
    normalizedPower: Math.round(Number(activity.weighted_average_watts || 0)) || null,
    avgCadence: Math.round(Number(activity.average_cadence || 0)) || null,
    vo2max: null,
    aerobicTE: null,
    anaerobicTE: null,
    startLocation: activity.start_latlng?.length === 2 ? {
      lat: activity.start_latlng[0],
      lon: activity.start_latlng[1],
      label: null,
    } : null,
    endLocation: activity.end_latlng?.length === 2 ? {
      lat: activity.end_latlng[0],
      lon: activity.end_latlng[1],
    } : null,
  }
}

export function normalizeStravaDetail(activity: any) {
  const summary = normalizeStravaSummary(activity)
  return {
    ...summary,
    laps: [],
    hrZones: [],
    gpxCoords: decodePolyline(activity.map?.summary_polyline || ''),
  }
}

function decodePolyline(polyline: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < polyline.length) {
    const [dlat, nextIndex] = decodeChunk(polyline, index)
    const [dlng, finalIndex] = decodeChunk(polyline, nextIndex)
    lat += dlat
    lng += dlng
    index = finalIndex
    coords.push([lat / 1e5, lng / 1e5])
  }

  return coords
}

function decodeChunk(polyline: string, startIndex: number): [number, number] {
  let result = 0
  let shift = 0
  let index = startIndex
  let byte = 0

  do {
    byte = polyline.charCodeAt(index) - 63
    index += 1
    result |= (byte & 0x1f) << shift
    shift += 5
  } while (byte >= 0x20)

  return [(result & 1) ? ~(result >> 1) : (result >> 1), index]
}
