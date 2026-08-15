import { useEffect, useRef } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { MapStyle } from '../types/garmin'

interface Props {
  coords: [number, number][]
  sport?: string
  height?: number
}

const SPORT_COLORS: Record<string, string> = {
  running: '#ef4444',
  cycling: '#f97316',
  swimming: '#3b82f6',
  walking: '#14b8a6',
  gym: '#a855f7',
  other: '#8b5cf6',
}

export default function ActivityMap({ coords, sport = 'other', height = 320 }: Props) {
  const theme = useActivityStore(s => s.settings.theme)
  const mapStyle = useActivityStore(s => s.settings.mapStyle)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || coords.length === 0) return

    import('leaflet').then((L) => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      })

      const tiles = tileProvider(mapStyle, theme)
      L.tileLayer(tiles.url, {
        maxZoom: tiles.maxZoom,
        attribution: tiles.attribution,
      }).addTo(map)

      const color = SPORT_COLORS[sport] ?? '#3b82f6'
      const polyline = L.polyline(coords, { color, weight: 3, opacity: 0.9 })
      polyline.addTo(map)
      map.fitBounds(polyline.getBounds(), { padding: [16, 16] })

      window.requestAnimationFrame(() => {
        map.invalidateSize()
        map.fitBounds(polyline.getBounds(), { padding: [16, 16] })
      })

      L.circleMarker(coords[0], {
        radius: 6,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map)
      L.circleMarker(coords[coords.length - 1], {
        radius: 6,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map)

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [coords, sport, theme, mapStyle])

  if (coords.length === 0) {
    return (
      <div
        className="rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-500 text-sm"
        style={{ height }}
      >
        Sin datos GPS
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-slate-700/50"
      style={{ height }}
    />
  )
}

function tileProvider(mapStyle: MapStyle, theme: 'dark' | 'light') {
  if (mapStyle === 'osm') {
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }
  }
  if (mapStyle === 'voyager') {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    }
  }
  if (mapStyle === 'topo') {
    return {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      maxZoom: 17,
      attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap',
    }
  }

  const tileTheme = theme === 'light' ? 'light_all' : 'dark_all'
  return {
    url: `https://{s}.basemaps.cartocdn.com/${tileTheme}/{z}/{x}/{y}{r}.png`,
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors © CARTO',
  }
}
