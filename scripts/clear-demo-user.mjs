import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg

loadEnvFile('.env.production.local')
loadEnvFile('.env.local')
loadEnvFile('.env')

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!databaseUrl) {
  console.error('DATABASE_URL o POSTGRES_URL no está configurada.')
  process.exit(1)
}

const userId = process.argv[2] || process.env.MOSTLYZ2_DEMO_USER_ID || 'demo-user'
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
})

try {
  await client.connect()
  const result = await client.query('delete from app_users where id = $1', [userId])
  console.log(`Usuario eliminado: ${userId}. Filas app_users: ${result.rowCount}.`)
} finally {
  await client.end()
}

function loadEnvFile(fileName) {
  const envPath = path.resolve(fileName)
  if (!fs.existsSync(envPath)) return

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    let value = rawValue.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value.replace(/\\n/g, '\n')
  }
}
