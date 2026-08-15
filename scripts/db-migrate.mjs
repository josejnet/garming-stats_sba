import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
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

const schemaPath = path.resolve('sql/schema.sql')
const schema = fs.readFileSync(schemaPath, 'utf8')

const ssl =
  process.env.POSTGRES_SSL === 'false'
    ? false
    : {
        rejectUnauthorized: false,
      }

const client = new Client({
  connectionString: databaseUrl,
  ssl,
})

try {
  await client.connect()
  await client.query(schema)
  console.log('Schema aplicado correctamente.')
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value.replace(/\\n/g, '\n')
  }
}
