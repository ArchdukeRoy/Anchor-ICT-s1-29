import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import Plot from 'react-plotly.js'

type SignalName =
  | 'event_volume'
  | 'event_type'
  | 'actor_frequency'
  | 'location_frequency'
  | 'tone_over_time'
  | 'media_attention'
  | 'actor_location_graph'
  | 'recent_events'

interface QueryIntent {
  chart_type: string
  signal: SignalName
  params: Record<string, unknown>
}

interface QueryResultChartProps {
  intent: QueryIntent
  data: unknown
}

interface DownloadButtonProps {
  label: string
  onClick: () => void
}

const signalTitles: Record<SignalName, string> = {
  event_volume: 'Event Volume',
  event_type: 'Event Types',
  actor_frequency: 'Actor Frequency',
  location_frequency: 'Location Frequency',
  tone_over_time: 'Average Goldstein Scale',
  media_attention: 'Media Attention',
  actor_location_graph: 'Actor Location Links',
  recent_events: 'Recent Events',
}

// API responses are typed as unknown at the boundary; keep only object rows before plotting.
function asRecords(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data)
    ? data.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : []
}

function isLineSignal(signal: SignalName) {
  return signal === 'event_volume' || signal === 'tone_over_time' || signal === 'media_attention'
}

function isBarSignal(signal: SignalName) {
  return (
    signal === 'actor_frequency' ||
    signal === 'location_frequency' ||
    signal === 'event_type'
  )
}

function prepareRowsForSignal(signal: SignalName, rows: Record<string, unknown>[]) {
  if (isLineSignal(signal)) {
    return rows.slice(-52)
  }

  if (isBarSignal(signal)) {
    return [...rows]
      .sort((a, b) => Number(a.event_count ?? 0) - Number(b.event_count ?? 0))
      .slice(-12)
  }

  return rows
}

function useProgressiveRows(rows: Record<string, unknown>[]) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)
    if (rows.length === 0) return

    const chunkSize = Math.max(1, Math.ceil(rows.length / 36))
    const intervalId = window.setInterval(() => {
      setVisibleCount((current) => {
        const next = Math.min(rows.length, current + chunkSize)
        if (next >= rows.length) {
          window.clearInterval(intervalId)
        }
        return next
      })
    }, 80)

    return () => window.clearInterval(intervalId)
  }, [rows])

  return {
    rows: rows.slice(0, visibleCount),
    isStreaming: visibleCount < rows.length,
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function filenameFor(signal: SignalName, extension: string) {
  const timestamp = new Date().toISOString().slice(0, 10)
  return `anchor-${signal}-${timestamp}.${extension}`
}

function getPlotTheme() {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    axisColor: isDark ? '#e5e7eb' : '#9ca3af',
    labelColor: isDark ? '#f9fafb' : '#6b7280',
    gridColor: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(243, 244, 246, 0.9)',
    fillColor: isDark ? 'rgba(76, 110, 245, 0.24)' : 'rgba(76, 110, 245, 0.08)',
  }
}

function DownloadButton({ label, onClick }: DownloadButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="query-download-button inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
      title={label}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function downloadPlotPng(
  graphElement: HTMLElement | null,
  filename: string,
  title: string,
  yAxisTitle?: string,
) {
  const svg = graphElement?.querySelector('svg.main-svg')
  if (!(svg instanceof SVGSVGElement)) return

  const rect = svg.getBoundingClientRect()
  const width = Math.max(Math.round(rect.width), 1)
  const height = Math.max(Math.round(rect.height), 1)
  const clonedSvg = svg.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clonedSvg.setAttribute('width', String(width))
  clonedSvg.setAttribute('height', String(height))

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clonedSvg)], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const svgUrl = URL.createObjectURL(svgBlob)
  const image = new Image()

  image.onload = () => {
    const scale = 2
    const titleHeight = 64
    const axisTitleWidth = yAxisTitle ? 48 : 0
    const isDark = document.documentElement.classList.contains('dark')
    const canvas = document.createElement('canvas')
    canvas.width = (width + axisTitleWidth) * scale
    canvas.height = (height + titleHeight) * scale

    const context = canvas.getContext('2d')
    if (!context) {
      URL.revokeObjectURL(svgUrl)
      return
    }

    context.scale(scale, scale)
    context.fillStyle = isDark ? '#030712' : '#ffffff'
    context.fillRect(0, 0, width + axisTitleWidth, height + titleHeight)
    context.fillStyle = isDark ? '#f9fafb' : '#111827'
    context.font = '600 18px Inter, system-ui, sans-serif'
    context.textBaseline = 'middle'
    context.fillText(title, axisTitleWidth + 24, titleHeight / 2)

    if (yAxisTitle) {
      context.save()
      context.translate(20, titleHeight + height / 2)
      context.rotate(-Math.PI / 2)
      context.font = '600 14px Inter, system-ui, sans-serif'
      context.textAlign = 'center'
      context.fillText(yAxisTitle, 0, 0)
      context.restore()
    }

    context.drawImage(image, axisTitleWidth, titleHeight, width, height)
    URL.revokeObjectURL(svgUrl)

    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return

      const pngUrl = URL.createObjectURL(pngBlob)
      triggerDownload(pngUrl, filename)
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }

  image.onerror = () => {
    URL.revokeObjectURL(svgUrl)
  }

  image.src = svgUrl
}

// Long actor/location names are shortened on the axis, while full labels remain available in hover text.
function shortLabel(value: unknown, maxLength = 34) {
  const label = formatValue(value)
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label
}

// Weekly signal labels arrive as "YYYY-WNN"; this keeps x-axis labels compact in chat-sized charts.
function formatPeriodLabel(value: unknown) {
  const label = formatValue(value)
  const weeklyMatch = label.match(/^(\d{4})-W(\d{2})$/)
  if (weeklyMatch) {
    return `W${Number(weeklyMatch[2])} '${weeklyMatch[1].slice(2)}`
  }
  return label
}

// Network graph data is shaped differently from the list-based signal responses.
function isGraphData(data: unknown): data is { edges: Record<string, unknown>[] } {
  return Boolean(
    data &&
      typeof data === 'object' &&
      'edges' in data &&
      Array.isArray((data as { edges?: unknown }).edges),
  )
}

function EmptyState() {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400 dark:bg-gray-950 dark:text-gray-500">
      No data returned for this query.
    </div>
  )
}

function StreamingPlaceholder() {
  return (
    <div className="flex h-[360px] flex-col justify-end gap-3 rounded-lg bg-white/60 px-6 py-8 dark:bg-gray-950/70">
      <div className="h-4 w-2/3 animate-pulse rounded-full bg-brand-100 dark:bg-brand-900/50" />
      <div className="h-4 w-5/6 animate-pulse rounded-full bg-brand-100 [animation-delay:120ms] dark:bg-brand-900/50" />
      <div className="h-4 w-1/2 animate-pulse rounded-full bg-brand-100 [animation-delay:240ms] dark:bg-brand-900/50" />
      <div className="h-4 w-3/4 animate-pulse rounded-full bg-brand-100 [animation-delay:360ms] dark:bg-brand-900/50" />
    </div>
  )
}

function ResultTable({ rows, fileName }: { rows: Record<string, unknown>[]; fileName: string }) {
  if (rows.length === 0) return <EmptyState />

  // Limit visible columns and rows so raw event tables do not overwhelm the chat message.
  const columns = Object.keys(rows[0]).slice(0, 8)

  return (
    <>
      <div className="max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full divide-y divide-gray-200 text-left text-xs dark:divide-gray-800">
          <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white text-gray-700 dark:divide-gray-800 dark:bg-gray-900 dark:text-gray-300">
            {rows.slice(0, 20).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} className="max-w-[220px] truncate px-3 py-2">
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <DownloadButton label="Download JSON" onClick={() => downloadJson(fileName, rows)} />
      </div>
    </>
  )
}

function LineChart({
  rows,
  yKey,
  yLabel,
  fileName,
  title,
}: {
  rows: Record<string, unknown>[]
  yKey: string
  yLabel: string
  fileName: string
  title: string
}) {
  const plotRef = useRef<HTMLElement | null>(null)

  if (rows.length === 0) return <EmptyState />

  const plotTheme = getPlotTheme()
  const showMarkers = rows.length <= 26
  const downloadChart = () => {
    downloadPlotPng(plotRef.current, fileName, title, yLabel)
  }

  return (
    <>
      <div className="query-plot-frame h-[360px]">
        <Plot
          data={[
            {
              x: rows.map((row) => formatPeriodLabel(row.period)),
              y: rows.map((row) => Number(row[yKey] ?? 0)),
              type: 'scatter',
              mode: showMarkers ? 'lines+markers' : 'lines',
              line: { color: '#4c6ef5', width: 2.5 },
              marker: { color: '#4c6ef5', size: 5 },
              fill: 'tozeroy',
              fillcolor: plotTheme.fillColor,
              hovertemplate: `%{x}<br>${yLabel}: %{y}<extra></extra>`,
            },
          ]}
          layout={{
            autosize: true,
            margin: { t: 12, r: 24, b: 56, l: 96 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Inter, system-ui, sans-serif', size: 13, color: plotTheme.labelColor },
            xaxis: {
              automargin: true,
              nticks: 7,
              showgrid: false,
              tickangle: 0,
              tickfont: { size: 12, color: plotTheme.axisColor },
              zeroline: false,
            },
            yaxis: {
              automargin: true,
              showgrid: true,
              gridcolor: plotTheme.gridColor,
              zeroline: false,
              tickfont: { size: 12, color: plotTheme.axisColor },
              title: { text: yLabel, font: { size: 12, color: plotTheme.axisColor }, standoff: 12 },
            },
            showlegend: false,
            hovermode: 'x unified',
          }}
          config={{ responsive: true, displayModeBar: false }}
          onInitialized={(_, graphDiv) => {
            plotRef.current = graphDiv
          }}
          onUpdate={(_, graphDiv) => {
            plotRef.current = graphDiv
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <DownloadButton label="Download PNG" onClick={downloadChart} />
      </div>
    </>
  )
}

function BarChart({
  rows,
  labelKey,
  valueKey,
  fileName,
  title,
}: {
  rows: Record<string, unknown>[]
  labelKey: string
  valueKey: string
  fileName: string
  title: string
}) {
  const plotRef = useRef<HTMLElement | null>(null)

  if (rows.length === 0) return <EmptyState />

  const plotTheme = getPlotTheme()
  const fullLabels = rows.map((row) => formatValue(row[labelKey]))
  const downloadChart = () => {
    downloadPlotPng(plotRef.current, fileName, title)
  }

  return (
    <>
      <div className="query-plot-frame h-[360px]">
        <Plot
          data={[
            {
              x: rows.map((row) => Number(row[valueKey] ?? 0)),
              y: fullLabels.map((label) => shortLabel(label)),
              type: 'bar',
              orientation: 'h',
              marker: { color: '#4c6ef5' },
              text: rows.map((row) => formatValue(row[valueKey])),
              textposition: 'outside',
              textfont: { size: 12, color: plotTheme.labelColor },
              customdata: fullLabels,
              hovertemplate: '<b>%{customdata}</b><br>Count: %{x}<extra></extra>',
            },
          ]}
          layout={{
            autosize: true,
            margin: { t: 12, r: 72, b: 48, l: 220 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Inter, system-ui, sans-serif', size: 13, color: plotTheme.labelColor },
            xaxis: {
              showgrid: true,
              gridcolor: plotTheme.gridColor,
              zeroline: false,
              tickfont: { size: 12, color: plotTheme.axisColor },
            },
            yaxis: {
              automargin: true,
              showgrid: false,
              tickfont: { size: 12, color: plotTheme.labelColor },
              zeroline: false,
            },
            showlegend: false,
          }}
          config={{ responsive: true, displayModeBar: false }}
          onInitialized={(_, graphDiv) => {
            plotRef.current = graphDiv
          }}
          onUpdate={(_, graphDiv) => {
            plotRef.current = graphDiv
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <DownloadButton label="Download PNG" onClick={downloadChart} />
      </div>
    </>
  )
}

function EventTypeChart({
  rows,
  fileName,
  title,
}: {
  rows: Record<string, unknown>[]
  fileName: string
  title: string
}) {
  // Prefer backend CAMEO descriptions when present, but fall back to root codes for older signal builds.
  const labelledRows = rows.map((row) => ({
    ...row,
    label: row.cameo_description
      ? `${formatValue(row.cameo_root)} - ${formatValue(row.cameo_description)}`
      : formatValue(row.cameo_root),
  }))

  return <BarChart rows={labelledRows} labelKey="label" valueKey="event_count" fileName={fileName} title={title} />
}

export default function QueryResultChart({ intent, data }: QueryResultChartProps) {
  const rows = useMemo(() => (isGraphData(data) ? data.edges : asRecords(data)), [data])
  const preparedRows = useMemo(
    () => prepareRowsForSignal(intent.signal, rows),
    [intent.signal, rows],
  )
  const { rows: streamedRows, isStreaming } = useProgressiveRows(preparedRows)
  const pngFileName = filenameFor(intent.signal, 'png')
  const jsonFileName = filenameFor(intent.signal, 'json')
  const chartTitle = signalTitles[intent.signal]

  // The LLM chooses a signal; this component chooses the safest visual form for that signal's data shape.
  let content
  if (isStreaming && streamedRows.length === 0) {
    content = <StreamingPlaceholder />
  } else if (intent.signal === 'event_volume') {
    content = <LineChart rows={streamedRows} yKey="event_count" yLabel="Events" fileName={pngFileName} title={chartTitle} />
  } else if (intent.signal === 'tone_over_time') {
    content = <LineChart rows={streamedRows} yKey="avg_goldstein" yLabel="Avg Goldstein" fileName={pngFileName} title={chartTitle} />
  } else if (intent.signal === 'media_attention') {
    content = <LineChart rows={streamedRows} yKey="total_mentions" yLabel="Mentions" fileName={pngFileName} title={chartTitle} />
  } else if (intent.signal === 'actor_frequency') {
    content = <BarChart rows={streamedRows} labelKey="actor" valueKey="event_count" fileName={pngFileName} title={chartTitle} />
  } else if (intent.signal === 'location_frequency') {
    content = <BarChart rows={streamedRows} labelKey="location" valueKey="event_count" fileName={pngFileName} title={chartTitle} />
  } else if (intent.signal === 'event_type') {
    content = <EventTypeChart rows={streamedRows} fileName={pngFileName} title={chartTitle} />
  } else if (intent.signal === 'actor_location_graph' && isGraphData(data)) {
    content = <ResultTable rows={streamedRows} fileName={jsonFileName} />
  } else {
    content = <ResultTable rows={streamedRows} fileName={jsonFileName} />
  }

  return (
    <div className="query-result-panel mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-6 dark:border-gray-800 dark:bg-gray-950/70">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{chartTitle}</h3>
        </div>
        {isStreaming && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-900/30 dark:text-brand-200">
            Streaming chart...
          </span>
        )}
      </div>
      {content}
    </div>
  )
}
