# MostlyZ2: Vercel + API + sync multiusuario

Esta fase mantiene el flujo local/estático actual funcionando, pero deja la app preparada para operar como SaaS en Vercel con usuarios, conexiones OAuth y sincronización persistente.

## Qué existe ahora

- React/Vite sigue funcionando con `public/data/*.json` cuando no hay backend.
- En producción el frontend intenta `/api/*` primero y cae a JSON estático si la API no devuelve datos.
- Proyecto Vercel enlazado como `mostlyz2`.
- Producción publicada en `https://mostlyz2.vercel.app`.
- Neon Postgres provisionado desde Vercel Marketplace como `mostlyz2-db`.
- `sql/schema.sql` aplicado correctamente en Neon.
- Healthcheck validado: `databaseConfigured: true` y `databaseOk: true`.
- Endpoints Vercel Serverless:
  - `GET /api/health`
  - `GET /api/activities`
  - `GET /api/activities/:id`
  - `GET /api/stats`
  - `GET|POST /api/me/bootstrap`
  - `GET /api/auth/session`
  - `GET /api/auth/strava/start`
  - `GET /api/auth/strava/callback`
  - `GET /api/auth/garmin/start`
  - `GET /api/auth/garmin/callback`
  - `GET /api/connections`
  - `POST /api/sync`
  - `GET /api/sync/status`
  - `GET|POST /api/cron/sync`
- Cron diario en Vercel: `/api/cron/sync` a las `04:00 UTC`.
- Tokens de proveedor cifrados antes de guardarse.
- Esquema Postgres en `sql/schema.sql`.

## Variables de entorno necesarias en Vercel

```txt
DATABASE_URL=postgres://...
POSTGRES_SSL=true
MOSTLYZ2_DEMO_USER_ID=demo-user
SESSION_SECRET=...
OAUTH_STATE_SECRET=...
TOKEN_ENCRYPTION_KEY=...
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REDIRECT_URI=https://mostlyz2.vercel.app/api/auth/strava/callback
GARMIN_CLIENT_ID=...
GARMIN_CLIENT_SECRET=...
GARMIN_REDIRECT_URI=https://mostlyz2.vercel.app/api/auth/garmin/callback
GARMIN_AUTHORIZATION_URL=...
GARMIN_TOKEN_URL=...
GARMIN_SCOPES=...
CRON_SECRET=...
```

## Checklist para dejarlo operativo

1. En Strava Developers, configurar el callback autorizado:
   `https://mostlyz2.vercel.app/api/auth/strava/callback`.
2. Abrir Ajustes en MostlyZ2 y pulsar `Conectar Strava`.
3. Pulsar `Actualizar datos` para importar actividades Strava.
4. Cuando Garmin apruebe la app oficial, añadir sus variables `GARMIN_*` en Vercel y pulsar `Conectar Garmin`.

## Operaciones útiles

```bash
npm run db:migrate
npx vercel deploy --prod --yes --archive=tgz
```

`npm run db:migrate` carga `.env.production.local`, `.env.local` o `.env` si existen.

## Dirección de seguridad

No pedir usuario/contraseña de Garmin o Strava a usuarios estándar dentro de MostlyZ2.

- Strava usa OAuth oficial.
- Garmin oficial queda preparado por OAuth configurable mediante `GARMIN_*`; requiere Garmin Connect Developer Program / Activity API.
- Los refresh tokens se guardan cifrados.
