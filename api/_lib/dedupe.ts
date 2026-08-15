export const VISIBLE_ACTIVITY_FILTER_SQL = `
  not (
    source = 'garmin'
    and exists (
      select 1
      from activities strava_match
      where strava_match.user_id = activities.user_id
        and strava_match.source = 'strava'
        and strava_match.sport = activities.sport
        and (
          (
            abs(coalesce(strava_match.duration_seconds, 0) - coalesce(activities.duration_seconds, 0))
              <= greatest(180, coalesce(activities.duration_seconds, 0) * 0.10)
            and abs(coalesce(strava_match.distance_km, 0) - coalesce(activities.distance_km, 0))
              <= greatest(0.50, coalesce(activities.distance_km, 0) * 0.05)
            and (
              abs(extract(epoch from (strava_match.start_time - activities.start_time))) <= 900
              or strava_match.start_time::date = activities.start_time::date
            )
          )
          or (
            strava_match.start_time::date = activities.start_time::date
            and coalesce(activities.distance_km, 0) >= 2
            and abs(coalesce(strava_match.distance_km, 0) - coalesce(activities.distance_km, 0))
              <= greatest(0.08, coalesce(activities.distance_km, 0) * 0.003)
          )
          or (
            strava_match.summary->'startLocation'->>'lat' is not null
            and strava_match.summary->'startLocation'->>'lon' is not null
            and activities.summary->'startLocation'->>'lat' is not null
            and activities.summary->'startLocation'->>'lon' is not null
            and abs((strava_match.summary->'startLocation'->>'lat')::double precision - (activities.summary->'startLocation'->>'lat')::double precision) <= 0.003
            and abs((strava_match.summary->'startLocation'->>'lon')::double precision - (activities.summary->'startLocation'->>'lon')::double precision) <= 0.003
            and abs(coalesce(strava_match.distance_km, 0) - coalesce(activities.distance_km, 0))
              <= greatest(0.50, coalesce(activities.distance_km, 0) * 0.05)
          )
        )
    )
  )
`

export const VISIBLE_ACTIVITY_WHERE_SQL = `where user_id = $1 and ${VISIBLE_ACTIVITY_FILTER_SQL}`
