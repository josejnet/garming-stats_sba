import crypto from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sign, verifySigned } from './crypto.js'

const COOKIE_NAME = 'mostlyz2_session'

export function personalUserId(): string | null {
  return process.env.MOSTLYZ2_PERSONAL_MODE === 'true'
    ? process.env.MOSTLYZ2_DEMO_USER_ID || null
    : null
}

function parseCookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (header || '')
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=')
        return index === -1
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      })
  )
}

export function readSessionUserId(req: VercelRequest): string | null {
  const raw = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!raw) return null
  const [userId, sig] = raw.split('.')
  if (!userId || !sig) return null
  return verifySigned(userId, sig) ? userId : null
}

export function setSessionCookie(res: VercelResponse, userId: string): void {
  const signed = `${userId}.${sign(userId)}`
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000`)
}

export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`)
}

export function ensureSession(req: VercelRequest, res: VercelResponse): string {
  const personal = personalUserId()
  if (personal) {
    setSessionCookie(res, personal)
    return personal
  }

  const existing = readSessionUserId(req)
  if (existing) return existing
  const userId = crypto.randomUUID()
  setSessionCookie(res, userId)
  return userId
}
