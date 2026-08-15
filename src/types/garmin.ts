export type Sport = 'running' | 'cycling' | 'swimming' | 'walking' | 'gym' | 'other'
export type PrimarySport = 'running' | 'cycling' | 'swimming' | 'walking' | 'gym'
export type ThemeMode = 'dark' | 'light'
export type MapStyle = 'auto' | 'osm' | 'voyager' | 'topo'

export interface HRZone {
  zone: number
  name: string
  seconds: number
  lowBPM: number | null
  highBPM: number | null
}

export interface Lap {
  index: number
  distance: number     // km
  duration: number     // seconds
  avgHR: number | null
  avgPace: number | null  // sec/km
  avgSpeed: number | null // km/h
  avgPower: number | null // watts
  elevationGain: number
}

export interface ActivitySummary {
  id: number
  source?: 'garmin' | 'strava'
  sourceType?: string
  sourceUrl?: string | null
  title: string
  sport: Sport
  startTime: string    // ISO local datetime
  distance: number     // km
  duration: number     // seconds
  movingTime: number   // seconds
  elevationGain: number
  avgHR: number
  maxHR: number
  calories: number
  tss: number | null
  avgPace: number | null    // sec/km (running/walking/swim)
  avgSpeed: number | null   // km/h (cycling/walking)
  avgPower: number | null   // watts (cycling)
  normalizedPower: number | null
  avgCadence: number | null
  vo2max: number | null
  aerobicTE: number | null
  anaerobicTE: number | null
  startLocation?: {
    city?: string | null
    region?: string | null
    country?: string | null
    countryCode?: string | null
    label?: string | null
    lat?: number
    lon?: number
  } | null
  endLocation?: {
    lat?: number
    lon?: number
  } | null
  // Swimming only
  swolf?: number | null
  avgStrokesPerLength?: number | null
}

export interface ActivityDetail extends ActivitySummary {
  laps: Lap[]
  hrZones: HRZone[]
  gpxCoords: [number, number][]  // [lat, lon] pairs
  avgStrideLength?: number | null
  trainingEffect?: number | null
}

export interface FitnessPoint {
  date: string   // YYYY-MM-DD
  ctl: number    // Chronic Training Load (Fitness)
  atl: number    // Acute Training Load (Fatigue)
  tsb: number    // Training Stress Balance (Form)
  tss: number    // TSS accumulated that day
}

export interface GlobalStats {
  totalActivities: number
  byType: Record<string, number>
  vo2maxHistory: { date: string; value: number }[]
  syncedAt: string
}

export interface UserSettings {
  maxHR: number
  ftp: number          // Functional Threshold Power (watts)
  lthrRunning: number  // Lactate threshold HR for running
  thresholdPace: number // seconds per km at threshold
  ftpDate?: string
  enabledSports: Record<PrimarySport, boolean>
  theme: ThemeMode
  mapStyle: MapStyle
}

export const DEFAULT_SETTINGS: UserSettings = {
  maxHR: 185,
  ftp: 250,
  lthrRunning: 165,
  thresholdPace: 270, // ~4:30/km
  enabledSports: {
    running: true,
    cycling: true,
    swimming: false,
    walking: true,
    gym: true,
  },
  theme: 'light',
  mapStyle: 'auto',
}
