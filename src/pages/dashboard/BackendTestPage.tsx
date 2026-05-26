import { useState } from 'react'
import Plot from 'react-plotly.js'
import {
  Activity,
  Users,
  MapPin,
  BarChart2,
  Newspaper,
  Network,
  BookMarked,
  Star,
  ClipboardList,
  Hash,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  Terminal,
} from 'lucide-react'
import { EventTypePoint, EventVolumePoint, PeriodType } from '@/lib/types'
import QueryResultChart from '@/components/charts/QueryResultChart'

// Types

type Status = 'idle' | 'loading' | 'success' | 'error'

interface TestResult {
  status: Status
  data?: unknown
  error?: string
  duration?: number
  chartType?: 'event_volume' | 'event_type'
  periodType?: PeriodType
}

// Inline Charts

function EventVolumeChartInline({ data, periodType }: { data: EventVolumePoint[]; periodType: PeriodType }) {
  const xValues = data.map((d) => d.period)
  const yValues = data.map((d) => d.event_count)
  const formattedX = xValues.map((label) => {
    if (periodType === 'weekly') {
      const [year, week] = label.split('-W')
      return `W${parseInt(week)} '${year.slice(2)}`
    }
    return label
  })
  return (
    <Plot
      data={[{
        x: formattedX, y: yValues, type: 'scatter', mode: 'lines', name: 'Event Count',
        line: { color: '#4c6ef5', width: 2.5, shape: 'spline', smoothing: 1.3 },
        fill: 'tozeroy', fillcolor: 'rgba(76, 110, 245, 0.08)',
        hovertemplate: '%{x}<br>Events: %{y}<extra></extra>',
      }]}
      layout={{
        autosize: true, margin: { t: 10, r: 32, b: 80, l: 48 },
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#6b7280' },
        xaxis: { showgrid: false, zeroline: false, tickfont: { size: 11, color: '#9ca3af' }, showline: false, ticklabelstandoff: 10 },
        yaxis: { showgrid: true, gridcolor: 'rgba(243,244,246,0.8)', zeroline: false, tickfont: { size: 11, color: '#9ca3af' }, title: { text: 'Event Count', font: { size: 11, color: '#9ca3af' }, standoff: 20 } },
        showlegend: false, hovermode: 'x unified',
      }}
      config={{ responsive: true, displayModeBar: false }}
      useResizeHandler
      style={{ width: '100%', height: '240px' }}
    />
  )
}

function EventTypeChartInline({ data }: { data: EventTypePoint[] }) {
  const sorted = [...data].sort((a, b) => a.event_count - b.event_count)
  const labels = sorted.map((d) => `${d.cameo_root} - ${d.cameo_description}`)
  const values = sorted.map((d) => d.event_count)
  return (
    <Plot
      data={[{
        x: values, y: labels, type: 'bar', orientation: 'h', name: 'Events',
        marker: { color: values.map((_, i) => `rgba(76, 110, 245, ${0.4 + (i / (values.length - 1)) * 0.6})`) },
        hovertemplate: '<b>%{y}</b><br>Events: <b>%{x}</b><extra></extra>',
        text: values.map(String), textposition: 'outside', textfont: { size: 11, color: '#6b7280' },
      }]}
      layout={{
        autosize: true, margin: { t: 10, r: 24, b: 40, l: 160 },
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#6b7280' },
        bargap: 0.4,
        xaxis: { showgrid: true, gridcolor: 'rgba(243,244,246,0.8)', zeroline: false, tickfont: { size: 11, color: '#9ca3af' }, showline: false, range: [0, Math.max(...values) * 1.15] },
        yaxis: { showgrid: false, zeroline: false, tickfont: { size: 11, color: '#6b7280' }, ticklabelstandoff: 10 },
        showlegend: false, hovermode: 'closest',
      }}
      config={{ responsive: true, displayModeBar: false }}
      useResizeHandler
      style={{ width: '100%', height: '240px' }}
    />
  )
}

// Config 

const BASE_URL = 'http://localhost:8000'

// Helpers

async function callApi(
  path: string,
  method = 'GET',
  body?: object
): Promise<{ data: unknown; duration: number }> {
  const start = performance.now()
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const duration = Math.round(performance.now() - start)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  const data = await res.json()
  return { data, duration }
}

// Sub-components

function StatusBadge({ status }: { status: Status }) {
  if (status === 'idle') return null
  if (status === 'loading')
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
      </span>
    )
  if (status === 'success')
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> OK
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-red-500">
      <XCircle className="h-3.5 w-3.5" /> Error
    </span>
  )
}

function ResultPanel({ result }: { result: TestResult }) {
  const [open, setOpen] = useState(true)
  if (result.status === 'idle' || result.status === 'loading' || result.data === null) return null

  const isError = result.status === 'error'
  const showChart = !isError && result.chartType && Array.isArray(result.data)

  return (
    <div
      className={`mt-3 rounded-lg border text-xs font-mono ${
        isError
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-gray-200 bg-gray-50 text-gray-800'
      }`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 font-sans text-xs font-medium text-gray-500">
          <Terminal className="h-3.5 w-3.5" />
          {isError ? 'Error' : showChart ? 'Chart' : 'Response'}
          {result.duration != null && !isError && (
            <span className="ml-1 rounded bg-gray-200 px-1.5 py-0.5 text-gray-500">
              {result.duration}ms
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-200">
          {isError ? (
            <pre className="max-h-64 overflow-auto px-3 py-2 text-xs leading-relaxed">{result.error}</pre>
          ) : showChart ? (
            <div className="bg-white px-2 py-2 rounded-b-lg">
              {result.chartType === 'event_volume' && (
                <EventVolumeChartInline data={result.data as EventVolumePoint[]} periodType={result.periodType ?? 'daily'} />
              )}
              {result.chartType === 'event_type' && (
                <EventTypeChartInline data={result.data as EventTypePoint[]} />
              )}
            </div>
          ) : (
            <pre className="max-h-64 overflow-auto px-3 py-2 text-xs leading-relaxed">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// Reusable test card

interface Field {
  key: string
  label: string
  placeholder?: string
  defaultValue?: string
  type?: 'text' | 'number' | 'select'
  options?: string[]
}

interface TestCardProps {
  icon: React.ReactNode
  title: string
  description: string
  fields: Field[]
  onRun: (values: Record<string, string>) => Promise<unknown>
  accent?: string
}

interface QueryIntent {
  chart_type: string
  signal: string
  params: Record<string, unknown>
}

function TestCard({ icon, title, description, fields, onRun, accent = 'bg-brand-600' }: TestCardProps) {
  const init = Object.fromEntries(
    fields.map(f => [f.key, f.defaultValue ?? ''])
  )
  const [values, setValues] = useState<Record<string, string>>(init)
  const [result, setResult] = useState<TestResult>({ status: 'idle' })

  const handleRun = async () => {
    setResult({ status: 'loading' })
    try {
      const res = await onRun(values)
      const { data, duration, chartType, periodType } = res as {
        data: unknown; duration: number
        chartType?: TestResult['chartType']
        periodType?: PeriodType
      }
      setResult({ status: 'success', data, duration, chartType, periodType })
    } catch (e) {
      setResult({ status: 'error', error: (e as Error).message })
    }
  }

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${accent} text-white`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <StatusBadge status={result.status} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {fields.map(f => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">{f.label}</label>
            {f.type === 'select' ? (
              <select
                value={values[f.key]}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              >
                {f.options?.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type ?? 'text'}
                value={values[f.key]}
                placeholder={f.placeholder}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleRun}
        disabled={result.status === 'loading'}
        className="btn-primary mt-4 flex w-full items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {result.status === 'loading' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
          </>
        ) : (
          'Run'
        )}
      </button>

      <ResultPanel result={result} />
    </div>
  )
}

function SavedGraphsCard() {
  const [charts, setCharts] = useState<{ intent: QueryIntent; data: unknown; label: string | null }[]>([])

  return (
    <div>
      <TestCard
        icon={<BookMarked className="h-4 w-4" />}
        title="get_saved_graphs()"
        description="Returns visible saved graphs and renders each one."
        accent="bg-teal-600"
        fields={[
          { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
          { key: 'include_hidden', label: 'include_hidden', type: 'select', options: ['false', 'true'], defaultValue: 'false' },
        ]}
        onRun={async v => {
          setCharts([])

          const { data, duration } = await callApi(
            `/graphs/${v.event_name}?include_hidden=${v.include_hidden}`  // ← fixed URL
          )

          const rows = data as {
            event_config: string
            intent_json: string
            label: string | null
          }[]

          const results = await Promise.all(
            rows.map(async row => {
              const parsed = typeof row.intent_json === 'string'
                ? JSON.parse(row.intent_json)
                : row.intent_json

              // Backend saves intent with "type" key; QueryResultChart expects "signal"
              const intent: QueryIntent = {
                chart_type: parsed.chart_type ?? parsed.type ?? '',
                signal: parsed.signal ?? parsed.type ?? '',  // ← handle both shapes
                params: parsed.params ?? {},
              }

              const signalEndpointMap: Record<string, string> = {
                event_volume:         `/signals/${row.event_config}/event-volume?period_type=${intent.params?.period_type ?? 'daily'}`,
                event_type:           `/signals/${row.event_config}/event-type`,
                actor_frequency:      `/signals/${row.event_config}/actor-frequency?limit=${intent.params?.limit ?? 10}`,
                location_frequency:   `/signals/${row.event_config}/location-frequency?limit=${intent.params?.limit ?? 10}`,
                tone_over_time:       `/signals/${row.event_config}/tone-over-time?period_type=${intent.params?.period_type ?? 'weekly'}`,
                media_attention:      `/signals/${row.event_config}/media-attention?period_type=${intent.params?.period_type ?? 'daily'}`,
                actor_location_graph: `/signals/${row.event_config}/actor-location-graph?min_edge_weight=${intent.params?.min_edge_weight ?? 1}`,
                recent_events:        `/dashboard/${row.event_config}/recent-events?limit=${intent.params?.limit ?? 20}`,
              }

              const endpoint = signalEndpointMap[intent.signal]
              if (!endpoint) throw new Error(`Unknown signal: "${intent.signal}" in saved graph`)

              const { data: chartData } = await callApi(endpoint)
              return { intent, data: chartData, label: row.label }
            })
          )

          setCharts(results)
          return { data: null, duration }
        }}
      />

      {charts.map((chart, i) => (
        <div key={i} className="mt-4">
          {chart.label && (
            <p className="mb-1 text-xs font-medium text-gray-500">{chart.label}</p>
          )}
          <QueryResultChart intent={chart.intent} data={chart.data} />
        </div>
      ))}
    </div>
  )
}

// Page
export default function BackendTestPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-900">Backend Test Console</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Test all{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-700">db.py</code>{' '}
          functions against local{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-700">anchor.db</code>.
          FastAPI must be running on{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-700">localhost:8000</code>.
        </p>
      </div>

      {/* Signal Query Functions */}
      <Section title="Signal Query Functions" subtitle="Pre-aggregated signal table reads">
        <TestCard
          icon={<Activity className="h-4 w-4" />}
          title="get_event_volume()"
          description="Daily or weekly event counts from signals_event_volume."
          accent="bg-brand-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'period_type', label: 'period_type', type: 'select', options: ['daily', 'weekly'], defaultValue: 'daily' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/signals/${v.event_name}/event-volume?period_type=${v.period_type}`
            )
            return { data, duration, chartType: 'event_volume' as const, periodType: v.period_type as PeriodType }
          }}
        />

        <TestCard
          icon={<Hash className="h-4 w-4" />}
          title="get_event_type()"
          description="Event counts grouped by CAMEO root code from signals_event_type."
          accent="bg-violet-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(`/signals/${v.event_name}/event-type`)
            return { data, duration, chartType: 'event_type' as const }
          }}
        />

        <TestCard
          icon={<Users className="h-4 w-4" />}
          title="get_actor_frequency()"
          description="Top N actors by event count from signals_actor_frequency."
          accent="bg-sky-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'limit', label: 'limit', type: 'number', placeholder: '10', defaultValue: '10' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/signals/${v.event_name}/actor-frequency?limit=${v.limit}`
            )
            return { data, duration }
          }}
        />

        <TestCard
          icon={<MapPin className="h-4 w-4" />}
          title="get_location_frequency()"
          description="Top N locations by event count from signals_location_frequency."
          accent="bg-emerald-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'limit', label: 'limit', type: 'number', placeholder: '10', defaultValue: '10' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/signals/${v.event_name}/location-frequency?limit=${v.limit}`
            )
            return { data, duration }
          }}
        />

        <TestCard
          icon={<BarChart2 className="h-4 w-4" />}
          title="get_tone_over_time()"
          description="Average Goldstein scale per period from signals_tone_over_time."
          accent="bg-amber-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'period_type', label: 'period_type', type: 'select', options: ['weekly', 'daily'], defaultValue: 'weekly' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/signals/${v.event_name}/tone-over-time?period_type=${v.period_type}`
            )
            return { data, duration }
          }}
        />

        <TestCard
          icon={<Newspaper className="h-4 w-4" />}
          title="get_media_attention()"
          description="Sum of num_mentions per period, queried directly from the events table."
          accent="bg-rose-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'period_type', label: 'period_type', type: 'select', options: ['daily', 'weekly'], defaultValue: 'daily' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/signals/${v.event_name}/media-attention?period_type=${v.period_type}`
            )
            return { data, duration }
          }}
        />

        <TestCard
          icon={<Network className="h-4 w-4" />}
          title="get_actor_location_graph()"
          description="Actor–location edges with weights from signals_actor_location_graph."
          accent="bg-indigo-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'min_edge_weight', label: 'min_edge_weight', type: 'number', placeholder: '1', defaultValue: '1' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/signals/${v.event_name}/actor-location-graph?min_edge_weight=${v.min_edge_weight}`
            )
            return { data, duration }
          }}
        />
      </Section>

      {/* Dashboard Summary Functions */}
      <Section title="Dashboard Summary Functions" subtitle="Quick counts and recent event rows">
        <TestCard
          icon={<Hash className="h-4 w-4" />}
          title="get_event_count()"
          description="Total raw event count via COUNT(*) on the events table."
          accent="bg-gray-700"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(`/dashboard/${v.event_name}/summary`)
            return { data, duration }
          }}
        />

        <TestCard
          icon={<ClipboardList className="h-4 w-4" />}
          title="get_recent_events()"
          description="Most recent full event rows ordered by event_date descending."
          accent="bg-gray-700"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'e.g. sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'limit', label: 'limit', type: 'number', placeholder: '20', defaultValue: '20' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/dashboard/${v.event_name}/recent-events?limit=${v.limit}`
            )
            return { data, duration }
          }}
        />
      </Section>

      {/* Saved Graph Functions */}
      <Section title="Saved Graph Functions" subtitle="Create, retrieve, hide and delete saved graphs">
        
        <SavedGraphsCard/>

        <TestCard
          icon={<BookMarked className="h-4 w-4" />}
          title="save_graph()"
          description="Save a new graph row. Returns the new row id."
          accent="bg-teal-600"
          fields={[
            { key: 'event_name', label: 'event_name', placeholder: 'sudan_2023', defaultValue: 'sudan_2023' },
            { key: 'query_text', label: 'query_text', placeholder: 'Show actor frequency', defaultValue: 'Show actor frequency' },
            { key: 'intent_json', label: 'intent_json (JSON string)', placeholder: '{"type":"actor_frequency"}', defaultValue: '{"type":"actor_frequency"}' },
            { key: 'label', label: 'label (optional)', placeholder: 'My graph' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(`/graphs/${v.event_name}`, 'POST', {
              query_text: v.query_text,
              intent_json: JSON.parse(v.intent_json),
              label: v.label || null,
            })
            return { data, duration }
          }}
        />

        <TestCard
          icon={<BookMarked className="h-4 w-4" />}
          title="update_graph_visibility()"
          description="Show or hide a saved graph by its id."
          accent="bg-teal-600"
          fields={[
            { key: 'graph_id', label: 'graph_id', type: 'number', placeholder: '1', defaultValue: '1' },
            { key: 'visible', label: 'visible', type: 'select', options: ['true', 'false'], defaultValue: 'true' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(`/graphs/${v.graph_id}/visibility`, 'PATCH', {
              graph_id: Number(v.graph_id),
              visible: v.visible === 'true',
            })
            return { data, duration }
          }}
        />

        <TestCard
          icon={<BookMarked className="h-4 w-4" />}
          title="delete_graph()"
          description="Delete a saved graph and its ratings by graph id."
          accent="bg-red-600"
          fields={[
            { key: 'graph_id', label: 'graph_id', type: 'number', placeholder: '1', defaultValue: '1' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(`/graphs/${v.graph_id}`, 'DELETE', {
              graph_id: Number(v.graph_id),
            })
            return { data, duration }
          }}
        />
      </Section>

      {/* Rating Functions */}
      <Section title="Rating Functions" subtitle="Developer-facing thumbs up / down on saved graphs">
        <TestCard
          icon={<Star className="h-4 w-4" />}
          title="rate_graph()"
          description="Submit a rating of 1 (👍) or -1 (👎) for a saved graph."
          accent="bg-yellow-500"
          fields={[
            { key: 'saved_graph_id', label: 'saved_graph_id', type: 'number', placeholder: '1', defaultValue: '1' },
            { key: 'rating', label: 'rating', type: 'select', options: ['1', '-1'], defaultValue: '1' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(`/graphs/${v.saved_graph_id}/rate`, 'POST', {
              saved_graph_id: Number(v.saved_graph_id),
              rating: Number(v.rating),
            })
            return { data, duration }
          }}
        />

        <TestCard
          icon={<Star className="h-4 w-4" />}
          title="get_graph_ratings()"
          description="Returns thumbs_up, thumbs_down, and total counts for a saved graph."
          accent="bg-yellow-500"
          fields={[
            { key: 'saved_graph_id', label: 'saved_graph_id', type: 'number', placeholder: '1', defaultValue: '1' },
          ]}
          onRun={async v => {
            const { data, duration } = await callApi(
              `/graphs/${v.saved_graph_id}/ratings`
            )
            return { data, duration }
          }}
        />
      </Section>
    </div>
  )
}

// Section wrapper

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <div className="mb-4 border-b border-gray-200 pb-3">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </div>
  )
}