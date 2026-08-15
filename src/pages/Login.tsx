export interface SessionUser {
  id: string
  email?: string
  displayName?: string
  display_name?: string
}

const features = [
  ['Tus fuentes', 'Conecta Strava y Garmin después de entrar. Strava tiene prioridad si hay duplicados.'],
  ['Tus métricas', 'Fitness, fatiga, forma, zonas, volumen, records, mapas y tendencia de VO2max.'],
  ['Tu espacio', 'Cada usuario tiene sus actividades, conexiones y ajustes separados.'],
]

const steps = [
  ['1', 'Entra con Google', 'Creamos tu espacio privado en MostlyZ2.'],
  ['2', 'Conecta fuentes', 'Autoriza Strava y guarda Garmin cifrado dentro de tu sesión.'],
  ['3', 'Importa y analiza', 'MostlyZ2 trae actividades, oculta duplicados y calcula tus KPIs.'],
]

export default function LoginPage({
  googleAuthReady,
}: {
  onLogin: (user: SessionUser) => void
  googleAuthReady: boolean
}) {
  return (
    <div className="min-h-screen bg-[#edf2f7] text-slate-950">
      <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section>
          <div className="mb-7 inline-flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-sm">
            <div className="grid size-10 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-lg font-black text-blue-600">
              Z2
            </div>
            <div>
              <div className="text-xl font-black text-blue-600">MostlyZ2</div>
              <div className="text-xs text-slate-500">Z2 Agent para entrenar suave, constante y con cabeza.</div>
            </div>
          </div>

          <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-blue-600">
            Dashboard personal de entrenamiento
          </p>
          <h1 className="max-w-4xl text-5xl font-black tracking-tight text-slate-950">
            Primero entra con Google. Después conectas tus deportes.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
            MostlyZ2 convierte tus actividades de Garmin y Strava en una vista clara de carga,
            forma, zonas, volumen, records y progreso. Está pensado para entrenar más en Z2,
            detectar excesos y entender qué está pasando sin abrir cinco plataformas.
          </p>

          <div className="mt-8 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            {features.map(([title, copy]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-bold text-slate-950">{title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{copy}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/70 p-5">
            <div className="text-sm font-bold text-blue-950">Privacidad y seguridad</div>
            <p className="mt-2 text-sm leading-6 text-blue-900/75">
              El login de Google solo identifica al usuario. Las conexiones deportivas se hacen después,
              dentro de la sesión. La contraseña de Garmin se guarda cifrada en servidor y no se vuelve a mostrar.
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-950">Entrar en MostlyZ2</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sin login no hay menú lateral, ajustes ni datos. Primero Google; luego el onboarding deportivo.
              </p>
            </div>
            <div className="grid size-14 place-items-center rounded-2xl bg-blue-600 text-lg font-black text-white">
              Z2
            </div>
          </div>

          {googleAuthReady ? (
            <a
              href="/api/auth/google/start"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              <span className="grid size-5 place-items-center rounded-full bg-white text-xs font-black text-blue-600">G</span>
              Entrar con Google
            </a>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Google OAuth aún no está activo para esta build. Si acabas de añadir las variables en Vercel,
              termina el redeploy y espera unos minutos a que Google propague el redirect URI.
            </div>
          )}

          <div className="mt-6 space-y-3">
            {steps.map(([number, title, copy]) => (
              <div key={number} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700">
                  {number}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-950">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{copy}</div>
                </div>
              </div>
            ))}
          </div>

        </section>
      </main>
    </div>
  )
}
