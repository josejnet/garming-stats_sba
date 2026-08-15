import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

function connectionString(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is not configured')

  // SSL is configured explicitly below. Removing the legacy URL flag avoids
  // pg-connection-string treating its deprecation warning as a runtime error.
  try {
    const url = new URL(raw)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return raw
  }
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function db(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }

  pool ??= new Pool({
    connectionString: connectionString(),
    ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
  })
  return pool
}

export async function pingDatabase(): Promise<boolean> {
  if (!hasDatabase()) return false
  const result = await db().query('select 1 as ok')
  return result.rows[0]?.ok === 1
}
