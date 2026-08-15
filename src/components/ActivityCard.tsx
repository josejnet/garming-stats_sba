import { useNavigate } from 'react-router-dom'
import type { ActivitySummary } from '../types/garmin'
import {
  formatDistance,
  formatDuration,
  formatDate,
  formatPace,
  sportColor,
  sportIcon,
  sportLabel,
} from '../utils/formatters'

interface Props {
  activity: ActivitySummary
  compact?: boolean
}

export default function ActivityCard({ activity: a, compact }: Props) {
  const navigate = useNavigate()
  const color = sportColor(a.sport)

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/activity/${a.id}`)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          navigate(`/activity/${a.id}`)
        }
      }}
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 hover:border-slate-500/70 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/60"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0">{sportIcon(a.sport)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-200 truncate leading-tight">{a.title}</div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500 leading-tight">
            <span>{formatDate(a.startTime)} &middot; {sportLabel(a.sport)}</span>
            {a.startLocation && (
              <>
                <span>&middot;</span>
                <LocationLabel location={a.startLocation} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <Metric label="Distancia" value={formatDistance(a.distance, a.sport)} />
        <Metric label="Duración" value={formatDuration(a.duration)} />
        {(a.sport === 'running' || a.sport === 'walking') && a.avgPace
          ? <Metric label="Ritmo" value={formatPace(a.avgPace)} />
          : a.sport === 'cycling' && a.avgSpeed
            ? <Metric label="Velocidad" value={`${a.avgSpeed} km/h`} />
            : a.sport === 'swimming' && a.swolf
              ? <Metric label="SWOLF" value={String(Math.round(a.swolf))} />
              : <Metric label="FC Media" value={a.avgHR > 0 ? `${a.avgHR} bpm` : '–'} />
        }
        {!compact && <Metric label="FC" value={a.avgHR > 0 ? `${a.avgHR} bpm` : '–'} />}
        {a.aerobicTE != null && (
          <div
            className="hidden xl:block text-[10px] px-1.5 py-0.5 rounded-full border"
            style={{ color, borderColor: `${color}40`, background: `${color}15` }}
          >
            TE {a.aerobicTE.toFixed(1)}
          </div>
        )}
        <SourceBadge activity={a} />
      </div>
    </div>
  )
}

function SourceBadge({ activity }: { activity: ActivitySummary }) {
  if (!activity.source) return null
  const label = activity.source === 'strava' ? 'Strava' : 'Garmin'
  const className = activity.source === 'strava'
    ? 'text-orange-300 bg-orange-500/10 border-orange-400/20 hover:bg-orange-500/20'
    : 'text-blue-300 bg-blue-500/10 border-blue-400/20 hover:bg-blue-500/20'
  const url = activity.sourceUrl || sourceUrl(activity)
  if (!url) {
    return (
      <div className={`text-[9px] font-semibold uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${className}`}>
        {label}
      </div>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
      className={`text-[9px] font-semibold uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${className}`}
      title={`Abrir actividad original en ${label}`}
    >
      {label}
    </a>
  )
}

function sourceUrl(activity: ActivitySummary) {
  if (activity.source === 'strava') return `https://www.strava.com/activities/${activity.id}`
  if (activity.source === 'garmin') return `https://connect.garmin.com/modern/activity/${activity.id}`
  return ''
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-14 text-right">
      <div className="text-[10px] text-slate-500 leading-tight">{label}</div>
      <div className="text-xs font-semibold text-slate-200 leading-tight">{value}</div>
    </div>
  )
}

function LocationLabel({ location }: { location: NonNullable<ActivitySummary['startLocation']> }) {
  const code = countryCode(location.countryCode, location.country)
  const label = formatLocation(location)
  if (!label) return null
  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate">
      {code && (
        <img
          src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
          srcSet={`https://flagcdn.com/32x24/${code.toLowerCase()}.png 2x`}
          alt={code}
          className="h-3 w-4 shrink-0 rounded-[1px]"
          loading="lazy"
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  )
}

function formatLocation(location: ActivitySummary['startLocation']) {
  if (!location) return ''
  const parts = [location.city, location.region, location.country]
    .filter((part): part is string => Boolean(part?.trim()))
  const label = parts.length ? parts.join(', ') : location.label || ''
  return label || ''
}

function countryCode(countryCode?: string | null, country?: string | null) {
  const code = countryCode || countryCodeFromName(country)
  if (!code || !/^[A-Z]{2}$/.test(code)) return ''
  return code
}

function countryCodeFromName(country?: string | null) {
  const normalized = country
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (!normalized) return ''
  const countries: Record<string, string> = {
    espana: 'ES',
    spain: 'ES',
    francia: 'FR',
    france: 'FR',
    colombia: 'CO',
    japon: 'JP',
    japan: 'JP',
    barein: 'BH',
    bahrain: 'BH',
    'arabia saudita': 'SA',
    'saudi arabia': 'SA',
    portugal: 'PT',
    italia: 'IT',
    italy: 'IT',
    alemania: 'DE',
    germany: 'DE',
    'reino unido': 'GB',
    'united kingdom': 'GB',
    'estados unidos': 'US',
    'united states': 'US',
  }
  return countries[normalized] || ''
}
