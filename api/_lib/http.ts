import type { VercelRequest, VercelResponse } from '@vercel/node'
import { personalUserId, readSessionUserId } from './session.js'

export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(body))
}

export function method(req: VercelRequest, res: VercelResponse, allowed: string[]): boolean {
  if (req.method && allowed.includes(req.method)) return true
  res.setHeader('Allow', allowed.join(', '))
  json(res, 405, { error: 'method_not_allowed' })
  return false
}

export function currentUserId(req: VercelRequest): string {
  const personal = personalUserId()
  if (personal) return personal

  return readSessionUserId(req) || ''
}
