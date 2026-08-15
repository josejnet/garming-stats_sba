import type { VercelRequest, VercelResponse } from '@vercel/node'
import { hasDatabase } from '../_lib/db.js'
import { currentUserId, json, method } from '../_lib/http.js'
import { refreshStats, syncStravaUser } from '../_lib/sync.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return
  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  const userId = currentUserId(req)
  if (!userId) {
    json(res, 401, { error: 'login_required', message: 'Inicia sesión antes de importar actividades.' })
    return
  }
  const provider = String((req.body as { provider?: string } | undefined)?.provider || 'strava')
  console.info('[sync] request started', { provider, userId })

  try {
    if (provider === 'recalculate') {
      const result = await refreshStats(userId)
      console.info('[sync] duplicates refreshed', { userId, ...result })
      json(res, 200, {
        started: false,
        running: false,
        provider,
        ...result,
        message: `Duplicados revisados: ${result.hiddenDuplicates} de Garmin ocultos porque ya existen en Strava. Quedan ${result.visible} actividades visibles de ${result.total} importadas.`,
      })
      return
    }

    if (provider === 'garmin') {
      json(res, 400, {
        error: 'wrong_garmin_endpoint',
        provider,
        message: 'La importación de Garmin debe iniciarse desde su botón específico.',
      })
      return
    }

    if (provider !== 'strava') {
      json(res, 400, { error: 'provider_not_supported', provider, message: 'Proveedor de datos no válido.' })
      return
    }

    const imported = await syncStravaUser(userId)
    console.info('[sync] Strava completed', { userId, imported })
    json(res, 200, {
      started: true,
      running: false,
      provider,
      imported,
      message: `Strava actualizado: ${imported} actividades leídas. Los duplicados de Garmin se han ocultado automáticamente.`,
    })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    console.error('[sync] request failed', { provider, userId, error: rawMessage })

    if (rawMessage === 'strava_not_connected') {
      json(res, 409, { error: 'strava_not_connected', message: 'Conecta Strava antes de actualizar sus actividades.' })
      return
    }
    if (rawMessage.includes('429')) {
      json(res, 429, { error: 'provider_rate_limited', message: 'Strava ha limitado temporalmente las peticiones. Espera unos minutos y vuelve a intentarlo.' })
      return
    }
    if (rawMessage.includes('not configured')) {
      json(res, 503, { error: 'provider_not_configured', message: 'Falta una variable de configuración de Strava en Vercel.' })
      return
    }

    json(res, 500, {
      error: 'sync_failed',
      message: provider === 'strava'
        ? 'No se pudo actualizar Strava. El historial que ya estaba importado se mantiene intacto.'
        : 'No se pudieron recalcular los duplicados. No se ha borrado ninguna actividad.',
    })
  }
}
