import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, hasDatabase } from '../_lib/db.js'
import { currentUserId, json, method } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return
  if (!hasDatabase()) {
    json(res, 503, { error: 'database_not_configured' })
    return
  }

  const userId = currentUserId(req)
  if (!userId) {
    json(res, 401, { error: 'login_required' })
    return
  }

  await db().query(`
    create extension if not exists pgcrypto;
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
    alter table sync_jobs add column if not exists payload jsonb not null default '{}'::jsonb;
    alter table sync_jobs add column if not exists updated_at timestamptz not null default now();
  `)

  const result = await db().query(
    `
      select id, provider, status, message, payload, started_at, finished_at, updated_at, created_at
      from sync_jobs
      where user_id = $1
      order by created_at desc
      limit 1
    `,
    [userId]
  )

  const job = result.rows[0]
  if (!job) {
    json(res, 200, {
      running: false,
      lastExitCode: 0,
      status: {
        phase: 'idle',
        message: 'Sin sincronización en marcha.',
        updatedAt: new Date().toISOString(),
      },
      log: [],
    })
    return
  }

  const active = job.status === 'queued' || job.status === 'running'
  const updatedAt = job.updated_at || job.started_at || job.created_at
  const stale = active && Date.now() - new Date(updatedAt).getTime() > 90_000
  const running = active && !stale
  const resumable = job.status === 'paused' || stale
  const progress = job.payload?.progress ?? null
  const pausedMessage = progress
    ? `Garmin está pausado en ${progress.done}/${progress.total}. Pulsa “Reanudar Garmin” para continuar.`
    : 'Garmin está pausado. Pulsa “Reanudar Garmin” para continuar.'
  json(res, 200, {
    running,
    resumable,
    lastExitCode: job.status === 'failed' ? 1 : 0,
    status: {
      phase: stale ? 'paused' : job.status,
      provider: job.provider,
      jobId: job.id,
      message: resumable ? pausedMessage : job.message || 'Sincronización en curso.',
      error: job.status === 'failed' ? job.message : null,
      updatedAt: updatedAt || job.finished_at,
      progress,
    },
    log: Array.isArray(job.payload?.log) ? job.payload.log : [],
  })
}
