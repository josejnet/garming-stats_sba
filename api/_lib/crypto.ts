import crypto from 'node:crypto'

function secret(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function keyFromSecret(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest()
}

export function sign(value: string, secretName = 'SESSION_SECRET'): string {
  return crypto
    .createHmac('sha256', secret(secretName, process.env.TOKEN_ENCRYPTION_KEY || 'mostlyz2-dev-secret'))
    .update(value)
    .digest('base64url')
}

export function verifySigned(value: string, signature: string, secretName = 'SESSION_SECRET'): boolean {
  const expected = sign(value, secretName)
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export function encryptText(value: string): string {
  const key = keyFromSecret(secret('TOKEN_ENCRYPTION_KEY', process.env.SESSION_SECRET || 'mostlyz2-dev-secret'))
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptText(payload: string): string {
  const key = keyFromSecret(secret('TOKEN_ENCRYPTION_KEY', process.env.SESSION_SECRET || 'mostlyz2-dev-secret'))
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.')
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted payload')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
