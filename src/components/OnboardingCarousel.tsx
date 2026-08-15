import { useCallback, useEffect, useRef, useState } from 'react'
import { useActivityStore } from '../stores/activityStore'

interface Connection {
  provider: string
  status: string
}

export default function OnboardingCarousel() {
  const loadActivities = useActivityStore(s => s.loadActivities)
  const loadStats = useActivityStore(s => s.loadStats)
  const [step, setStep] = useState(0)
  const [garminEmail, setGarminEmail] = useState('')
  const [garminPassword, setGarminPassword] = useState('')
  const [connections, setConnections] = useState<Connection[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [savingGarmin, setSavingGarmin] = useState(false)
  const [syncing, setSyncing] = useState({ garmin: false, strava: false })
  const [garminBackground, setGarminBackground] = useState(false)
  const garminTimerRef = useRef<number | null>(null)
  const autoStravaStartedRef = useRef(false)

  const refreshConnections = useCallback(async () => {
    const res = await fetch('/api/connections')
    if (!res.ok) return
    const data = await res.json()
    setConnections(data.connections ?? [])
  }, [])

  useEffect(() => {
    refreshConnections().catch(() => undefined)
    return () => {
      if (garminTimerRef.current) window.clearTimeout(garminTimerRef.current)
    }
  }, [refreshConnections])

  const hasStrava = connections.some(c => c.provider === 'strava' && c.status === 'connected')
  const hasGarmin = connections.some(c => c.provider === 'garmin' && c.status === 'connected')

  async function saveGarminCredentials(event: React.FormEvent) {
    event.preventDefault()
    setSavingGarmin(true)
    setMessage(null)
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'garmin', email: garminEmail, password: garminPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.message ?? 'No se pudo guardar Garmin.')
      setGarminPassword('')
      setMessage('Garmin guardado. Ya puedes importar.')
      await refreshConnections()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setSavingGarmin(false)
    }
  }

  const startSync = useCallback(async (provider: 'garmin' | 'strava') => {
    setSyncing(current => ({ ...current, [provider]: true }))
    if (provider === 'garmin') setGarminBackground(true)
    setMessage(null)

    try {
      const res = await fetch(provider === 'garmin' ? '/api/sync/garmin' : '/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.message ?? `No se pudo importar ${provider}.`)

      setMessage(data.message ?? 'Importación completada.')
      await Promise.all([loadActivities(), loadStats(), refreshConnections()])

      if (provider === 'garmin' && data?.running) {
        garminTimerRef.current = window.setTimeout(() => {
          startSync('garmin').catch(error => setMessage((error as Error).message))
        }, 2500)
        return
      }

      if (provider === 'garmin') setGarminBackground(false)
    } catch (error) {
      setMessage((error as Error).message)
      if (provider === 'garmin') setGarminBackground(false)
    } finally {
      setSyncing(current => ({ ...current, [provider]: false }))
    }
  }, [loadActivities, loadStats, refreshConnections])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') !== 'strava' || !hasStrava || autoStravaStartedRef.current) return
    autoStravaStartedRef.current = true
    setStep(2)
    params.delete('connected')
    const query = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    startSync('strava').catch(error => setMessage((error as Error).message))
  }, [hasStrava, startSync])

  const slides = [
    {
      eyebrow: 'Paso 1',
      title: 'Conecta Strava',
      copy: 'Strava será la fuente preferente cuando haya actividades duplicadas. Ideal para nombres, mapas y enlaces originales.',
      status: hasStrava ? 'Conectado' : 'Pendiente',
      action: (
        <div className="grid gap-3">
          <a href="/api/auth/strava/start" className="w-fit rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white hover:bg-orange-400">
            {hasStrava ? 'Reconectar Strava' : 'Conectar Strava'}
          </a>
          <div className="rounded-xl border border-orange-400/25 bg-orange-500/10 px-3 py-2 text-xs leading-5 text-orange-100/80">
            Si Strava responde <span className="font-semibold">redirect_uri invalid</span>, en tu app de Strava pon
            <span className="font-mono"> mostlyz2.vercel.app </span>
            como Authorization Callback Domain. No pongas https ni la ruta completa.
          </div>
        </div>
      ),
    },
    {
      eyebrow: 'Paso 2',
      title: 'Conecta Garmin',
      copy: 'Garmin aporta histórico, FC, VO2max y métricas fisiológicas. Tus credenciales se guardan cifradas en servidor y solo se usan para importar tus actividades dentro de tu sesión.',
      status: hasGarmin ? 'Conectado' : 'Pendiente',
      action: (
        <form className="grid gap-2" onSubmit={saveGarminCredentials}>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="email"
              value={garminEmail}
              onChange={event => setGarminEmail(event.target.value)}
              placeholder="Email Garmin"
              autoComplete="username"
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
            />
            <input
              type="password"
              value={garminPassword}
              onChange={event => setGarminPassword(event.target.value)}
              placeholder="Contraseña Garmin"
              autoComplete="current-password"
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
            />
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-100/80">
            Seguro: la contraseña de Garmin se cifra antes de guardarse y no se muestra de nuevo en la app.
          </div>
          <button
            type="submit"
            disabled={savingGarmin}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {savingGarmin ? 'Guardando...' : hasGarmin ? 'Actualizar credenciales Garmin' : 'Guardar Garmin'}
          </button>
        </form>
      ),
    },
    {
      eyebrow: 'Paso 3',
      title: 'Importa tus actividades',
      copy: 'Garmin puede tardar y se importa por tandas. Puedes importar Strava sin esperar; si sales, Garmin se reanudará cuando vuelvas.',
      status: hasGarmin || hasStrava ? 'Listo para importar' : 'Conecta una fuente',
      action: (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startSync('garmin').catch(error => setMessage((error as Error).message))}
            disabled={!hasGarmin || syncing.garmin || garminBackground}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing.garmin || garminBackground ? 'Importando Garmin…' : 'Importar Garmin'}
          </button>
          <button
            type="button"
            onClick={() => startSync('strava').catch(error => setMessage((error as Error).message))}
            disabled={!hasStrava || syncing.strava}
            className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-200 hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing.strava ? 'Importando Strava...' : 'Importar Strava'}
          </button>
          {garminBackground && (
            <div className="basis-full rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-xs leading-5 text-blue-100/80">
              Garmin sigue importando por tandas. Puedes importar Strava mientras tanto; si sales, continuará al volver.
            </div>
          )}
        </div>
      ),
    },
  ]

  const current = slides[step]

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-blue-300">Bienvenido a MostlyZ2</div>
            <h2 className="mt-3 text-3xl font-black text-white">Vamos a traer tus entrenamientos</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Login de Google completado. Ahora conecta tus fuentes una vez. Después el Dashboard se llena solo y cada usuario mantiene su propio histórico.
            </p>
          </div>
          <div className="hidden rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-right sm:block">
            <div className="text-2xl font-black text-blue-300">Z2</div>
            <div className="text-xs text-slate-500">Setup inicial</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            {slides.map((slide, index) => (
              <button
                key={slide.title}
                onClick={() => setStep(index)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  step === index
                    ? 'border-blue-400/60 bg-blue-500/15'
                    : 'border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/70'
                }`}
              >
                <div className="text-[11px] uppercase tracking-widest text-slate-500">{slide.eyebrow}</div>
                <div className="mt-1 text-sm font-bold text-slate-100">{slide.title}</div>
                <div className={`mt-1 text-xs ${slide.status === 'Conectado' ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {slide.status}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-700/60 bg-slate-950/40 p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">{current.eyebrow}</div>
            <h3 className="mt-3 text-2xl font-black text-white">{current.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{current.copy}</p>
            <div className="mt-6">{current.action}</div>
            {message && (
              <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                {message}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-40"
          >
            Anterior
          </button>
          <div className="flex gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.title}
                aria-label={slide.title}
                onClick={() => setStep(index)}
                className={`h-2.5 rounded-full transition-all ${step === index ? 'w-8 bg-blue-400' : 'w-2.5 bg-slate-700'}`}
              />
            ))}
          </div>
          <button
            onClick={() => setStep(Math.min(slides.length - 1, step + 1))}
            disabled={step === slides.length - 1}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
}
