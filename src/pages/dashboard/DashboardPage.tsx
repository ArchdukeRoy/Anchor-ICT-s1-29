import { useEffect, useState } from 'react'
import { Users, DollarSign, TrendingUp, ShoppingCart, TrendingDown, BookMarked, Trash2, Loader2, BarChart2 } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import EventVolumeChart from '@/components/charts/EventVolumeChart'
import EventTypeChart from '@/components/charts/EventTypeChart'
import { PeriodType, QueryIntent } from '@/lib/types'
import QueryResultChart from '@/components/charts/QueryResultChart'

const BASE_URL = 'http://localhost:8000'
const EVENT_NAME = 'sudan_2023'

const stats = [
  { label: 'Events', value: '5412', delta: 12.5, icon: TrendingUp, tooltip: 'Tooltip used for description of metric cards' },
  { label: 'Conflict Intensity', value: '58%', delta: 8.1, icon: TrendingUp, tooltip: 'Tooltip used for description of metric cards' },
  { label: 'Active Actors', value: '4.6%', delta: 1.3, icon: TrendingUp, tooltip: 'Tooltip used for description of metric cards' },
  { label: 'Media Mentions', value: '8003', delta: -14, icon: TrendingDown, tooltip: 'Tooltip used for description of metric cards' },
]

interface SavedGraphRow {
  id: number
  event_config: string
  query_text: string
  intent_json: string
  label: string | null
  created_at: string
}

interface ResolvedGraph {
  id: number
  label: string | null
  query_text: string
  intent: QueryIntent
  data: unknown
  created_at: string
}

async function callApi(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
 
function buildSignalEndpoint(intent: QueryIntent, eventConfig: string): string {
  const p = intent.params ?? {}
  const map: Record<string, string> = {
    event_volume:         `/signals/${eventConfig}/event-volume?period_type=${p.period_type ?? 'daily'}`,
    event_type:           `/signals/${eventConfig}/event-type`,
    actor_frequency:      `/signals/${eventConfig}/actor-frequency?limit=${p.limit ?? 10}`,
    location_frequency:   `/signals/${eventConfig}/location-frequency?limit=${p.limit ?? 10}`,
    tone_over_time:       `/signals/${eventConfig}/tone-over-time?period_type=${p.period_type ?? 'weekly'}`,
    media_attention:      `/signals/${eventConfig}/media-attention?period_type=${p.period_type ?? 'daily'}`,
    actor_location_graph: `/signals/${eventConfig}/actor-location-graph?min_edge_weight=${p.min_edge_weight ?? 1}`,
    recent_events:        `/dashboard/${eventConfig}/recent-events?limit=${p.limit ?? 20}`,
  }
  return map[intent.signal] ?? ''
}
 
// SavedGraphs panel
function SavedGraphsPanel() {
  const [graphs, setGraphs] = useState<ResolvedGraph[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
 
  const fetchGraphs = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch the saved graph rows
      const rows = await callApi(`/graphs/${EVENT_NAME}?include_hidden=false`) as SavedGraphRow[]
 
      // 2. For each row, parse intent and fetch the signal data
      const resolved = await Promise.all(
        rows.map(async (row) => {
          const parsed = typeof row.intent_json === 'string'
            ? JSON.parse(row.intent_json)
            : row.intent_json
 
          const intent: QueryIntent = {
            chart_type: parsed.chart_type ?? parsed.type ?? '',
            signal:     parsed.signal ?? parsed.type ?? '',
            params:     parsed.params ?? {},
          }
 
          const endpoint = buildSignalEndpoint(intent, row.event_config)
          if (!endpoint) throw new Error(`Unknown signal: "${intent.signal}"`)
 
          const data = await callApi(endpoint)
          return { id: row.id, label: row.label, query_text: row.query_text, intent, data, created_at: row.created_at }
        })
      )
 
      setGraphs(resolved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
 
  useEffect(() => { fetchGraphs() }, [])
 
  const handleDelete = async (id: number) => {
    try {
      await fetch(`${BASE_URL}/graphs/${id}`, { method: 'DELETE' })
      setGraphs(prev => prev.filter(g => g.id !== id))
    } catch { /* silent */ }
  }
 
  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Saved Graphs</h2>
          {!loading && !error && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {graphs.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchGraphs}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Refresh
        </button>
      </div>
 
      {/* Body */}
      <div className="mt-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved graphs…
          </div>
        )}
 
        {!loading && error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-600 dark:bg-red-950 dark:text-red-400">
            Failed to load: {error}
          </div>
        )}
 
        {!loading && !error && graphs.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <BarChart2 className="h-8 w-8 opacity-30" />
            <p>No saved graphs yet.</p>
          </div>
        )}
 
        {!loading && !error && graphs.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {graphs.map(graph => (
              <SavedGraphCard key={graph.id} graph={graph} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
 
// Individual graph card
function SavedGraphCard({
  graph,
  onDelete,
}: {
  graph: ResolvedGraph
  onDelete: (id: number) => void
}) {
  const formattedDate = graph.created_at
    ? new Date(graph.created_at).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null
 
  return (
    <div className="group flex flex-col rounded-lg border border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
      {/* Title row */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <p className="text-sm font-semibold text-gray-800 leading-snug dark:text-gray-100">
          {graph.label ?? graph.query_text}
        </p>
        <button
          onClick={() => onDelete(graph.id)}
          title="Delete graph"
          className="shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:text-gray-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
 
      {/* Chart */}
      <div className="px-2">
        <QueryResultChart intent={graph.intent} data={graph.data} embedded />
      </div>
 
      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2.5 dark:border-gray-800">
        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-950 dark:text-brand-400">
          {graph.intent.signal}
        </span>
        {formattedDate && (
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-600">{formattedDate}</span>
        )}
      </div>
    </div>
  )
}
 
// Page
export default function DashboardPage() {
  const [periodType, setPeriodType] = useState<PeriodType>('daily')
 
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
 
      {/* Period toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">View by:</span>
        <button onClick={() => setPeriodType('daily')} className={periodType === 'daily' ? 'btn-primary' : 'btn-secondary'}>
          Daily
        </button>
        <button onClick={() => setPeriodType('weekly')} className={periodType === 'weekly' ? 'btn-primary' : 'btn-secondary'}>
          Weekly
        </button>
      </div>
 
      {/* Charts + Map */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Conflict Timeline</h2>
            <div className="mt-4 h-56">
              <EventVolumeChart periodType={periodType} />
            </div>
          </div>
          <div className="card">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Conflict Breakdown</h2>
            <div className="mt-4 h-56">
              <EventTypeChart />
            </div>
          </div>
        </div>
 
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Map</h2>
          <div className="mt-4 flex h-[320px] items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400 ring-1 ring-gray-100 dark:bg-gray-950 dark:text-gray-500 dark:ring-gray-800">
            [ Map goes here ]
          </div>
        </div>
      </div>
 
      {/* Saved Graphs */}
      <SavedGraphsPanel />
    </div>
  )
}