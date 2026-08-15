const sections = [
  {
    title: 'Datos base y actividades visibles',
    body: [
      'MostlyZ2 calcula todo sobre las actividades importadas que pertenecen al usuario conectado y que están dentro de los deportes activos en Ajustes.',
      'Si una actividad existe en Garmin y Strava, se mantiene la versión de Strava como fuente preferente. Garmin se usa como respaldo o para actividades que no estén en Strava.',
      'Para tiempo se prioriza el tiempo en movimiento cuando existe. Si no viene informado, se usa la duración total.',
    ],
  },
  {
    title: 'Carga estimada',
    body: [
      'La carga intenta medir el estrés de una sesión. Si la actividad trae TSS real, se usa ese valor.',
      'En ciclismo, si hay potencia, se calcula con FTP: horas × IF² × 100. IF es la potencia normalizada o media dividida entre tu FTP.',
      'En running y caminar, si no hay TSS, se estima por ritmo contra tu ritmo umbral. Caminar aplica un factor de carga más suave.',
      'Si no hay ritmo/potencia suficiente, se usa una estimación por frecuencia cardiaca. Como último recurso se aplica una carga por hora según deporte.',
    ],
  },
  {
    title: 'Fitness, Fatiga y Forma',
    body: [
      'Fitness (CTL) es una media exponencial de la carga diaria con constante de 42 días.',
      'Fatiga (ATL) es una media exponencial de la carga diaria con constante de 7 días.',
      'Forma (TSB) es Fitness menos Fatiga. Un valor positivo suele indicar frescura; un valor negativo indica carga reciente acumulada.',
    ],
  },
  {
    title: 'Zonas de frecuencia cardiaca',
    body: [
      'Las zonas se calculan con porcentajes de tu FC máxima configurada: Z1 <60%, Z2 60-70%, Z3 70-80%, Z4 80-90% y Z5 90-100%.',
      'Las actividades sin frecuencia cardiaca usable no se meten artificialmente en Z1: quedan excluidas de la distribución de zonas.',
      'Esto hace que el gráfico de zonas sea menos optimista, pero más honesto.',
    ],
  },
  {
    title: 'Volumen, pasos y consistencia',
    body: [
      'El volumen de los últimos 30 días suma horas efectivas por deporte activo.',
      'Los pasos son equivalentes estimados. Si una actividad trae cadencia o pasos reales se aprovechan; si no, se usa una cadencia estándar por deporte.',
      'La consistencia mira los últimos 28 días y cuenta como día activo una sesión de al menos 15 minutos. Natación no aparece en ese mapa de consistencia.',
    ],
  },
  {
    title: 'VO2max y eficiencia aeróbica',
    body: [
      'Si Garmin o Strava traen VO2max, se usa como dato principal.',
      'Cuando no hay VO2max directo, MostlyZ2 puede estimarlo en running con ritmo, frecuencia cardiaca y FC máxima. Solo usa sesiones suficientemente largas y sin desnivel excesivo.',
      'La eficiencia aeróbica compara producción frente a pulso: velocidad/FC en running y caminar, o vatios/FC en ciclismo. Se filtran sesiones cortas o demasiado intensas.',
    ],
  },
  {
    title: 'Records',
    body: [
      'Los records por distancia usan la media de la actividad completa para estimar el tiempo equivalente en 1 km, 5 km, 10 km, 40 km, etc.',
      'Los records generales buscan máximos de distancia, tiempo en movimiento, desnivel, frecuencia cardiaca media, carga estimada y potencia cuando existe.',
      'Limitación actual: aún no calcula records reales por segmentos GPS o laps internos; eso sería la siguiente versión fina.',
    ],
  },
  {
    title: 'Ajustes que cambian los cálculos',
    body: [
      'FC máxima afecta zonas, carga por pulso, VO2max estimado y eficiencia.',
      'FTP afecta la carga de ciclismo basada en potencia.',
      'FC umbral y ritmo umbral afectan la carga de running y la interpretación de sesiones de carrera.',
      'Activar o apagar deportes cambia listas, volumen, fitness, zonas, records y análisis sin borrar los datos importados.',
    ],
  },
]

const formulas = [
  ['CTL', 'EMA de carga diaria, 42 días'],
  ['ATL', 'EMA de carga diaria, 7 días'],
  ['TSB/Forma', 'CTL - ATL'],
  ['TSS bici con potencia', 'horas × IF² × 100'],
  ['IF bici', 'potencia normalizada/media ÷ FTP'],
  ['VO2 estimado running', 'coste de velocidad ajustado por %FCmáx'],
]

export default function Documentation() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Documentación de cálculos</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Resumen práctico de cómo MostlyZ2 transforma tus actividades en KPIs de entrenamiento.
          La idea es que sepas cuándo un dato es directo, cuándo es estimado y qué ajustes lo modifican.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4">
          {sections.map(section => (
            <section key={section.title} className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
              <h2 className="text-sm font-semibold text-slate-100">{section.title}</h2>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
                {section.body.map(text => <p key={text}>{text}</p>)}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5">
            <h2 className="text-sm font-semibold text-blue-200">Regla de oro</h2>
            <p className="mt-2 text-sm leading-relaxed text-blue-100/80">
              Primero datos reales, después estimaciones de mayor calidad, y al final fallback conservador.
              Si falta pulso, potencia o ritmo, MostlyZ2 no inventa precisión.
            </p>
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
            <h2 className="text-sm font-semibold text-slate-100">Fórmulas rápidas</h2>
            <div className="mt-4 divide-y divide-slate-700/60">
              {formulas.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[7rem_1fr] gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="text-sm text-slate-300">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="text-sm font-semibold text-amber-200">Limitaciones actuales</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-amber-100/80">
              <li>Los records por distancia son equivalentes por media de actividad, no segmentos GPS reales.</li>
              <li>Algunas actividades antiguas pueden tener menos campos y caer en estimaciones conservadoras.</li>
              <li>La precisión sube mucho si Garmin/Strava traen pulso, potencia, cadencia y tiempo en movimiento.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
