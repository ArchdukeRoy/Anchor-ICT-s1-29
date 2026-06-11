import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { Eye, EyeOff } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

function FlyToController({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 9, { duration: 1 })
  }, [target, map])
  return null
}

const EVENT_NAME = 'sudan_2023'
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Coordinates matched to actual GDELT ActionGeo_FullName strings returned by the API.
const LOCATION_COORDS: Record<string, [number, number]> = {
  'Khartoum, Al Khartum, Sudan':             [15.5007,  32.5599],
  'Khartoum North, Al Khartum, Sudan':       [15.6333,  32.6333],
  'Omdurman, Al Khartum, Sudan':             [15.6442,  32.4800],
  'Wadi Seidna, Al Khartum, Sudan':          [15.9000,  32.5000],
  'Wadi Sayyidna, Al Khartum, Sudan':        [15.9000,  32.5000],
  'Al-Manshiya, Al Khartum, Sudan':          [15.5500,  32.5000],
  'Kabbashi, Al Khartum, Sudan':             [15.6000,  32.5000],
  'Darfur, Gharb Darfur, Sudan':             [12.8000,  23.0000],
  'El Fasher, Shamal Darfur, Sudan':         [13.6279,  25.3497],
  'El-Fasher, Shamal Darfur, Sudan':         [13.6279,  25.3497],
  'Fasher, Kassala, Sudan':                  [13.6279,  25.3497],
  'Fashir, Kassala, Sudan':                  [13.6279,  25.3497],
  'Dabanga, Shamal Darfur, Sudan':           [14.6500,  24.4500],
  'Tawila, Shamal Darfur, Sudan':            [14.6000,  25.7000],
  'Kebkabiya, Shamal Darfur, Sudan':         [13.9833,  24.0167],
  'Jebel Amer, Shamal Darfur, Sudan':        [13.7000,  24.2000],
  'Kutum, Shamal Darfur, Sudan':             [14.2000,  24.6700],
  'El Geneina, Gharb Darfur, Sudan':         [13.4500,  22.4333],
  'Geneina, Gharb Darfur, Sudan':            [13.4500,  22.4333],
  'Al Geneina, Gharb Darfur, Sudan':         [13.4500,  22.4333],
  'El-Geneina, Gharb Darfur, Sudan':         [13.4500,  22.4333],
  'Misterei, Gharb Darfur, Sudan':           [14.5500,  25.3000],
  'Zalingei, Gharb Darfur, Sudan':           [12.9167,  23.4667],
  'Nyala, Janub Darfur, Sudan':              [12.0500,  24.8833],
  'Ed Daein, Janub Darfur, Sudan':           [11.4667,  26.1333],
  'Um Dafuq, Janub Darfur, Sudan':           [10.4000,  24.9000],
  'Rizeigat, Janub Darfur, Sudan':           [10.5000,  25.5000],
  'Kubum, Janub Darfur, Sudan':              [11.2000,  24.5000],
  'Kordofan, Shamal Kurdufan, Sudan':        [13.5000,  29.5000],
  'El Obeid, Shamal Kurdufan, Sudan':        [13.1825,  30.2167],
  'Barah, Shamal Kurdufan, Sudan':           [13.7000,  30.5000],
  'Kadada, Shamal Kurdufan, Sudan':          [13.3000,  30.0000],
  'Kadugli, Janub Kurdufan, Sudan':          [11.0097,  29.7183],
  'Nuba Mountains, Janub Kurdufan, Sudan':   [11.0000,  30.0000],
  'Abyei, Janub Kurdufan, Sudan':            [ 9.5950,  28.4333],
  'Babanusa, Janub Kurdufan, Sudan':         [11.3321,  27.8122],
  'Muglad, Janub Kurdufan, Sudan':           [11.0333,  27.7333],
  'Kauda, Janub Kurdufan, Sudan':            [11.1000,  30.0000],
  'Rakuba, Janub Kurdufan, Sudan':           [11.5000,  29.0000],
  'Al-Fula, An Nil al Abya?, Sudan':         [11.7200,  28.3800],
  'El Fula, An Nil al Abya?, Sudan':         [11.7200,  28.3800],
  'White Nile, An Nil al Abya?, Sudan':      [13.0000,  32.5000],
  'Kosti, An Nil al Abya?, Sudan':           [13.1631,  32.6644],
  'Blue Nile, An Nil al Azraq, Sudan':       [11.5000,  34.0000],
  'Blue Nile State, An Nil al Azraq, Sudan': [11.5000,  34.0000],
  'Fula, An Nil al Azraq, Sudan':            [11.7200,  28.3800],
  'Al Jazirah, An Nil al Azraq, Sudan':      [14.5000,  33.5000],
  'El Gezira, An Nil al Azraq, Sudan':       [14.5000,  33.5000],
  'Wad Madani, Al Jazirah, Sudan':           [14.3910,  33.5199],
  'Wad Medani, Al Jazirah, Sudan':           [14.3910,  33.5199],
  'Medani, Al Jazirah, Sudan':               [14.3910,  33.5199],
  'Gezira State, Al Jazirah, Sudan':         [14.5000,  33.5000],
  'Bashair, Al Jazirah, Sudan':              [15.0000,  33.0000],
  'Abusham, Al Jazirah, Sudan':              [14.2000,  33.7000],
  'Muhammad Yusuf, Al Jazirah, Sudan':       [14.4000,  33.6000],
  'Sennar, Sinnar, Sudan':                   [13.5500,  33.6167],
  'Jebel Moya, Sinnar, Sudan':               [13.4000,  33.5000],
  'Sinja, Sinnar, Sudan':                    [13.1500,  33.9300],
  'Suwayda, Sinnar, Sudan':                  [13.3000,  33.8000],
  'Gedaref, Al Qa?arif, Sudan':              [14.0333,  35.3833],
  'El Gedaref, Al Qa?arif, Sudan':           [14.0333,  35.3833],
  'Kassala, Kassala, Sudan':                 [15.4591,  36.4000],
  'Wagga, Kassala, Sudan':                   [15.0000,  36.0000],
  'Port Sudan, Al Ba?r al A?mar, Sudan':     [19.6158,  37.2164],
  'Red Sea State, Al Ba?r al A?mar, Sudan':  [20.0000,  36.5000],
  'Merowe, Ash Shamaliyah, Sudan':           [18.4666,  31.8204],
  'Wadi Halfa, Ash Shamaliyah, Sudan':       [21.8093,  31.3528],
  'Dongola, Ash Shamaliyah, Sudan':          [19.1667,  30.4833],
  'Al Dabbah, Ash Shamaliyah, Sudan':        [18.0500,  30.9500],
  'Nile, Nahr an Nil, Sudan':                [17.0000,  33.5000],
  'River Nile, Nahr an Nil, Sudan':          [17.0000,  33.5000],
  'Abu Hamad, Nahr an Nil, Sudan':           [19.5333,  33.3167],
  'Meroe, Nahr an Nil, Sudan':               [16.9300,  33.7300],
  'Jebel Aulia, Sudan (general), Sudan':     [15.1000,  32.5000],
  'Sudan':                                   [12.8628,  30.2176],
}

// Returns ISO week label "YYYY-WNN" for a given date.
function isoWeekLabel(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

// Returns ISO day index: 0 = Monday, 6 = Sunday.
function isoDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

function getPlotTheme() {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    paper: 'transparent',
    font: isDark ? '#f9fafb' : '#6b7280',
    axis: isDark ? '#e5e7eb' : '#9ca3af',
    land: isDark ? '#1f2937' : '#e5e7eb',
    ocean: isDark ? '#111827' : '#f0f4ff',
    border: isDark ? '#374151' : '#d1d5db',
  }
}

export default function ReportsPage() {
  const [volumeRows, setVolumeRows]     = useState<Record<string, unknown>[]>([])
  const [locationRows, setLocationRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading]           = useState(true)
  const [flyTarget, setFlyTarget]           = useState<[number, number] | null>(null)
  const [activeLocation, setActiveLocation] = useState<string | null>(null)
  const [hiddenLocations, setHiddenLocations] = useState<Set<string>>(new Set())

  function toggleHidden(name: string) {
    setHiddenLocations((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  useEffect(() => {
    Promise.all([
      fetch(`/signals/${EVENT_NAME}/event-volume?period_type=daily`)
        .then((r) => r.json() as Promise<unknown>)
        .then((d) => setVolumeRows(Array.isArray(d) ? (d as Record<string, unknown>[]) : [])),
      fetch(`/signals/${EVENT_NAME}/location-frequency?limit=100`)
        .then((r) => r.json() as Promise<unknown>)
        .then((d) => setLocationRows(Array.isArray(d) ? (d as Record<string, unknown>[]) : [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // --- Calendar heatmap matrix ---
  const weekMap: Record<string, number[]> = {}
  for (const row of volumeRows) {
    const date = new Date(String(row.period))
    const week = isoWeekLabel(date)
    const day  = isoDayIndex(date)
    if (!weekMap[week]) weekMap[week] = new Array(7).fill(null)
    weekMap[week][day] = Number(row.event_count ?? 0)
  }
  const weeks = Object.keys(weekMap).sort()
  const z = DAY_LABELS.map((_, dayIdx) => weeks.map((w) => weekMap[w]?.[dayIdx] ?? null))

  // --- Geo map points — only locations present in the hardcoded coordinate map ---
  const geoPoints = locationRows
    .map((row) => {
      const name  = String(row.location ?? '')
      const coords = LOCATION_COORDS[name]
      if (!coords) return null
      return { name, lat: coords[0], lon: coords[1], count: Number(row.event_count ?? 0) }
    })
    .filter(Boolean) as { name: string; lat: number; lon: number; count: number }[]

  const maxCount = Math.max(...geoPoints.map((p) => p.count), 1)

  const theme = getPlotTheme()

  const card = 'overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900'
  const placeholder = 'flex h-64 items-center justify-center text-sm text-gray-400 dark:text-gray-500'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Maps</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Geographic event distribution and conflict activity heatmap.
        </p>
      </div>

      {/* Geographic map */}
      <div className={card}>
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Event Distribution by Location</h2>
        <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">Bubble size = event count. Only mapped locations are shown.</p>
        {loading ? (
          <div className={placeholder}>Loading map…</div>
        ) : geoPoints.length === 0 ? (
          <div className={placeholder}>No mapped locations found in data.</div>
        ) : (
          <div className="flex gap-4">
            <div className="h-[420px] flex-1 overflow-hidden rounded-xl">
              <MapContainer
                center={[15, 30]}
                zoom={6}
                scrollWheelZoom={false}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FlyToController target={flyTarget} />
                {geoPoints.filter((p) => !hiddenLocations.has(p.name)).map((p) => (
                  <CircleMarker
                    key={p.name}
                    center={[p.lat, p.lon]}
                    radius={8 + (p.count / maxCount) * 20}
                    pathOptions={{
                      fillColor: activeLocation === p.name ? '#f59e0b' : '#6366f1',
                      fillOpacity: 0.85,
                      color: '#ffffff',
                      weight: 1,
                    }}
                  >
                    <Tooltip>
                      <span className="font-medium">{p.name}</span>
                      <br />
                      {p.count} events
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            {/* Location jump buttons */}
            <div className="flex h-[420px] w-56 flex-col gap-1 overflow-y-auto">
              {[...geoPoints].sort((a, b) => b.count - a.count).map((p) => {
                const hidden = hiddenLocations.has(p.name)
                return (
                  <div
                    key={p.name}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                      hidden
                        ? 'opacity-40'
                        : activeLocation === p.name
                        ? 'bg-indigo-100 dark:bg-indigo-900'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (!hidden) {
                          setFlyTarget([p.lat, p.lon])
                          setActiveLocation(p.name)
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between text-left"
                    >
                      <span className={`truncate ${activeLocation === p.name && !hidden ? 'text-indigo-800 dark:text-indigo-200' : 'text-gray-700 dark:text-gray-300'}`}>
                        {p.name.split(',')[0]}
                      </span>
                      <span className="ml-2 shrink-0 font-semibold text-indigo-500 dark:text-indigo-400">{p.count}</span>
                    </button>
                    <button
                      onClick={() => toggleHidden(p.name)}
                      className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      title={hidden ? 'Show' : 'Hide'}
                    >
                      {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Calendar heatmap */}
      <div className={card}>
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Daily Event Volume</h2>
        {loading ? (
          <div className={placeholder}>Loading heatmap…</div>
        ) : volumeRows.length === 0 ? (
          <div className={placeholder}>No data available.</div>
        ) : (
          <div className="h-[220px]">
            <Plot
              data={[{
                type: 'heatmap',
                x: weeks,
                y: DAY_LABELS,
                z,
                colorscale: [
                  [0,   '#eef2ff'],
                  [0.2, '#c7d2fe'],
                  [0.5, '#6366f1'],
                  [0.8, '#3730a3'],
                  [1,   '#1e1b4b'],
                ],
                showscale: true,
                colorbar: { x: 1.01, thickness: 10, len: 0.9, tickfont: { size: 10 } },
                hoverongaps: false,
                hovertemplate: '%{x}<br>%{y}: <b>%{z} events</b><extra></extra>',
              }]}
              layout={{
                autosize: true,
                margin: { t: 8, r: 40, b: 64, l: 56 },
                paper_bgcolor: theme.paper,
                plot_bgcolor: theme.paper,
                font: { family: 'Inter, system-ui, sans-serif', size: 12, color: theme.font },
                xaxis: { nticks: 12, tickangle: -45, tickfont: { size: 11, color: theme.axis }, showgrid: false, zeroline: false },
                yaxis: { tickfont: { size: 12, color: theme.axis }, showgrid: false, zeroline: false, autorange: 'reversed' },
              }}
              config={{ responsive: true, displayModeBar: false }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
