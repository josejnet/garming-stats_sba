# Informe de integración de MostlyZ2 en Clube.one

Auditoría realizada el **15 de agosto de 2026** sobre el commit base `7c00696` más todos los cambios locales pendientes. Este documento describe el código observado; cuando no hay evidencia suficiente se usa literalmente **DESCONOCIDO**. No contiene valores de secretos ni datos personales.

## 0. Identificación, acceso y ejecución rápida

- Repositorio: <https://github.com/josejnet/garming-stats_sba>
- Visibilidad: **público**. No requiere invitar a `josejnet`; el repositorio ya pertenece a esa cuenta.
- Rama principal: `main`.
- Copia local válida: `C:\Users\windows10\Desktop\VibeCoding\MostlyZ2`.
- Otras copias bajo `C:\Users\windows10\Desktop` con el mismo remoto: no se encontraron.
- Demo desplegada: <https://mostlyz2.vercel.app> (producción Vercel, estado `Ready`, HTTP 200 comprobado el 15-08-2026).
- Gestor: npm 11.5.2; `package-lock.json` lockfile v3.
- Runtime observado: Node.js 24.14.0 y Python 3.13.14. El README promete Node >=18 y Python >=3.10, pero no hay `.nvmrc`, `.node-version`, `engines` ni prueba automatizada de esas versiones mínimas.

Arranque del frontend con datos estáticos ya importados:

```powershell
cd C:\Users\windows10\Desktop\VibeCoding\MostlyZ2
npm ci
npm run dev
# http://localhost:5173
```

Arranque completo local, incluyendo importador Garmin/Strava:

```powershell
cd C:\Users\windows10\Desktop\VibeCoding\MostlyZ2
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
Copy-Item .env.example .env
# Rellenar únicamente en .env las variables necesarias.
.\.venv\Scripts\python.exe fetch\sync.py --limit 20
# Opcional, primera conexión Strava:
.\.venv\Scripts\python.exe fetch\strava_sync.py --authorize
npm run dev
```

Modo PostgreSQL/Vercel:

```powershell
# Con DATABASE_URL configurada:
npm run db:migrate
npm run db:import-garmin   # importa el JSON local existente al usuario configurado
npx vercel dev             # para ejecutar frontend y funciones serverless juntas
```

La base de datos no es imprescindible para la modalidad local estática: `src/lib/dataApi.ts` intenta la API y cae a `/data/*.json` salvo ante un 401. Sí es imprescindible para login, OAuth y sincronización desplegada. No hay Docker ni comando que levante PostgreSQL local; hay que aportar una URL PostgreSQL existente y ejecutar `npm run db:migrate`.

## 1. Qué es

1. MostlyZ2 es un panel personal de análisis de entrenamiento de resistencia.
2. Sirve principalmente al **atleta individual**; no existe interfaz ni permisos de entrenador o club.
3. Reúne actividades de Garmin Connect y Strava y oculta duplicados entre ambas fuentes.
4. El flujo central 1 es iniciar sesión y conectar Garmin o Strava.
5. El flujo central 2 es importar/sincronizar actividades y consultar su listado y detalle con mapa y vueltas.
6. El flujo central 3 es revisar dashboard, volumen semanal, carga TSS y fitness/fatiga/forma CTL-ATL-TSB.
7. El flujo central 4 es analizar zonas de frecuencia cardiaca, consistencia, balance deportivo, eficiencia y VO2max.
8. El flujo central 5 es configurar umbrales personales, deportes, tema y mapa, y consultar récords estimados.
9. Las pantallas, gráficos, cálculos y dos pipelines de importación existen y compilan; no son solo wireframes.
10. Auth por email, multiusuario, persistencia de ajustes, OAuth Garmin oficial y operación robusta de jobs están a medias; entrenador, club, permisos, planificación y tests son inexistentes.

**Terminado en términos de código:** navegación y UI de nueve páginas, temas claro/oscuro, responsive básico, importación local Garmin/Strava, API PostgreSQL de lectura, OAuth Strava, login Google condicionado a variables, credenciales Garmin cifradas, mapas, deduplicación y métricas del frontend.

**A medias:** el README aún describe la versión antigua sin servidor; `user_settings` existe pero el frontend guarda ajustes solo en `localStorage`; la sincronización Garmin desplegada usa credenciales personales mediante una API no oficial aunque también hay código OAuth oficial incompleto/configurable; el job Garmin avanza por tandas solo mientras el cliente sigue consultando; el cron solo actualiza Strava; la página de login permite Google solo si está configurado.

**Maqueta o sin lógica:** no se localizaron pantallas puramente decorativas, pero el login por email es una identidad sin verificación, no autenticación real. No hay planificación de entrenamientos, entrenador, club, membresías, facturación ni gestión de equipos.

## 2. Stack y versiones

| Área | Realidad observada |
|---|---|
| Lenguajes | TypeScript 6.0.3, TSX, Python >=3.10 declarado, SQL PostgreSQL, CSS |
| Frontend | React 19.2.7 + Vite 8.1.0; no es Next.js |
| Router | React Router DOM 7.18.0 con `BrowserRouter`; App/Pages Router no aplica |
| Estilos | Tailwind CSS 4.3.1 mediante `@tailwindcss/vite`, más CSS global |
| Estado | Zustand 5.0.14 con persistencia en `localStorage` |
| Fetching | `fetch` nativo; sin caché remota/SWR |
| Gráficos/mapa | Recharts 3.9.0; Leaflet 1.9.4 cargado dinámicamente |
| Backend | Vercel Functions TypeScript (`@vercel/node`) y una función FastAPI/Python |
| Base de datos | PostgreSQL; SQL manual, sin ORM y sin Prisma |
| Auth | Cookie HMAC propia + login email no verificado + OAuth Google; OAuth Strava/Garmin conecta proveedores |
| Hosting | Vercel, proyecto `mostlyz2`, producción en `mostlyz2.vercel.app` |
| Paquetes | npm; lockfile v3 |

Versiones directas resueltas en `package-lock.json`: date-fns 4.4.0, idb 8.0.3, leaflet 1.9.4, pg 8.22.0, React/React DOM 19.2.7, react-leaflet 5.0.0, React Router DOM 7.18.0, Recharts 3.9.0, Zustand 5.0.14, Tailwind 4.3.1, TypeScript 6.0.3, Vite 8.1.0 y oxlint 1.71.0. `idb`, `react-leaflet` y `date-fns` no tienen imports en el código actual.

### `package.json` completo

```json
{
  "name": "mostlyz2",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "sync": ".venv\\Scripts\\python.exe fetch\\update_all.py",
    "db:migrate": "node scripts/db-migrate.mjs",
    "db:import-garmin": "node scripts/import-garmin-to-db.mjs",
    "db:clear-demo": "node scripts/clear-demo-user.mjs",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "date-fns": "^4.4.0",
    "idb": "^8.0.3",
    "leaflet": "^1.9.4",
    "pg": "^8.22.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-leaflet": "^5.0.0",
    "react-router-dom": "^7.18.0",
    "recharts": "^3.9.0",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.20",
    "@tailwindcss/vite": "^4.3.1",
    "@types/leaflet": "^1.9.21",
    "@types/node": "^24.13.2",
    "@types/pg": "^8.21.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vercel/node": "^5.9.6",
    "@vitejs/plugin-react": "^6.0.2",
    "autoprefixer": "^10.5.2",
    "oxlint": "^1.69.0",
    "postcss": "^8.5.15",
    "tailwindcss": "^4.3.1",
    "typescript": "~6.0.2",
    "vite": "^8.1.0"
  }
}
```

Dependencias Python raíz: `garminconnect>=0.2.8`, `python-dotenv>=1.0.0`, `psycopg[binary]>=3.2.0`, `cryptography>=43.0.0`, `fastapi>=0.117.0`. `fetch/requirements.txt` añade `requests>=2.33.0` pero omite las dependencias de la función desplegada.

## 3. Mapa del repositorio

```text
MostlyZ2/                         raíz Vite, configuración, documentación y lockfiles
├── api/                          funciones serverless desplegadas en Vercel
│   ├── _lib/                     DB, crypto, sesión, OAuth, dedupe y sincronización compartidos
│   ├── activities/               lista y detalle de actividades del usuario
│   ├── auth/                     sesión propia y OAuth por proveedor
│   │   └── [provider]/            inicio/callback dinámico de Google, Garmin y Strava
│   ├── cron/                     cron diario de Strava
│   ├── me/                       bootstrap de usuario/demo
│   └── sync/                     sincronización, estado y función Python Garmin
│       └── garmin/               FastAPI que importa Garmin por lotes
├── docs/                         notas de la fase de despliegue Vercel
├── fetch/                        importadores CLI, normalización, merge y geocodificación
├── public/                       favicon e iconos; `public/data/` está ignorado
├── scripts/                      migración SQL, importación a DB y limpieza de demo
├── sql/                          esquema PostgreSQL único, sin historial de migraciones
├── src/                          aplicación React
│   ├── assets/                   recursos gráficos heredados
│   ├── components/               tarjetas, mapa, navegación, badges y onboarding
│   ├── hooks/                    selectores/cálculos derivados para las páginas
│   ├── lib/                      cliente de API con fallback a JSON estático
│   ├── pages/                    nueve pantallas enrutadas
│   ├── stores/                   store Zustand y persistencia de ajustes
│   ├── types/                    contrato TypeScript de actividad y settings
│   └── utils/                    fórmulas, fechas y formato
└── dist/                         build generado e ignorado
```

Diez archivos más importantes:

1. `src/App.tsx`: sesión, carga global y todas las rutas de página.
2. `src/types/garmin.ts`: contrato y unidades de la información deportiva.
3. `src/utils/calculations.ts`: TSS, CTL/ATL/TSB, zonas, semanas y récords.
4. `src/hooks/usePerformanceData.ts`: eficiencia, balance, VO2max y consistencia.
5. `src/stores/activityStore.ts`: estado, caché de detalles, filtros y settings persistidos.
6. `api/sync/garmin/index.py`: importación Garmin desplegada, jobs y upserts.
7. `api/_lib/sync.ts`: importación Strava y estadísticas en PostgreSQL.
8. `fetch/sync.py`: importador Garmin local completo.
9. `fetch/merge.py`: deduplicación Garmin/Strava y stats del modo JSON.
10. `sql/schema.sql`: modelo relacional completo.

## 4. Modelo de datos

### Esquema completo

```sql
create extension if not exists pgcrypto;

create table if not exists app_users (
  id text primary key,
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id text primary key references app_users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists provider_connections (
  id bigserial primary key,
  user_id text not null references app_users(id) on delete cascade,
  provider text not null check (provider in ('strava', 'garmin')),
  provider_user_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists activities (
  user_id text not null references app_users(id) on delete cascade,
  activity_id text not null,
  source text not null check (source in ('garmin', 'strava')),
  source_activity_id text not null,
  source_url text,
  sport text not null,
  start_time timestamptz not null,
  distance_km numeric,
  duration_seconds integer,
  summary jsonb not null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id),
  unique (user_id, source, source_activity_id)
);

create index if not exists activities_user_start_idx on activities(user_id, start_time desc);
create index if not exists activities_user_dedupe_idx on activities(user_id, dedupe_key);

create table if not exists activity_details (
  user_id text not null references app_users(id) on delete cascade,
  activity_id text not null,
  detail jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id),
  foreign key (user_id, activity_id) references activities(user_id, activity_id) on delete cascade
);

create table if not exists user_stats (
  user_id text primary key references app_users(id) on delete cascade,
  stats jsonb not null,
  calculated_at timestamptz not null default now()
);

create table if not exists sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  status text not null default 'queued',
  message text,
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Entidades y relaciones

- `app_users`: identidad raíz. `email` y `display_name` son nullable. Un usuario tiene 0..1 settings, 0..N conexiones, actividades, detalles, stats y jobs.
- `user_settings`: JSON arbitrario no validado; en la realidad actual no se lee ni escribe desde la UI.
- `provider_connections`: una conexión por usuario/proveedor. IDs, tokens y expiración son nullable. Para Garmin personal, el email se guarda también como `provider_user_id`, y email/password cifrados se reutilizan en columnas llamadas access/refresh token.
- `activities`: resumen indexable. `source_url`, `distance_km`, `duration_seconds` y `dedupe_key` son nullable. El resto de métricas vive duplicado dentro de `summary` JSONB.
- `activity_details`: JSONB completo por actividad, con laps, zonas y hasta 500 coordenadas GPS; es 1:1 con `activities` y la tabla que más espacio puede crecer.
- `user_stats`: snapshot JSONB con conteos y serie VO2max; 0..1 por usuario.
- `sync_jobs`: progreso y últimas 40 líneas de log en `payload`; fechas de inicio/fin nullable.

Unidades del contrato `ActivitySummary`/`ActivityDetail`: distancia km; duración y moving time segundos; desnivel metros; FC bpm; calorías kcal implícitas (el código no documenta formalmente la unidad); TSS puntos; ritmo segundos/km; velocidad km/h; potencia W; cadencia rpm o pasos/min según deporte (**DESCONOCIDO** a nivel de tipo); VO2max ml/kg/min por convención, no anotado en tipo; Training Effect escala Garmin sin unidad; SWOLF puntos; zancada **DESCONOCIDO**; coordenadas grados decimales; vuelta: km, segundos, bpm, s/km, km/h, W y m. Settings: FTP W, FC bpm y ritmo umbral s/km.

No hay concepto de club/organización. Todo cuelga directamente de `app_users.id`. El atleta se identifica por ese ID: hash del email para login manual, `google_<sub>` para Google, UUID temporal en ciertos comienzos OAuth o ID fijo en modo personal. `provider_user_id` enlaza al ID externo. El aislamiento es por `user_id`, por lo que soporta varios usuarios pero **no tenants/clubes**. Los datos actuales son efectivamente personales; la base observada tenía 2 usuarios, 1.768 actividades, 1.768 detalles, 2 conexiones, 5 jobs, 1 snapshot stats y 0 settings en el momento de la consulta.

## 5. Lógica de dominio

Toda la analítica se calcula en cliente salvo conteos/VO2max de `user_stats`. No hay tests de ninguna fórmula y ninguna función cita bibliografía en el repositorio.

| Métrica | Archivo/función | Fórmula real | Fuente declarada/test |
|---|---|---|---|
| Duración efectiva | `calculations.ts/effectiveDuration` | `max(0, movingTime || duration || 0)` | Decisión interna; sin test |
| TSS directo | `trainingLoad` | usa `activity.tss`, truncado a >=0 | Dato proveedor; sin test |
| TSS ciclismo | `trainingLoad` | `horas * IF² * 100`; `IF=clamp((NP || avgPower)/FTP, .35, 1.4)` | Fórmula TSS conocida, pero sin cita; sin test |
| TSS carrera/caminar | `trainingLoad` | `horas * (thresholdPace/avgPace)² * 100`; caminar multiplica 0,55; IF clamp .3..1,35 | Heurística interna sin cita/test |
| Carga por FC | `estimateLoadFromHR` | HR reserve con reposo fijo 60; TRIMP=`minutos*HRr*0.64*exp(1.92*HRr)`; normaliza contra TRIMP de 1 h a LTHR y multiplica factor deporte | Constantes compatibles con TRIMP de Banister para varón, pero el repo no lo afirma/cita; sin test |
| Carga fallback | `trainingLoad` | puntos/h: run 55, bike 45, swim 50, walk 20, gym 35, other 20 | Heurística sin cita/test |
| CTL | `calculateFitnessHistory` | EMA diaria `ctl += 2/43*(TSS-ctl)` desde cero | Ventana nominal 42 días, implementación EMA; sin cita/test |
| ATL | misma | EMA diaria `atl += 2/8*(TSS-atl)` desde cero | Ventana nominal 7 días; sin cita/test |
| TSB | misma | `CTL - ATL` del mismo día después de incorporar TSS | Convención interna; sin cita/test |
| Zonas FC | `HR_ZONE_DEFS`, `getZoneBPM`, `hrZoneForBPM` | Z1 <60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90-100% de FCmáx | Zonas genéricas; sin cita/test |
| Distribución por zonas | `estimateZonesFromHR`, `useZoneDistribution` | asigna **toda** la duración a la zona de FC media; no usa la distribución real del detalle | Aproximación interna; sin test |
| Volumen semanal | `aggregateByWeek` | suma km, segundos, TSS y conteo desde lunes | Agregación; sin test |
| Rampa semanal | `useWeeklyLoad` | `(TSS_semana-TSS_previa)/TSS_previa*100`; warn >8%, high >15% | Umbrales sin cita/test |
| Récord por distancia | `computePRs/findFastestDistanceRecords` | acepta actividad >=95% de distancia y escala linealmente el tiempo medio a 1/5/10/21,097/42,195 km o 40/90/180 km | No analiza segmentos; estimación interna sin test |
| Otros récords | `findGeneralRecords` | máximo de distancia, moving time, desnivel, FC media, TSS y potencia NP/media | Agregación; sin test |
| Eficiencia aeróbica | `aerobicEF` | run/walk=`km/h / bpm *100`; bike=`W/bpm`; solo >=30 min y zonas 1-3; media mensual ponderada por duración | Heurística sin cita/test |
| Tendencia eficiencia | `useAerobicEfficiency` | cambio % entre primer y último mes de los últimos 12 con datos de carrera | Agregación; sin test |
| Balance deportivo | `useTrainingBalance` | % de horas y % de TSS por deporte en 21 días | Agregación; sin test |
| VO2max directo | `useVo2maxTrend` | máximo directo por día | Dato proveedor; sin test |
| VO2max estimado | `estimateVo2maxFromActivity` | carrera >=12 min; coste=`3.5 + 0.2*metros/min`; divide por `clamp(avgHR/maxHR,.55,.98)` y limita 25..75 | Parece derivar de coste ACSM, pero no hay cita; sin test |
| Consistencia | `useConsistencyHeatmap` | horas por deporte/día; día activo si cualquier deporte >=0,25 h | Umbral interno; sin test |
| Racha | `useTrainingStreak` | días consecutivos con actividad >=15 min, admitiendo empezar ayer | Umbral interno; sin test |
| Pasos estimados | `useSportVolume/estimateStepsForActivity` | cadencia*min en run/walk; si no: 165/110/70/65/45/55 por min según deporte | Incluye “pasos” en bici/natación; heurística sin cita/test |
| Comparativa semanal | `useWeekComparison` | suma conteo, km, segundos, TSS, m y kcal esta semana vs anterior | Agregación; sin test |
| Deduplicación local cruzada | `fetch/merge.py/duplicate_score` | mismo deporte, inicio <=5 min (20 si 0 km), distancia <=max(0,5 km, 5-10%), duración <=max(600 s,20%); gana Strava | Heurística interna; sin test |
| Deduplicación DB | `api/_lib/dedupe.ts` y copia Python | tres reglas por duración/distancia/fecha, distancia casi exacta, o cercanía GPS+distancia; oculta Garmin si casa Strava | Heurística interna duplicada; sin test |

No se calculan potencia normalizada, curva de potencia, VAM, W/kg, FTP automático, tests de campo, ritmos por segmento, plan de entrenamiento, PMC persistente ni recomendaciones prescriptivas. NP, TSS y VO2max pueden venir ya calculados por Garmin/Strava; NP no se deriva de muestras. El valor diferencial está principalmente en normalización/deduplicación y en la capa de analítica cliente; la persistencia/API es CRUD relativamente fino. Los cálculos son útiles como MVP, pero varias métricas son aproximaciones fuertes y sin validación científica ni tests.

## 6. Entrada de datos

| Fuente | Implementación | Auth/sync/rate | Se guarda/recalcula |
|---|---|---|---|
| Garmin local | `garminconnect` en `fetch/sync.py` | email/password de `.env`; tokens en `~/.garth`; 0,3 s entre páginas, reintento exponencial y 0,5 s por detalle; manual | resumen, detalle, zonas, splits y GPX JSON; normaliza unidades y luego merge |
| Garmin desplegado personal | `garminconnect` en `api/sync/garmin/index.py` | email/password cifrados AES-GCM en DB; lotes 10..100, default 50, límite 2.000 y detalles/GPX default 20; el cliente reanuda | upsert resumen/detalle JSONB, progreso job y stats periódicas |
| Garmin OAuth oficial | `api/_lib/garmin.ts` | endpoints, scopes y credenciales por variables; start/callback/refresh implementados | conexión cifrada; **no existe importador de actividades que use ese access token** |
| Strava local | `requests` en `fetch/strava_sync.py` | OAuth browser callback `localhost:8765`, scope `activity:read_all`; páginas de 100; detecta 429 y muestra headers; manual | token en `.strava_tokens.json`; resumen y polyline; hereda detalles Garmin al deduplicar |
| Strava desplegado | `fetch` en `api/_lib/strava.ts` | OAuth + refresh; páginas 100 hasta límite default 5.000; sync manual completa y cron diario de 100 por usuario | resumen y detalle simplificado JSONB; stats recalculadas |
| Geocoding | Nominatim en `fetch/geocode_locations.py` | manual, cache por coordenada redondeada a 0,001°, espera 1,05 s | ciudad/región/país y coordenada de inicio en JSON local |

No hay Garmin/Wahoo directos adicionales, webhooks, carga `.fit`, `.gpx`, `.tcx` o `.csv`, ni entrada manual de actividades. GPX solo se **descarga** de Garmin. No hay webhooks Strava: la frescura depende del botón o cron. Los límites oficiales externos y cuotas contratadas son **DESCONOCIDO**; el código solo implementa paginación, esperas locales y manejo básico de 429.

Volumen real observado, sin exponer datos personales: dataset JSON local de 1.987 actividades, 3.220 ficheros/32.476.143 bytes, desde 2012-05 hasta 2026-08, 171 meses activos, media 11,6 actividades por mes activo y máximo 47. PostgreSQL tenía 1.768 actividades para 2 filas de usuario. El volumen mensual por atleta en DB es **DESCONOCIDO** porque la segunda consulta perdió conectividad; la referencia local anterior es la mejor evidencia disponible. `activity_details` es la tabla que más crece por GPX/JSON; `activities` crece una fila por actividad. La API de lista limita la respuesta a 5.000 visibles.

## 7. API y rutas

Todas las páginas requieren que `App.tsx` obtenga sesión; si no, solo renderiza login.

| Página | Contenido |
|---|---|
| `/` | Dashboard, onboarding sin actividades, semana, fitness y actividad reciente |
| `/activities` | filtros y lista de actividades |
| `/activity/:id` | métricas, mapa, vueltas y zonas del detalle |
| `/fitness` | gráfico CTL/ATL/TSB |
| `/zones` | distribución estimada de zonas FC |
| `/records` | récords estimados por deporte |
| `/performance` | eficiencia, carga, balance, VO2max y consistencia |
| `/settings` | umbrales, deportes, tema/mapa, conexiones y sync |
| `/docs` | documentación explicativa dentro de la app |

Endpoints desplegados (JSON mostrado es ejemplo fiel al contrato; IDs y datos son ficticios):

| Método/path | Acceso | Request -> response representativa |
|---|---|---|
| `GET /api/auth/session` | público | `{}` -> `{"authenticated":false,"user":null,"authProviders":{"google":true}}` |
| `POST /api/auth/session` | público, inseguro | `{"email":"athlete@example.test","displayName":"Athlete"}` -> `{"authenticated":true,"user":{"id":"user_<hash>","email":"...","displayName":"Athlete"},"authProviders":{"google":true}}` |
| `DELETE /api/auth/session` | cualquiera | `{}` -> `{"authenticated":false,"authProviders":{"google":true}}` |
| `GET /api/auth/{google,strava,garmin}/start` | Google público; Strava/Garmin con sesión | 302 al proveedor; errores JSON 401/501 |
| `GET /api/auth/{provider}/callback?code=&state=` | callback OAuth con state HMAC | 302 `/` o `/?connected=strava`; error `{"error":"invalid_provider_callback","provider":"..."}` |
| `GET /api/connections` | sesión | -> `{"databaseConfigured":true,"connections":[{"provider":"strava","provider_user_id":"123","status":"connected","updated_at":"..."}]}` |
| `POST /api/connections` | sesión | `{"provider":"garmin","email":"...","password":"..."}` -> `{"ok":true,"provider":"garmin","status":"connected","provider_user_id":"..."}` |
| `DELETE /api/connections?provider=strava` | sesión | -> `{"ok":true,"provider":"strava","status":"deleted"}` |
| `GET /api/activities` | sesión | -> `[ActivitySummary,...]`, deduplicado, orden desc, máximo 5.000 |
| `GET /api/activities/:id` | sesión y ownership por `user_id` | -> `ActivityDetail`; 404 `{"error":"activity_not_found"}` |
| `GET /api/stats` | sesión | -> `{"totalActivities":1768,"byType":{"running":100},"vo2maxHistory":[],"syncedAt":"..."}` |
| `GET/POST /api/me/bootstrap` | no exige sesión explícita | -> `{"user":{"id":"...","mode":"database"},"databaseConfigured":true}` |
| `POST /api/sync` | sesión | `{"provider":"strava"}` -> `{"started":true,"running":false,"provider":"strava","imported":100,"message":"..."}`; `recalculate` refresca duplicados |
| `POST /api/sync/garmin` | sesión | `{"reset":false}` -> progreso/importación de un lote Garmin |
| `GET /api/sync/status` | sesión | -> `{"running":false,"resumable":true,"lastExitCode":0,"status":{"phase":"paused","progress":{"done":50,"total":2000}},"log":[]}` |
| `GET/POST /api/cron/sync` | bearer `CRON_SECRET` solo si está configurado | -> `{"ok":true,"users":1,"results":[{"userId":"...","imported":100}]}` |

En `npm run dev`, `vite.config.ts` intercepta `POST /api/sync`, `GET /api/sync/status` y `POST /api/sync/cancel` para lanzar/cancelar `fetch/update_all.py`. Ese contrato difiere del backend desplegado. No hay OpenAPI para las funciones TypeScript; la única FastAPI expone su esquema implícito si Vercel lo permite. No hay validación Zod/JSON Schema, CSRF explícito ni versionado `/v1`.

## 8. Autenticación y permisos

- Cookie `mostlyz2_session=<userId>.<HMAC-SHA256>`; `HttpOnly`, `Secure`, `SameSite=Lax`, Path `/`, duración un año.
- El backend obtiene `user_id` de la cookie o, si `MOSTLYZ2_PERSONAL_MODE=true`, de `MOSTLYZ2_DEMO_USER_ID`.
- Login email: acepta cualquier email bien formado, deriva ID SHA-256 y crea sesión **sin contraseña, magic link ni verificación**. Cualquiera que conozca un correo puede suplantarlo.
- Login Google: OAuth OIDC básico; consulta userinfo, crea `google_<sub>` y cookie propia.
- Strava/Garmin OAuth son conexiones de datos, no login; requieren sesión previa. También existe conexión Garmin por email/password.
- No hay roles. El único permiso es “mis datos”, aplicado casi siempre con `where user_id=$1`.
- `CRON_SECRET` protege cron solo cuando existe; si falta, el endpoint queda público.
- `SESSION_SECRET`, `OAUTH_STATE_SECRET` y `TOKEN_ENCRYPTION_KEY` tienen fallback de desarrollo conocido; producción debe exigirlos, pero el código no falla cerrado.
- No hay expiración/revocación server-side de sesión, tabla de sesiones, CSRF token, auditoría de acceso, rate limit ni MFA propia.

Para confiar en Clube.one: eliminar el login/cookie propia y obtener el `user.id` y `clubId` de la sesión NextAuth server-side. Cada route handler/Server Action debe usar `getServerSession`/`auth()` y comprobar membresía/rol del club activo. Migrar o vincular `app_users.id` con el ID Prisma de Clube.one mediante una tabla `AthleteProfile`; no confiar en headers enviados por el navegador. OAuth de proveedores puede conservarse, pero state debe incluir usuario+club desde sesión y los tokens deben quedar vinculados al atleta. Las reglas de lectura de gestor/socio deben centralizarse y no descansar solo en filtros UI.

## 9. UI

Tailwind CSS 4 es la base, sin shadcn/ui ni librería de componentes. `src/index.css` define tokens de marca/deporte/zonas (`mostly-blue`, `mostly-ink`, run, ride, swim, other y zone1..5) y una extensa capa de overrides para tema claro sobre clases originalmente oscuras. Hay muchos colores slate/hex inline, por lo que el sistema de tokens no es completo. `src/App.css` parece CSS heredado y no se importa desde `main.tsx`.

La UI está en español, con algunos términos ingleses deportivos (“Recovery”, “Aerobic”, “Threshold”, “Half Marathon”). No hay framework i18n ni catálogo de mensajes. Hay layout móvil básico: sidebar de 64 px que se amplía a 224 px desde `md`, grids responsive y controles flexibles. No se encontraron tests visuales, accesibilidad automatizada ni PWA. Algunas tarjetas son accesibles por teclado; el conjunto no ha sido auditado WCAG.

Gráficos: Recharts (`AreaChart`, `LineChart`, `BarChart`, `PieChart`, etc.). Mapas: API Leaflet directa cargada dinámicamente; tiles de OpenStreetMap, CARTO y OpenTopoMap. `react-leaflet` está instalado pero no usado.

Componentes reutilizables y props:

| Componente | Props |
|---|---|
| `ActivityCard` | `activity: ActivitySummary`, `compact?: boolean` |
| `ActivityMap` | `coords: [number,number][]`, `sport?: string`, `height?: number` |
| `DeltaBadge` | `value: number`, `unit?: string`, `decimals?: number` |
| `ErrorBoundary` | `children: ReactNode` |
| `FormBadge` | `tsb: number` |
| `MetricCard` | `label`, `value: string|number`, `unit?`, `sub?`, `color?`, `large?` |
| `OnboardingCarousel` | sin props; acoplado al store y endpoints de sync |
| `RadialProgress` | `value`, `max`, `color`, `size?`, `stroke?`, `children?` |
| `Sidebar` | `user: SessionUser`, `onLogout: () => void` |

Las páginas contienen subcomponentes privados adicionales, no exportados como API reusable. La UI depende de Zustand y React Router, por lo que no puede copiarse sin adaptar navegación, carga de datos y límites Server/Client Component de Next.js.

## 10. Servicios externos y entorno

| Servicio | Uso | Coste observado |
|---|---|---|
| Garmin Connect | actividades, detalle, zonas, splits y GPX; API no oficial con credenciales personales y esqueleto OAuth oficial | **DESCONOCIDO**; no hay contrato/coste en repo |
| Strava API | OAuth, listado de actividades y polyline | **DESCONOCIDO**; no hay plan/coste en repo |
| Google OAuth | inicio de sesión | **DESCONOCIDO** |
| PostgreSQL | usuarios, conexiones, actividades, stats y jobs | proveedor **DESCONOCIDO**; la URL no se revela |
| Vercel | hosting, functions y cron diario | plan/coste **DESCONOCIDO** |
| OpenStreetMap/CARTO/OpenTopoMap | tiles de mapa | endpoints públicos; coste/permiso a escala **DESCONOCIDO** |
| Nominatim OSM | geocodificación inversa local a 1,05 s/consulta y caché | endpoint público; coste **DESCONOCIDO** |

No hay Cloudinary ni otro almacenamiento de ficheros: en local se usa `public/data/`; en producción se guardan JSON/GPX reducido dentro de PostgreSQL. No hay colas externas: `sync_jobs` es una tabla de estado, no un worker. No hay email. El único cron es `0 4 * * *` contra `/api/cron/sync`, que procesa secuencialmente hasta 25 conexiones Strava y 100 actividades por usuario.

`.env.example` de referencia, solo nombres y finalidad (coincide con el archivo raíz actualizado):

```dotenv
# Login no oficial del importador local Garmin.
GARMIN_EMAIL=
GARMIN_PASSWORD=
# OAuth oficial Garmin.
GARMIN_CLIENT_ID=
GARMIN_CLIENT_SECRET=
GARMIN_REDIRECT_URI=
GARMIN_AUTHORIZATION_URL=
GARMIN_TOKEN_URL=
GARMIN_SCOPES=
# Límites del importador Garmin.
GARMIN_SYNC_LIMIT=
GARMIN_DETAIL_LIMIT=
GARMIN_SYNC_BATCH=
# OAuth y límite Strava.
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=
STRAVA_SYNC_LIMIT=
# OAuth de login Google.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
# Conexión PostgreSQL y SSL; POSTGRES_URL es alias parcial.
DATABASE_URL=
POSTGRES_URL=
POSTGRES_SSL=
# Bypass opcional de usuario personal.
MOSTLYZ2_PERSONAL_MODE=
MOSTLYZ2_DEMO_USER_ID=
# Firma de sesión/state, cifrado y autorización cron.
SESSION_SECRET=
OAUTH_STATE_SECRET=
TOKEN_ENCRYPTION_KEY=
CRON_SECRET=
```

## 11. Calidad

Comandos disponibles/recomendados:

```powershell
npm run build
npx tsc -b --pretty false
npm run lint
npm test
```

Salida real del 15-08-2026:

```text
=== BUILD: npm run build ===
> mostlyz2@0.0.0 build
> tsc -b && vite build

vite v8.1.0 building client environment for production...
✓ 511 modules transformed.
dist/index.html                        0.48 kB │ gzip:   0.31 kB
dist/assets/index-pONKKbPk.css        68.30 kB │ gzip:  15.82 kB
dist/assets/leaflet-src-CTOilSCI.js  148.81 kB │ gzip:  43.38 kB
dist/assets/index-DRgoh799.js        783.64 kB │ gzip: 228.18 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 10.10s
EXIT=0

=== TYPECHECK: npx tsc -b --pretty false ===
EXIT=0

=== LINT: npm run lint ===
> mostlyz2@0.0.0 lint
> oxlint
EXIT=0

=== TESTS: npm test ===
npm error Missing script: "test"
npm error To see a list of scripts, run:
npm error   npm run
EXIT=1
```

Cobertura: **0% medible**; no hay runner, archivos de test ni configuración de cobertura. Tampoco hay CI de GitHub visible en el repositorio local.

Bugs/riesgos/deuda técnica confirmados:

1. Login por email sin prueba de propiedad: vulnerabilidad crítica de suplantación.
2. Fallback criptográfico conocido (`mostlyz2-dev-secret`) si faltan variables; no falla cerrado.
3. Cron público si `CRON_SECRET` no está configurado.
4. Cero tests, incluidas fórmulas deportivas, dedupe, auth y permisos.
5. README principal contradice la arquitectura nueva y dice que no hay servidor/DB.
6. `user_settings` no se usa; FTP/FC/tema quedan solo en localStorage del navegador y no siguen al usuario.
7. Dos backends de sync local/deploy con contratos distintos en las mismas rutas.
8. Tres implementaciones cercanas de dedupe (SQL TS, SQL Python y Python local) pueden divergir.
9. El endpoint `GET /api/sync/status` ejecuta DDL (`create/alter table`) en cada petición.
10. La sync Strava relee hasta 5.000 actividades completas; el cron solo 100 y 25 usuarios, secuencialmente, bajo function timeout.
11. Garmin serverless depende de login no oficial con email/password, propenso a MFA, bloqueos y cambios upstream.
12. El progreso Garmin requiere que Ajustes/onboarding siga haciendo polling para invocar lotes; no es un worker durable.
13. `fetchJson` cae a JSON estático ante errores API distintos de 401, pudiendo ocultar una caída del backend o mezclar dataset local.
14. JSONB de summary/detail no tiene schema/validación ni migración; los tipos TypeScript no protegen datos almacenados.
15. Coordenadas y salud se concentran en PostgreSQL sin política de retención/export/delete documentada.
16. Bundle principal 783,64 kB minificado; Vite avisa >500 kB.
17. Dependencias directas sin uso: `idb`, `react-leaflet`, `date-fns`; `react-leaflet` añade una licencia problemática.
18. No hay paginación API/UI real más allá del hard limit 5.000.
19. TSB incorpora el TSS del mismo día; zonas globales asignan toda la sesión por FC media; PR de distancia escala el promedio: resultados pueden parecer más precisos de lo que son.
20. `api/me/bootstrap` no comprueba explícitamente una sesión válida antes de crear usuario.
21. No hay rate limiting, observabilidad, Sentry, auditoría, idempotency keys ni protección CSRF explícita.
22. El esquema es un único SQL mutable sin migraciones versionadas ni rollback.

No se encontraron TODO/FIXME significativos en el código; la deuda se infiere de comportamiento implementado y ausencias comprobables.

## 12. Licencias y propiedad

- No existe `LICENSE`, `COPYING` o `NOTICE` en el repo. Por tanto, para terceros el código queda con copyright reservado; para uso interno la titularidad debe aclararse.
- Que sea código propio 100%: **DESCONOCIDO**. Git no contiene procedencia, contrato de cesión ni inventario de snippets.
- Plantilla de pago, código copiado o licencia restrictiva de origen: **DESCONOCIDO**. No se hallaron avisos, pero su ausencia no demuestra autoría.
- Metadatos npm: predominan MIT/ISC/BSD/Apache/MPL/BlueOak. No apareció GPL/AGPL entre paquetes bloqueados.
- Excepción crítica: `react-leaflet@5.0.0` y `@react-leaflet/core@3.0.0` declaran `Hippocratic-2.1`, licencia con restricciones de uso y no permisiva estándar/OSI. La aplicación no importa `react-leaflet`; conviene eliminarla o sustituirla tras validar legalmente, pero no se hizo por la regla de no refactorizar.
- `@types`/datos incluyen licencias MPL-2.0 y CC-BY-4.0 en el árbol transitivo; revisar notices al redistribuir.
- Dependencias Python observadas: garminconnect MIT, python-dotenv BSD-3-Clause y requests Apache-2.0. Metadatos de psycopg/cryptography/FastAPI en el venv eran **DESCONOCIDO** porque no estaban instaladas allí durante la consulta; sus licencias deben confirmarse en el build final.
- APIs, tiles y Nominatim tienen términos de servicio/atribución independientes. `ActivityMap` desactiva el control de atribución de Leaflet aunque construye strings de atribución; por tanto, la atribución puede no mostrarse: riesgo legal/ToS.

## 13. Opinión técnica

### Reutilizar tal cual

- Tipos deportivos de `src/types/garmin.ts` como contrato de migración, corrigiendo después campos ambiguos.
- Normalizadores Garmin/Strava y decoder de polyline, con tests antes de moverlos.
- UI visual de dashboard, actividades, detalle, fitness, zonas, records y performance como referencia y, en buena parte, JSX/CSS Client Components.
- Fórmulas de agregación simples y formatters.
- Esquema conceptual de provider connection y cifrado AES-GCM, sustituyendo la gestión de claves/sesión.
- Dataset real para pruebas de migración, siempre fuera de Git y anonimizado.

### Reescribir/adaptar

- Auth y autorización completas sobre NextAuth/Prisma/club membership.
- Persistencia: Prisma con columnas tipadas esenciales y JSON solo para payload de proveedor; migraciones versionadas.
- Sync como jobs durables/colas, webhooks Strava e incremental cursor-based; no requests largas ni polling que ejecuta trabajo.
- Capa fetching en SWR y route handlers Next.js, con contratos validados.
- Settings en DB por atleta, con defaults/versionado.
- Fórmulas de TSS/fitness/zonas/VO2max como paquete de dominio puro, documentado y testeado contra fixtures.
- Deduplicación única en backend con provenance y capacidad de revisión, no solo ocultación implícita.

### Tirar

- Login email sin verificación, cookies caseras y modo personal de producción.
- `api/me/bootstrap` actual.
- Vite sync middleware y dualidad JSON fallback como arquitectura de producto integrado.
- DDL en endpoints y secretos fallback.
- Dependencias no usadas; especialmente react-leaflet por licencia, si legal confirma el conflicto.

### Estrategia recomendada para Clube.one

**Portar dentro del proyecto Next.js 14 de Clube.one como módulo `performance`**, no iframe ni servicio separado inicialmente. Justificación: el volumen observado es moderado; stack TS/React/Tailwind/PostgreSQL coincide conceptualmente; la UI necesita sesión/navegación/roles nativos; y separar un microservicio conservaría precisamente las piezas más débiles (auth casera, sync serverless y SQL manual). Un monorepo solo aporta valor si se extrae un paquete worker/domain reutilizable; no es necesario para la primera integración. Iframe perjudica auth, navegación, responsive, theming, permisos y CSP, y perpetúa un tenant separado.

Propuesta de estructura interna: `app/[clubSlug]/performance/*` para UI; modelos Prisma `AthleteProfile`, `Activity`, `ActivityDetail`, `ProviderConnection`, `PerformanceSettings`, `SyncJob`; paquete `lib/performance/domain` para fórmulas puras; route handlers/Server Actions para OAuth y lecturas; Workflow/queue o proveedor de jobs para importación; SWR para actividad/progreso. Feature gate mediante la clave existente `performance` antes de resolver páginas y API.

La mayor preocupación no es convertir Vite a Next: es definir correctamente **propiedad, consentimiento y visibilidad de datos de salud/GPS** en un sistema multi-tenant, seguida de seguridad de auth/tokens y validez de métricas que hoy aparentan precisión clínica/deportiva sin tests ni fuentes.

## 14. Matriz de compatibilidad con Clube.one

Estimaciones para una persona familiarizada con ambas bases, incluyendo implementación y tests básicos pero no revisión legal ni migración masiva de datos.

| Área | Veredicto | Motivo | Esfuerzo |
|---|---|---|---|
| Auth | **Choca de frente** | cookie/HMAC y login falso vs NextAuth, roles y club | 2-4 días |
| Modelo de datos | Compatible con cambios grandes | PostgreSQL coincide; falta Prisma, club/athlete/provenance y migraciones | 4-7 días |
| API | Compatible con cambios medios | handlers serverless TS migrables, pero validación/auth/jobs deben rehacerse | 3-5 días |
| UI | Compatible con cambios menores/medios | React+TS+Tailwind coinciden; Router/Vite/store deben adaptarse a App Router | 3-6 días |
| Estado/fetching | Compatible con cambios menores | Zustand puede quedar para UI; remote state debe pasar a SWR | 1-2 días |
| Jobs/sync | **Choca de frente** | polling ejecutor y cron limitado vs operación multi-tenant durable | 5-10 días |
| Almacenamiento | Compatible con cambios medios | hoy JSONB+GPS en DB; decidir Cloudinary/Blob para FIT/GPX y retención | 2-4 días |
| Observabilidad/rate limit | Compatible con cambios menores | Clube.one ya tiene Sentry/Upstash; falta instrumentar endpoints y proveedor | 1-3 días |
| Email | Coincide por ausencia funcional | MostlyZ2 no envía; usar Resend si se añaden avisos de sync/consentimiento | 0,5-1 día |
| Feature gating/planes | Nuevo pero natural | conectar catálogo de módulos y roles existentes | 1-2 días |

Total MVP integrado razonable: **4-7 semanas-persona** (20-35 días laborables), más legal/privacidad y hardening. Un “copiar pantallas” visual puede hacerse en 1-2 semanas, pero no equivaldría a integración segura/operable.

## 15. Multi-tenant

No conviene añadir `clubId` indiscriminadamente. Separar propiedad deportiva de contexto de club:

- `AthleteProfile`: propiedad del usuario/persona; puede existir fuera de un club.
- `ProviderConnection`, `PerformanceSettings`: deben pertenecer al atleta/usuario, no al club, para que conexiones y umbrales le sigan al cambiar de club.
- `Activity` y `ActivityDetail`: dato del atleta. Deben llevar `athleteId`; opcionalmente `originClubId`/consent scope para auditoría, no como ownership principal.
- `UserStats`: reemplazar por agregados recalculables por atleta y, si se materializan vistas de equipo, por `(clubId, athleteId, period)`.
- `SyncJob`: `athleteId` obligatorio y `clubId` contextual nullable para cuotas, facturación y auditoría.
- Nuevas tablas necesarias con `clubId`: `CoachAthleteAccess`/consentimiento, `Team`, asignaciones, objetivos/planes creados por club, notas de entrenador, dashboards de equipo y configuración del módulo.

Si simplemente se añade `clubId` a las tablas actuales, se rompen el PK `(user_id, activity_id)`, todos los `where user_id`, índices, dedupe, importadores, stats, cascadas y la noción de que el atleta conserva su historial. También se duplicarían actividades al pertenecer a dos clubes o cambiar de uno a otro.

Recomendación de propiedad: los datos brutos de rendimiento son del **atleta** y le siguen al cambiar de club. El club obtiene una licencia de acceso revocable y acotada mientras existe membresía/consentimiento, salvo obligación contractual/legal distinta. Registrar quién conectó el proveedor, consentimiento, fecha de revocación y qué periodos puede ver cada club.

Visibilidad sugerida:

- Socio/atleta: todas sus actividades, GPS, métricas, conexiones, settings, exportación y borrado; controla compartir.
- Gestor/entrenador autorizado: resumen, carga, tendencias, cumplimiento, actividades deportivas necesarias y alertas de fatiga de atletas asignados/consentidos.
- No debería ver por defecto: credenciales/tokens, email personal innecesario, ruta GPS exacta/inicio-fin (puede revelar domicilio), actividad marcada privada, salud no pertinente, ni atletas de otros clubes/equipos.
- Gestor administrativo sin función deportiva: solo activación/licencia del módulo y estado agregado, no datos de salud.
- Todo acceso cruzado requiere comprobación server-side de `clubId`, rol, asignación y consentimiento, más auditoría.

## 16. Propuesta del módulo `performance`

### Pantallas dentro del panel del club

- `/[club]/performance`: resumen propio para socio; cartera de atletas/equipo para gestor deportivo.
- `/[club]/performance/activities`: lista, filtros, import status y detalle.
- `/[club]/performance/fitness`: CTL/ATL/TSB, carga semanal y ramp rate con advertencia de que son estimaciones.
- `/[club]/performance/zones`: configuración y distribución por zonas.
- `/[club]/performance/analysis`: eficiencia, VO2max, balance deportivo y consistencia.
- `/[club]/performance/records`: récords y evolución, distinguiendo proveedor/estimado.
- `/[club]/performance/athletes/[athleteId]`: vista de entrenador limitada por acceso.
- `/[club]/performance/team`: cohortes, carga/alertas y atletas sin sincronizar; solo gestor deportivo.
- `/[club]/performance/connections`: Garmin/Strava, consentimiento, última sync y desconexión.
- `/[club]/settings/modules/performance`: activación, cupos, retención y roles; gestor del club.

Socio: ve y gestiona su historial, conexiones, umbrales, privacidad y análisis. Gestor deportivo: ve solo atletas consentidos/asignados, compara carga y tendencias, añade objetivos/notas futuras y nunca ve tokens. Gestor administrativo: activa módulo y plazas sin acceder a salud/GPS.

Planes recomendados:

- **FREE:** teaser/read-only muy limitado o prueba con importación manual y últimos 30 días; sin equipo.
- **PRO:** panel individual completo, Strava, histórico y métricas.
- **PREMIUM:** Garmin, sync automática, análisis avanzado, exportación y entrenador con cupo de atletas.
- **ENTERPRISE:** equipos grandes, roles granulares, retención, auditoría, SSO/export y SLA.
- Activación suelta `performance`: sí, con precio/cupo por atleta activo y condiciones claras de tratamiento de datos.

Antes de fijar planes, validar costes/cuotas de Garmin/Strava, base de datos/almacenamiento GPS, soporte y encaje legal de datos de salud. Esos costes son **DESCONOCIDO** en este repositorio.

## Anexo A. Seguridad Git y secretos

`.gitignore` excluye `.env`, `.env.local`, `.env.*.local`, `.strava_tokens.json`, `.garth/`, logs, `.vercel`, `public/data/`, `dist/data/`, dumps/backups, bases locales y formatos habituales de claves. `.env.example` se permite deliberadamente y no contiene valores.

Auditoría realizada:

- `git ls-files`: ningún `.env`, token, clave, dump o dato personal versionado; solo `.env.example`.
- Historial de nombres: únicamente `.env.example` apareció entre rutas sensibles.
- Escaneo regex del contenido actual y parches históricos para tokens GitHub/OpenAI, AWS keys, private keys y asignaciones de passwords/tokens/secrets: 0 coincidencias.
- `gitleaks` no estaba instalado; por tanto no se pudo ejecutar esa herramienta específica.

Conclusión basada en la evidencia disponible: **no se encontró ningún secreto subido anteriormente**. No es una garantía criptográfica absoluta; si existe sospecha externa o un secreto fue borrado antes del historial disponible, rotarlo y ejecutar un escáner especializado sobre todos los blobs.

## Anexo B. Decisiones abiertas marcadas DESCONOCIDO

- Titularidad/autores y licencia que Clube.one puede recibir: **DESCONOCIDO**.
- Contrato y acceso oficial Garmin Developer Program: **DESCONOCIDO**.
- Cuotas/costes reales de proveedores y Vercel/PostgreSQL: **DESCONOCIDO**.
- Base legal, DPA, retención y clasificación regulatoria de datos de salud/GPS: **DESCONOCIDO**.
- Semántica exacta de cadencia y zancada para cada proveedor/deporte: **DESCONOCIDO**.
- Uso real por entrenadores o clubes y requisitos de consentimiento actuales: **DESCONOCIDO**.
