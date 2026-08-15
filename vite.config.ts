import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const statusPath = path.join(rootDir, 'public', 'data', 'sync_status.json')

function pythonPath(): string {
  const windowsVenv = path.join(rootDir, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(windowsVenv)) return windowsVenv
  const unixVenv = path.join(rootDir, '.venv', 'bin', 'python')
  if (fs.existsSync(unixVenv)) return unixVenv
  return 'python'
}

function syncApiPlugin(): Plugin {
  let runningProcess: ReturnType<typeof spawn> | null = null
  let lastLines: string[] = []
  let lastExitCode: number | null = null

  function appendLog(chunk: Buffer): void {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean)
    lastLines = [...lastLines, ...lines].slice(-80)
  }

  function sendJson(res: { setHeader: (name: string, value: string) => void; end: (body: string) => void; statusCode: number }, data: unknown): void {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  }

  function readStatus(): unknown {
    if (!fs.existsSync(statusPath)) return null
    try {
      return JSON.parse(fs.readFileSync(statusPath, 'utf8'))
    } catch {
      return null
    }
  }

  function writeStatus(phase: string, message: string, running = false, error: string | null = null): void {
    fs.mkdirSync(path.dirname(statusPath), { recursive: true })
    fs.writeFileSync(statusPath, JSON.stringify({
      running,
      phase,
      message,
      error,
      updatedAt: new Date().toISOString(),
    }), 'utf8')
  }

  function readJsonBody(req: { on: (event: string, callback: (chunk?: Buffer) => void) => void }): Promise<Record<string, unknown>> {
    return new Promise(resolve => {
      const chunks: Buffer[] = []
      req.on('data', chunk => {
        if (chunk) chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve(text ? JSON.parse(text) as Record<string, unknown> : {})
        } catch {
          resolve({})
        }
      })
    })
  }

  function stopProcessTree(child: ReturnType<typeof spawn>): void {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'])
      return
    }
    child.kill('SIGTERM')
  }

  return {
    name: 'mostlyz2-sync-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url === '/api/sync/status' && req.method === 'GET') {
          sendJson(res, {
            running: Boolean(runningProcess),
            lastExitCode,
            status: readStatus(),
            log: lastLines,
          })
          return
        }

        if (url === '/api/sync' && req.method === 'POST') {
          if (runningProcess) {
            sendJson(res, {
              started: false,
              running: true,
              message: 'Ya hay una actualizacion en marcha.',
            })
            return
          }

          const body = await readJsonBody(req)
          const provider = typeof body.provider === 'string' ? body.provider : 'garmin'
          const commandArgs = ['fetch/update_all.py']
          if (provider === 'garmin') commandArgs.push('--provider', 'garmin', '--no-geocode')
          if (provider === 'strava') commandArgs.push('--provider', 'strava')

          lastLines = []
          lastExitCode = null
          const child = spawn(pythonPath(), commandArgs, {
            cwd: rootDir,
            env: { ...process.env, PYTHONUTF8: '1' },
          })
          runningProcess = child
          child.stdout.on('data', appendLog)
          child.stderr.on('data', appendLog)
          child.on('close', code => {
            lastExitCode = code
            runningProcess = null
          })
          child.on('error', error => {
            lastLines = [...lastLines, `ERROR: ${error.message}`].slice(-80)
            lastExitCode = 1
            runningProcess = null
          })

          sendJson(res, {
            started: true,
            running: true,
            provider,
            message: provider === 'garmin' ? 'Actualizacion Garmin iniciada.' : 'Actualizacion iniciada.',
          })
          return
        }

        if (url === '/api/sync/cancel' && req.method === 'POST') {
          if (!runningProcess) {
            sendJson(res, {
              cancelled: false,
              running: false,
              message: 'No hay una actualizacion en marcha.',
            })
            return
          }

          stopProcessTree(runningProcess)
          writeStatus('stopped', 'Actualizacion detenida por el usuario.')
          lastLines = [...lastLines, 'Actualizacion detenida por el usuario.'].slice(-80)
          sendJson(res, {
            cancelled: true,
            running: false,
            message: 'Actualizacion detenida.',
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [syncApiPlugin(), tailwindcss(), react()],
})
