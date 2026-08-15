import { useCallback, useEffect, useRef, useState } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { MapStyle, PrimarySport, ThemeMode, UserSettings } from '../types/garmin'

const SPORT_OPTIONS: { sport: PrimarySport; label: string; hint: string }[] = [
  { sport: 'running', label: 'Running', hint: 'Ritmos, records, VO2max y carga de carrera.' },
  { sport: 'cycling', label: 'Ciclismo', hint: 'Potencia, FTP, desnivel y volumen de bici.' },
  { sport: 'walking', label: 'Caminar', hint: 'Cuenta para carga suave, zonas, consistencia y volumen.' },
  { sport: 'gym', label: 'Gym', hint: 'Cuenta para carga, tiempo, consistencia y balance semanal.' },
  { sport: 'swimming', label: 'Natación', hint: 'Se incluye en volumen y carga cuando la actives.' },
]

const MAP_STYLE_OPTIONS: { value: MapStyle; label: string; hint: string; bestFor: string[] }[] = [
  {
    value: 'auto',
    label: 'Auto',
    hint: 'Elige claro u oscuro según el tema. Equilibrado para uso diario y legibilidad general.',
    bestFor: ['Tema automático', 'Contraste estable', 'Uso diario'],
  },
  {
    value: 'osm',
    label: 'OSM',
    hint: 'Más información urbana: calles, cruces, caminos y referencias del mapa clásico de OpenStreetMap.',
    bestFor: ['Detalle urbano', 'Calles', 'Referencias'],
  },
  {
    value: 'voyager',
    label: 'Voyager',
    hint: 'Estilo más limpio y suave. Ideal cuando quieres ver la ruta sin tanto ruido visual.',
    bestFor: ['Ruta protagonista', 'Menos ruido', 'Ciudad'],
  },
  {
    value: 'topo',
    label: 'Topo',
    hint: 'Pensado para montaña y desnivel: relieve, terreno y curvas de nivel cuando estén disponibles.',
    bestFor: ['Relieve', 'Curvas de nivel', 'Montaña'],
  },
]

function mapPreviewUrl(mapStyle: MapStyle, theme: ThemeMode, xOffset = 0, yOffset = 0): string {
  const z = 12
  const x = 2102 + xOffset
  const y = 1517 + yOffset
  if (mapStyle === 'auto') {
    const cartoTheme = theme === 'light' ? 'light_all' : 'dark_all'
    return `https://a.basemaps.cartocdn.com/${cartoTheme}/${z}/${x}/${y}.png`
  }
  if (mapStyle === 'osm') return `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`
  if (mapStyle === 'voyager') return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`
  return `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`
}

function mapPreviewTone(mapStyle: MapStyle, theme: ThemeMode) {
  if (mapStyle === 'osm') {
    return {
      overlay: 'from-emerald-100/30 via-transparent to-sky-200/25',
      water: '#8ecae6',
      park: '#b7e4c7',
      road: '#ffffff',
      roadStroke: '#d6c7a8',
      minor: '#f7e7bd',
      route: '#ef4444',
      contour: '#c08a4b',
      label: '#24465f',
    }
  }
  if (mapStyle === 'voyager') {
    return {
      overlay: 'from-slate-50/35 via-transparent to-cyan-100/30',
      water: '#b9e0ea',
      park: '#d8efe1',
      road: '#ffffff',
      roadStroke: '#dbe3e7',
      minor: '#eef2f4',
      route: '#ef4444',
      contour: '#cbd5e1',
      label: '#64748b',
    }
  }
  if (mapStyle === 'topo') {
    return {
      overlay: 'from-lime-100/30 via-transparent to-amber-100/25',
      water: '#9fd4e9',
      park: '#c9dfab',
      road: '#fff7dc',
      roadStroke: '#b99b5f',
      minor: '#ead79a',
      route: '#ef4444',
      contour: '#9a6a35',
      label: '#4d6535',
    }
  }
  return theme === 'light'
    ? {
        overlay: 'from-blue-50/40 via-transparent to-slate-100/30',
        water: '#bfdbfe',
        park: '#dcefe5',
        road: '#ffffff',
        roadStroke: '#cbd5e1',
        minor: '#e2e8f0',
        route: '#ef4444',
        contour: '#cbd5e1',
        label: '#64748b',
      }
    : {
        overlay: 'from-slate-950/30 via-transparent to-blue-950/30',
        water: '#18324a',
        park: '#12352f',
        road: '#334155',
        roadStroke: '#64748b',
        minor: '#253047',
        route: '#fb7185',
        contour: '#64748b',
        label: '#cbd5e1',
      }
}

function cleanText(text: string): string {
  return text
    .replaceAll('Actualizaci?n', 'Actualización')
    .replaceAll('actualizaci?n', 'actualización')
    .replaceAll('pr?ximo', 'próximo')
    .replaceAll('próximo sync ser?', 'próximo sync será')
    .replaceAll('unicas', 'únicas')
    .replaceAll('codigo', 'código')
    .replaceAll('fallo', 'falló')
}

interface ConnectionsApiStatus {
  databaseConfigured: boolean
  connections: { provider: string; status: string; provider_user_id?: string | null; updated_at?: string }[]
}

interface SyncApiStatus {
  running: boolean
  resumable?: boolean
  lastExitCode: number | null
  status: {
    phase: string
    message: string
    error?: string | null
    provider?: string
    jobId?: string
    progress?: { done: number; total: number } | null
    updatedAt: string
  } | null
  log: string[]
}

type ActionName = 'garmin' | 'strava' | 'duplicates' | 'save-garmin'
type NoticeKind = 'success' | 'error' | 'info' | 'warning'
type ActionState = Record<ActionName, boolean>

interface ActionNotice {
  kind: NoticeKind
  text: string
}

class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

function statusLabel(phase: string): string {
  const labels: Record<string, string> = {
    idle: 'Listo',
    queued: 'En cola',
    running: 'Importando',
    paused: 'Pausado',
    completed: 'Completado',
    failed: 'Error',
    stopped: 'Detenido',
  }
  return labels[phase] ?? phase
}

async function readApiResponse(res: Response, fallback: string): Promise<{ data: any; message: string }> {
  const data = await res.json().catch(() => null)
  if (res.ok && data) return { data, message: data.message ?? fallback }

  if (res.status === 401) return { data, message: data?.message ?? 'Tu sesión ha caducado. Vuelve a iniciar sesión.' }
  if (res.status === 429) return { data, message: data?.message ?? 'El proveedor ha limitado temporalmente las peticiones. Inténtalo más tarde.' }
  if (res.status === 504) return { data, message: 'La petición tardó demasiado. El progreso guardado no se ha perdido.' }
  return { data, message: data?.message ?? fallback }
}

export default function Settings() {
  const settings = useActivityStore(s => s.settings)
  const activities = useActivityStore(s => s.activities)
  const updateSettings = useActivityStore(s => s.updateSettings)
  const loadActivities = useActivityStore(s => s.loadActivities)
  const loadStats = useActivityStore(s => s.loadStats)
  const [syncStatus, setSyncStatus] = useState<SyncApiStatus | null>(null)
  const [connections, setConnections] = useState<ConnectionsApiStatus | null>(null)
  const [garminEmail, setGarminEmail] = useState('')
  const [garminPassword, setGarminPassword] = useState('')
  const [actions, setActions] = useState<ActionState>({
    garmin: false,
    strava: false,
    duplicates: false,
    'save-garmin': false,
  })
  const [notice, setNotice] = useState<ActionNotice | null>(null)
  const [garminRetryAttempt, setGarminRetryAttempt] = useState(0)
  const [garminAutoPaused, setGarminAutoPaused] = useState(false)
  const lastLoadedSyncAt = useRef<string | null>(null)
  const garminPumpRef = useRef<number | null>(null)
  const garminPumpInFlightRef = useRef(false)
  const visibleLogBaselineRef = useRef<{ jobId: string; length: number } | null>(null)

  const setAction = useCallback((name: ActionName, active: boolean) => {
    setActions(current => ({ ...current, [name]: active }))
  }, [])

  const refreshConnections = useCallback(async () => {
    const res = await fetch('/api/connections')
    if (!res.ok) throw new Error('No se pudo comprobar el estado de las conexiones.')
    const data = await res.json() as ConnectionsApiStatus
    setConnections(data)
    const garmin = data.connections.find(connection => connection.provider === 'garmin' && connection.status === 'connected')
    if (garmin?.provider_user_id) setGarminEmail(current => current || garmin.provider_user_id || '')
  }, [])

  const refreshSyncStatus = useCallback(async () => {
    const res = await fetch('/api/sync/status')
    if (!res.ok) throw new Error('No se pudo consultar el progreso de la sincronización.')
    const data: SyncApiStatus = await res.json()
    const jobId = data.status?.jobId ?? data.status?.provider ?? 'idle'
    if (visibleLogBaselineRef.current?.jobId === '__next__') {
      visibleLogBaselineRef.current = { jobId, length: 0 }
    } else if (!visibleLogBaselineRef.current || visibleLogBaselineRef.current.jobId !== jobId) {
      visibleLogBaselineRef.current = { jobId, length: data.log?.length ?? 0 }
    }
    setSyncStatus(data)
    if (!data.running && data.lastExitCode === 0 && data.status?.updatedAt && data.status.updatedAt !== lastLoadedSyncAt.current) {
      lastLoadedSyncAt.current = data.status.updatedAt
      await Promise.all([loadActivities(), loadStats()])
    }
  }, [loadActivities, loadStats])

  useEffect(() => {
    refreshConnections().catch(error => setNotice({ kind: 'error', text: (error as Error).message }))
    refreshSyncStatus().catch(error => setNotice({ kind: 'error', text: (error as Error).message }))
    const timer = window.setInterval(() => {
      refreshSyncStatus().catch(() => undefined)
    }, syncStatus?.running ? 2500 : 10000)
    return () => {
      window.clearInterval(timer)
      if (garminPumpRef.current) window.clearTimeout(garminPumpRef.current)
    }
  }, [refreshConnections, refreshSyncStatus, syncStatus?.running])

  const startSync = useCallback(async (provider: 'garmin' | 'strava', automatic = false) => {
    if (provider === 'garmin') {
      if (garminPumpInFlightRef.current) return
      garminPumpInFlightRef.current = true
    }
    if (!automatic) {
      setNotice(null)
      if (provider === 'garmin') {
        setGarminAutoPaused(false)
        setGarminRetryAttempt(0)
        visibleLogBaselineRef.current = {
          jobId: syncStatus?.running || syncStatus?.resumable
            ? syncStatus.status?.jobId ?? 'garmin'
            : '__next__',
          length: syncStatus?.log.length ?? 0,
        }
      }
    }
    setAction(provider, true)

    try {
      const res = await fetch(provider === 'garmin' ? '/api/sync/garmin' : '/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const { data, message } = await readApiResponse(
        res,
        provider === 'garmin' ? 'No se pudo continuar la importación de Garmin.' : 'No se pudo actualizar Strava.'
      )
      if (!res.ok || !data) throw new ApiRequestError(message, res.status)

      if (provider === 'garmin') {
        setGarminRetryAttempt(0)
        setGarminAutoPaused(false)
        await refreshSyncStatus()
        if (!data.running) {
          setNotice({ kind: 'success', text: message })
          await Promise.all([loadActivities(), loadStats()])
        }
      } else {
        setNotice({ kind: 'success', text: message })
        await Promise.all([loadActivities(), loadStats(), refreshConnections()])
      }
    } catch (error) {
      const text = (error as Error).message
      const retryable = !(error instanceof ApiRequestError) || error.status >= 500
      if (provider === 'garmin' && automatic && retryable) {
        setGarminRetryAttempt(current => {
          const next = current + 1
          if (next >= 3) {
            setGarminAutoPaused(true)
            setNotice({
              kind: 'warning',
              text: `${text} Garmin se ha pausado; pulsa “Reanudar Garmin” para continuar desde el último punto guardado.`,
            })
          } else {
            setNotice({ kind: 'warning', text: `${text} Reintento automático ${next}/3.` })
          }
          return next
        })
      } else {
        setNotice({ kind: error instanceof ApiRequestError && error.status === 429 ? 'warning' : 'error', text })
        if (provider === 'garmin') setGarminAutoPaused(true)
      }
      await refreshSyncStatus().catch(() => undefined)
    } finally {
      if (provider === 'garmin') garminPumpInFlightRef.current = false
      setAction(provider, false)
    }
  }, [
    loadActivities,
    loadStats,
    refreshConnections,
    refreshSyncStatus,
    setAction,
    syncStatus?.log.length,
    syncStatus?.resumable,
    syncStatus?.running,
    syncStatus?.status?.jobId,
  ])

  const currentSyncRunning = Boolean(syncStatus?.running)
  const currentSyncProvider = syncStatus?.status?.provider
  const currentSyncJobId = syncStatus?.status?.jobId
  const currentSyncProgress = syncStatus?.status?.progress?.done

  useEffect(() => {
    if (!currentSyncRunning || currentSyncProvider !== 'garmin' || garminAutoPaused || garminPumpInFlightRef.current) return

    if (garminPumpRef.current) window.clearTimeout(garminPumpRef.current)
    garminPumpRef.current = window.setTimeout(() => {
      garminPumpRef.current = null
      startSync('garmin', true).catch(error => setNotice({ kind: 'error', text: (error as Error).message }))
    }, garminRetryAttempt > 0 ? Math.min(15000, 4000 * garminRetryAttempt) : 1200)

    return () => {
      if (garminPumpRef.current) window.clearTimeout(garminPumpRef.current)
    }
  }, [
    garminAutoPaused,
    garminRetryAttempt,
    startSync,
    currentSyncRunning,
    currentSyncJobId,
    currentSyncProgress,
    currentSyncProvider,
  ])

  async function saveGarminCredentials() {
    if (!garminEmail.trim() || !garminPassword) {
      setNotice({ kind: 'error', text: 'Introduce el email y la contraseña de Garmin.' })
      return
    }
    setAction('save-garmin', true)
    setNotice(null)
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'garmin', email: garminEmail, password: garminPassword }),
      })
      const { data, message } = await readApiResponse(res, 'No se pudieron guardar las credenciales de Garmin.')
      if (!res.ok || !data) throw new ApiRequestError(message, res.status)
      setGarminPassword('')
      setNotice({ kind: 'success', text: 'Garmin conectado. La contraseña se ha guardado cifrada y no volverá a mostrarse.' })
      await refreshConnections()
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message })
    } finally {
      setAction('save-garmin', false)
    }
  }

  async function recalculateDuplicates() {
    setAction('duplicates', true)
    setNotice(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'recalculate' }),
      })
      const { data, message } = await readApiResponse(res, 'No se pudieron revisar los duplicados.')
      if (!res.ok || !data) throw new ApiRequestError(message, res.status)
      setNotice({ kind: 'success', text: message })
      await Promise.all([loadActivities(), loadStats()])
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message })
    } finally {
      setAction('duplicates', false)
    }
  }

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    updateSettings({ [key]: value })
  }

  function setSportEnabled(sport: PrimarySport, enabled: boolean) {
    updateSettings({
      enabledSports: {
        ...settings.enabledSports,
        [sport]: enabled,
      },
    })
  }

  function countSport(sport: PrimarySport): number {
    return activities.filter(a => a.sport === sport).length
  }

  const stravaConnected = connections?.connections.some(c => c.provider === 'strava' && c.status === 'connected') ?? false
  const garminConnected = connections?.connections.some(c => c.provider === 'garmin' && c.status === 'connected') ?? false
  const runningProvider = syncStatus?.running ? syncStatus.status?.provider : null
  const garminResumable = Boolean(syncStatus?.resumable || garminAutoPaused)
  const garminRunning = runningProvider === 'garmin' && !garminAutoPaused
  const statusPhase = garminAutoPaused && runningProvider === 'garmin' ? 'paused' : syncStatus?.status?.phase
  const visibleLogStart = visibleLogBaselineRef.current?.length ?? 0
  const visibleLog = (syncStatus?.log ?? []).slice(visibleLogStart)
  const providerLabel = syncStatus?.status?.provider === 'strava' ? 'Strava' : syncStatus?.status?.provider === 'garmin' ? 'Garmin' : null

  const noticeClasses: Record<NoticeKind, string> = {
    success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-400/25 bg-red-500/10 text-red-300',
    info: 'border-blue-400/25 bg-blue-500/10 text-blue-300',
    warning: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-100 mb-1">Ajustes</h1>
      <p className="text-sm text-slate-500 mb-8">Configura MostlyZ2 Agent, deportes activos y parámetros fisiológicos.</p>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(520px,680px)_minmax(420px,1fr)]">
        <div className="space-y-8">
          <section>
            <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Datos</h2>
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-200">Actualizar datos</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Strava usa OAuth. Garmin usa tu usuario y contraseña guardados cifrados en servidor.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Estado de las conexiones">
                    {!stravaConnected && (
                      <a href="/api/auth/strava/start" className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-1 text-orange-300 hover:bg-orange-500/20">
                        Conectar Strava
                      </a>
                    )}
                    {stravaConnected && (
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-emerald-700">
                        Strava: conectado
                      </span>
                    )}
                    <span className="rounded-full border border-slate-700/60 bg-slate-900/30 px-2.5 py-1 text-slate-400">
                      Garmin: {connections === null ? 'comprobando…' : garminConnected ? 'conectado' : 'pendiente'}
                    </span>
                  </div>
                  {!stravaConnected && (
                    <div className="mt-2 text-xs leading-5 text-orange-300">
                      Para Strava, configura Authorization Callback Domain como
                      <span className="font-mono"> mostlyz2.vercel.app</span>.
                      No uses https ni /api/auth/strava/callback en ese campo.
                    </div>
                  )}
                </div>
                <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-44">
                  <button
                    type="button"
                    onClick={() => startSync('garmin').catch(error => setNotice({ kind: 'error', text: (error as Error).message }))}
                    disabled={!garminConnected || garminRunning || actions.garmin}
                    aria-busy={garminRunning || actions.garmin}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !garminConnected || garminRunning || actions.garmin
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}
                  >
                    {connections === null
                      ? 'Comprobando…'
                      : !garminConnected
                        ? 'Guarda Garmin primero'
                        : garminRunning || actions.garmin
                      ? 'Importando Garmin…'
                      : garminResumable
                        ? 'Reanudar Garmin'
                        : 'Actualizar Garmin'}
                  </button>
                  {stravaConnected && (
                    <button
                      type="button"
                      onClick={() => startSync('strava').catch(error => setNotice({ kind: 'error', text: (error as Error).message }))}
                      disabled={actions.strava}
                      aria-busy={actions.strava}
                      className="px-4 py-2 rounded-lg border border-orange-400/30 bg-orange-500/10 text-sm font-medium text-orange-300 hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      {actions.strava ? 'Importando Strava…' : 'Actualizar Strava'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => recalculateDuplicates().catch(error => {
                      setNotice({ kind: 'error', text: (error as Error).message })
                      setAction('duplicates', false)
                    })}
                    disabled={actions.duplicates || actions.strava || activities.length === 0}
                    aria-busy={actions.duplicates}
                    className="px-4 py-2 rounded-lg border border-blue-400/30 bg-blue-500/10 text-sm font-medium text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  >
                    {actions.duplicates ? 'Revisando…' : 'Revisar duplicados'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                <input
                  type="email"
                  value={garminEmail}
                  onChange={event => setGarminEmail(event.target.value)}
                  placeholder="Email Garmin"
                  autoComplete="username"
                  aria-label="Email de Garmin"
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                />
                <input
                  type="password"
                  value={garminPassword}
                  onChange={event => setGarminPassword(event.target.value)}
                  placeholder="Contraseña Garmin"
                  autoComplete="current-password"
                  aria-label="Contraseña de Garmin"
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => saveGarminCredentials().catch(error => setNotice({ kind: 'error', text: (error as Error).message }))}
                  disabled={actions['save-garmin'] || !garminEmail.trim() || !garminPassword}
                  aria-busy={actions['save-garmin']}
                  className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 lg:col-span-1"
                >
                  {actions['save-garmin'] ? 'Guardando…' : garminConnected ? 'Actualizar acceso' : 'Guardar Garmin'}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                Seguro: la contraseña se cifra antes de guardarse, nunca se devuelve al navegador y solo se usa para importar tus datos.
              </p>

              {notice && (
                <div
                  role={notice.kind === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${noticeClasses[notice.kind]}`}
                >
                  {notice.text}
                </div>
              )}

              {syncStatus?.status && (
                <div className="mt-4 text-xs text-slate-500 space-y-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-1">
                      <span className="font-medium text-slate-300">{statusLabel(statusPhase ?? syncStatus.status.phase)}</span>
                      {providerLabel && (
                        <span className={providerLabel === 'Strava' ? 'text-orange-400' : 'text-blue-400'}>
                          {' · '}{providerLabel}
                        </span>
                      )}
                      <span>{' · '}{cleanText(syncStatus.status.error ?? syncStatus.status.message)}</span>
                    </div>
                    {garminRunning && (
                      <div className="mt-1 text-[11px] text-blue-500">
                        Continúa por tandas mientras Ajustes esté abierto. Si sales, se reanudará al volver.
                      </div>
                    )}
                    {syncStatus.status.progress && (
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                          <span>Progreso</span>
                          <span>{syncStatus.status.progress.done}/{syncStatus.status.progress.total}</span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-slate-900/70"
                          role="progressbar"
                          aria-label="Progreso de importación de Garmin"
                          aria-valuemin={0}
                          aria-valuemax={syncStatus.status.progress.total}
                          aria-valuenow={syncStatus.status.progress.done}
                        >
                          <div
                            className={`h-full rounded-full transition-all ${statusPhase === 'failed' || statusPhase === 'paused' ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{
                              width: `${Math.min(100, Math.round((syncStatus.status.progress.done / Math.max(1, syncStatus.status.progress.total)) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {visibleLog.length ? (
                    <pre aria-label="Registro de sincronización" className="max-h-36 overflow-y-auto rounded-lg bg-slate-900/70 border border-slate-700/50 p-3 text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap">
                      {visibleLog.slice(-12).map(line => {
                        const clean = cleanText(line)
                        return clean.includes('Garmin') || clean.includes('Strava') ? clean : `Garmin · ${clean}`
                      }).join('\n')}
                    </pre>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Deportes activos</h2>
            <div className="space-y-3">
              {SPORT_OPTIONS.map(({ sport, label, hint }) => {
                const enabled = settings.enabledSports[sport]
                const count = countSport(sport)
                return (
                  <label
                    key={sport}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-200">{label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {count} actividades importadas. {hint}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => setSportEnabled(sport, e.target.checked)}
                      className="h-5 w-5 accent-blue-500"
                    />
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-slate-600 mt-3">
              Al apagar un deporte, desaparece de listas, volumen, CTL/ATL/TSB, zonas, records y análisis. Los datos no se borran.
            </p>
          </section>

        </div>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <section>
            <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Motor de cálculo</h2>
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
            <div className="space-y-5">
              <Field
                label="FC Máxima"
                unit="bpm"
                value={settings.maxHR}
                min={140}
                max={220}
                onChange={v => set('maxHR', v)}
                hint="Usada para calcular las zonas de FC (Z1-Z5)."
              />

              <Field
                label="FTP (Functional Threshold Power)"
                unit="W"
                value={settings.ftp}
                min={100}
                max={500}
                onChange={v => set('ftp', v)}
                hint="Potencia que puedes mantener ~1h. Para ciclismo."
              />

              <Field
                label="FC en Umbral Láctico (Running)"
                unit="bpm"
                value={settings.lthrRunning}
                min={120}
                max={200}
                onChange={v => set('lthrRunning', v)}
                hint="FC aproximada en tu umbral láctico corriendo. Suele ser el 87-93% de FCmax."
              />

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Ritmo en Umbral (Running)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={Math.floor(settings.thresholdPace / 60)}
                    min={3}
                    max={8}
                    onChange={e => set('thresholdPace', Number(e.target.value) * 60 + (settings.thresholdPace % 60))}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                  <span className="text-slate-500">min</span>
                  <input
                    type="number"
                    value={settings.thresholdPace % 60}
                    min={0}
                    max={59}
                    onChange={e => set('thresholdPace', Math.floor(settings.thresholdPace / 60) * 60 + Number(e.target.value))}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                  <span className="text-slate-500">seg /km</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">Tu ritmo en umbral láctico corriendo. Usado para estimar la carga interna.</p>
              </div>
            </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
            <h2 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Mapa de actividades</h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-xs text-slate-500">Mapa de actividades</label>
                  <select
                    value={settings.mapStyle}
                    onChange={event => set('mapStyle', event.target.value as MapStyle)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                    aria-label="Tipo de mapa de actividades"
                  >
                    {MAP_STYLE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {MAP_STYLE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => set('mapStyle', option.value)}
                      aria-pressed={settings.mapStyle === option.value}
                      className={`group overflow-hidden rounded-xl border text-left transition-all ${
                        settings.mapStyle === option.value
                          ? 'border-blue-400 bg-blue-500/10 shadow-[0_0_0_1px_rgba(96,165,250,0.35)]'
                          : 'border-slate-700/60 bg-slate-900/30 hover:border-slate-500'
                      }`}
                    >
                      <MapStylePreview mapStyle={option.value} theme={settings.theme} />
                        <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-200">{option.label}</span>
                          {settings.mapStyle === option.value && (
                            <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              Activo
                            </span>
                          )}
                        </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {option.bestFor.map(item => (
                              <span key={item} className="rounded-full border border-slate-700/60 bg-slate-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                {item}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] leading-snug text-slate-500">{option.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  El cambio se guarda al momento y se aplica al abrir cualquier mapa de actividad.
                </p>
              </div>
            </div>
          </section>

          <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl text-xs text-slate-500 space-y-1">
            <p>Los ajustes se guardan localmente en tu navegador.</p>
            <p>Cambiarlos afecta retroactivamente a todos los cálculos de MostlyZ2.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function MapStylePreview({ mapStyle, theme }: { mapStyle: MapStyle; theme: ThemeMode }) {
  const tone = mapPreviewTone(mapStyle, theme)
  const tiles = [
    mapPreviewUrl(mapStyle, theme, 0, 0),
    mapPreviewUrl(mapStyle, theme, 1, 0),
    mapPreviewUrl(mapStyle, theme, 0, 1),
    mapPreviewUrl(mapStyle, theme, 1, 1),
  ]
  const label = mapStyle === 'topo'
    ? 'Relieve + curvas'
    : mapStyle === 'osm'
      ? 'Calles + POIs'
      : mapStyle === 'voyager'
        ? 'Ruta limpia'
        : theme === 'light' ? 'Claro automático' : 'Oscuro automático'

  return (
    <div className="relative h-32 overflow-hidden bg-slate-900">
      <div className="grid h-full grid-cols-2 grid-rows-2 opacity-95">
        {tiles.map((src, index) => (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            style={{ objectPosition: index === 0 ? '100% 100%' : index === 1 ? '0 100%' : index === 2 ? '100% 0' : '0 0' }}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
      <svg viewBox="0 0 360 128" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
        <path d="M42 102 C74 82 96 74 128 76 C166 78 180 52 220 50 C254 48 276 72 322 36" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
        <path d="M42 102 C74 82 96 74 128 76 C166 78 180 52 220 50 C254 48 276 72 322 36" fill="none" stroke={tone.route} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="42" cy="102" r="6" fill={tone.route} stroke="#fff" strokeWidth="2" />
        <circle cx="322" cy="36" r="6" fill="#22c55e" stroke="#fff" strokeWidth="2" />
      </svg>
      <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-800 shadow-sm">
        {label}
      </div>
    </div>
  )
}

function Field({
  label, unit, value, min, max, onChange, hint
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(Number(e.target.value))}
          className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        />
        <span className="text-slate-500 text-sm">{unit}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-blue-500"
        />
      </div>
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}
