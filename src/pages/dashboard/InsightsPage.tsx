import { FormEvent, useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, ChevronDown, ChevronRight, User2 } from 'lucide-react'
import QueryResultChart from '@/components/charts/QueryResultChart'
import { LlmModel, getLlmModelLabel, getStoredLlmModel } from '@/lib/llmModels'

type MessageRole = 'assistant' | 'user'

interface QueryIntent {
  chart_type: string
  signal:
    | 'event_volume'
    | 'event_type'
    | 'actor_frequency'
    | 'location_frequency'
    | 'tone_over_time'
    | 'media_attention'
    | 'actor_location_graph'
    | 'recent_events'
  params: Record<string, unknown>
}

interface QueryResponse {
  query: string
  event_name: string
  model: string
  intent: QueryIntent
  data: unknown
}

interface ChatMessage {
  id: number
  role: MessageRole
  content: string
  result?: QueryResponse
  responseTimeMs?: number
}

const EVENT_NAME = 'sudan_2023'

const starterPrompts = [
  { prompt: 'Show weekly conflict event volume.',                          chartType: 'Line chart'           },
  { prompt: 'Which actors were most active?',                              chartType: 'Bar chart'            },
  { prompt: 'Show media attention over time.',                             chartType: 'Line chart'           },
  { prompt: 'Show average conflict tone over time.',                       chartType: 'Annotated line chart' },
  { prompt: 'Which actors are most active and widespread? Show as scatter',chartType: 'Scatter plot'         },
  { prompt: 'Show actor location connections.',                            chartType: 'Filterable table'     },
]

// Centralizes the /query call so the page can treat successful responses and API errors uniformly.
async function submitQuery(promptText: string, model: LlmModel): Promise<QueryResponse> {
  const response = await fetch('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: promptText,
      event_name: EVENT_NAME,
      model,
    }),
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    const text = await response.text()

    if (text) {
      try {
        const errorBody = JSON.parse(text) as { detail?: string }
        detail = errorBody.detail || text
      } catch {
        detail = text
      }
    }

    throw new Error(detail)
  }

  return response.json() as Promise<QueryResponse>
}

// Detects questions about overall conflict trend/phase so they can bypass the LLM
// and go straight to SummaryTimeline, which fetches its own data client-side.
const SUMMARY_KEYWORDS = ['better or worse', 'getting better', 'getting worse', 'what phase', 'conflict phase', 'overall trend', 'is the conflict', 'summary']
function isSummaryQuery(text: string): boolean {
  const lower = text.toLowerCase()
  return SUMMARY_KEYWORDS.some((kw) => lower.includes(kw))
}

// Static map of signal → SQL shown in the chart metadata strip.
// All backend queries are pre-written (no dynamic SQL generation), so this can be
// kept in sync with backend/db/db.py without any runtime cost.
const signalSQL: Record<string, string> = {
  event_volume: `SELECT period, event_count
FROM signals_event_volume
WHERE event_config = ? AND period_type = ?
ORDER BY period ASC`,
  event_type: `SELECT cameo_root, cameo_description, event_count
FROM signals_event_type
WHERE event_config = ?
ORDER BY event_count DESC`,
  actor_frequency: `SELECT actor, event_count
FROM signals_actor_frequency
WHERE event_config = ?
ORDER BY event_count DESC
LIMIT ?`,
  location_frequency: `SELECT location, country, event_count
FROM signals_location_frequency
WHERE event_config = ?
ORDER BY event_count DESC
LIMIT ?`,
  tone_over_time: `SELECT period, avg_goldstein
FROM signals_tone_over_time
WHERE event_config = ? AND period_type = ?
ORDER BY period ASC`,
  media_attention: `SELECT DATE(event_date) AS period,
       SUM(num_mentions) AS total_mentions
FROM events
WHERE num_mentions IS NOT NULL
GROUP BY period
ORDER BY period ASC`,
  actor_location_graph: `SELECT actor, location, edge_weight
FROM signals_actor_location_graph
WHERE event_config = ? AND edge_weight >= ?
ORDER BY edge_weight DESC`,
  recent_events: `SELECT event_id, event_date, cameo_code,
       actor1, actor2, country, location,
       goldstein_scale, num_mentions, source_url
FROM events
ORDER BY event_date DESC
LIMIT ?`,
}

// Maps each signal to the ordered list of params passed to its SQL query (matching db.py).
const signalParamOrder: Record<string, string[]> = {
  event_volume:        ['event_config', 'period_type'],
  event_type:          ['event_config'],
  actor_frequency:     ['event_config', 'limit'],
  location_frequency:  ['event_config', 'limit'],
  tone_over_time:      ['event_config', 'period_type'],
  media_attention:     [],
  actor_location_graph:['event_config', 'min_edge_weight'],
  recent_events:       ['limit'],
}

// Per-signal fallback values matching backend API defaults (backend/api/main.py Query defaults).
const signalParamDefaults: Record<string, Record<string, string | number>> = {
  event_volume:         { period_type: 'daily' },
  tone_over_time:       { period_type: 'weekly' },
  media_attention:      { period_type: 'daily' },
  actor_frequency:      { limit: 10 },
  location_frequency:   { limit: 10 },
  recent_events:        { limit: 20 },
  actor_location_graph: { min_edge_weight: 1 },
}

// Replaces each ? in the SQL template with its actual runtime value.
// Falls back to the backend default if the param wasn't set by the LLM.
// String values are wrapped in single quotes; numbers are bare.
function fillSQL(signal: string, sql: string, eventName: string, params: Record<string, unknown>): string {
  const order = signalParamOrder[signal] ?? []
  const defaults = signalParamDefaults[signal] ?? {}
  const values = order.map((key) => {
    if (key === 'event_config') return `'${eventName}'`
    const v = params[key] ?? defaults[key]
    return typeof v === 'string' ? `'${v}'` : String(v)
  })
  let filled = sql
  for (const val of values) {
    filled = filled.replace('?', val)
  }
  return filled
}

function MessageBubble({ message }: { message: ChatMessage }) {
  // Tracks whether the SQL code block is expanded for this specific message bubble.
  const [showSQL, setShowSQL] = useState(false)
  const isAssistant = message.role === 'assistant'
  const hasChart = isAssistant && Boolean(message.result)
  return (
    <div className={`flex gap-4 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      {isAssistant && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
          <Bot className="h-5 w-5" />
        </div>
      )}

      <div
        className={`rounded-[28px] px-5 py-4 text-sm leading-7 shadow-sm ${
          isAssistant
            ? 'bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-800'
            : 'bg-gray-900 text-white dark:bg-brand-600'
        } ${hasChart ? 'w-full max-w-5xl' : 'max-w-3xl'}`}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          {isAssistant ? 'Anchor AI' : 'You'}
        </p>
        {message.content && <div className="whitespace-pre-wrap">{message.content}</div>}

        {isAssistant && message.result && (
          <>
            <QueryResultChart
              intent={message.result.intent}
              data={message.result.data}
              eventName={message.result.event_name}
              queryText={message.result.query}
            />
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                <span>signal: <span className="font-semibold text-gray-500 dark:text-gray-400">{message.result.intent.signal}</span></span>
                <span>chart: <span className="font-semibold text-gray-500 dark:text-gray-400">{message.result.intent.chart_type}</span></span>
                <span>model: <span className="font-semibold text-gray-500 dark:text-gray-400">{message.result.model}</span></span>
                {message.responseTimeMs !== undefined && (
                  <span>response time: <span className="font-semibold text-gray-500 dark:text-gray-400">{message.responseTimeMs < 1000 ? `${message.responseTimeMs}ms` : `${(message.responseTimeMs / 1000).toFixed(1)}s`}</span></span>
                )}
                {signalSQL[message.result.intent.signal] && message.result.intent.chart_type !== 'summary' && (
                  <button
                    type="button"
                    onClick={() => setShowSQL((v) => !v)}
                    className="inline-flex items-center gap-0.5 font-semibold text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    {showSQL ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    SQL
                  </button>
                )}
              </div>
              {showSQL && signalSQL[message.result.intent.signal] && (
                <pre className="overflow-x-auto rounded-lg bg-gray-950 px-4 py-3 text-[11px] leading-5 text-green-400 dark:bg-black">
                  {fillSQL(
                    message.result.intent.signal,
                    signalSQL[message.result.intent.signal],
                    message.result.event_name,
                    message.result.intent.params,
                  )}
                </pre>
              )}
            </div>
          </>
        )}
      </div>

      {!isAssistant && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-200 text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
          <User2 className="h-5 w-5" />
        </div>
      )}
    </div>
  )
}

function LoadingBubble() {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
        <Bot className="h-5 w-5" />
      </div>
      <div className="rounded-[28px] bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          Anchor AI
        </p>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-300" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-400 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-500 [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  )
}

export default function InsightsPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [selectedStarterPrompt, setSelectedStarterPrompt] = useState('')
  const [showNextQuestion, setShowNextQuestion] = useState(false)
  const [llmModel] = useState<LlmModel>(getStoredLlmModel)
  const nextIdRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    // Keep the newest user question, loading bubble, or chart visible as the conversation grows.
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isThinking])

  const submitPrompt = async (promptText: string) => {
    const trimmed = promptText.trim()
    if (!trimmed || isThinking) return

    // Add the user's message immediately, then append the assistant message after the API returns.
    const userMessage: ChatMessage = {
      id: nextIdRef.current++,
      role: 'user',
      content: trimmed,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setIsThinking(true)

    try {
      // Summary queries bypass the LLM entirely — SummaryTimeline fetches all signals itself.
      if (isSummaryQuery(trimmed)) {
        const assistantMessage: ChatMessage = {
          id: nextIdRef.current++,
          role: 'assistant',
          content: '',
          result: {
            query: trimmed,
            event_name: EVENT_NAME,
            model: 'client-side',
            intent: { chart_type: 'summary', signal: 'event_volume', params: {} },
            data: [],
          },
        }
        setMessages((current) => [...current, assistantMessage])
        return
      }

      // Measure full round-trip time: LLM intent resolution + signal DB query.
      const t0 = performance.now()
      const result = await submitQuery(trimmed, llmModel)
      const responseTimeMs = Math.round(performance.now() - t0)
      const assistantMessage: ChatMessage = {
        id: nextIdRef.current++,
        role: 'assistant',
        content: '',
        result,
        responseTimeMs,
      }
      setMessages((current) => [...current, assistantMessage])
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: nextIdRef.current++,
        role: 'assistant',
        content:
          error instanceof Error
            ? `I could not generate a chart from the local model yet.\n\n${error.message}`
            : 'I could not generate a chart from the local model yet.',
      }
      setMessages((current) => [...current, assistantMessage])
    } finally {
      setIsThinking(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitPrompt(input)
  }

  const handleStarterPromptChange = (promptText: string) => {
    // Selecting a starter prompt fills the composer without submitting, so users can edit it first.
    setSelectedStarterPrompt(promptText)
    setInput(promptText)
    inputRef.current?.focus()
  }

  return (
    <div className="insights-workspace flex h-[calc(100vh-7.5rem)] min-h-[680px] flex-col overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f8fafc_42%,#eef2f7_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:bg-gray-950 dark:bg-none dark:shadow-none dark:ring-gray-800">

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-brand-600 text-white shadow-[0_20px_45px_rgba(92,124,250,0.28)]">
              <Bot className="h-10 w-10" />
            </div>

            <h2 className="insights-title mt-8 text-4xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Ask Anchor AI for a chart
            </h2>
            <p className="insights-empty-copy mt-4 max-w-2xl text-base leading-8 text-gray-500 dark:text-gray-400">
              Choose a common question or ask about conflict activity, actors, locations, event types, tone, or media attention.
            </p>

            <div className="mt-10 grid w-full gap-3 text-left sm:grid-cols-2">
              {starterPrompts.map(({ prompt, chartType }) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitPrompt(prompt)}
                  className="insights-prompt flex flex-col gap-1 rounded-[24px] bg-white/90 px-5 py-4 text-left shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:bg-gray-900 dark:ring-gray-800 dark:hover:bg-gray-800"
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-100">{prompt}</span>
                  <span className="text-[11px] font-semibold text-brand-500 dark:text-brand-400">{chartType}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isThinking && <LoadingBubble />}
          </div>
        )}
      </div>

      {/* Next question popup */}
      {showNextQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 pb-32 backdrop-blur-sm sm:items-center sm:pb-0"
          onClick={() => setShowNextQuestion(false)}
        >
          <div
            className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Next question</p>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Pick a common question to ask.</p>
            <div className="space-y-2">
              {starterPrompts.map(({ prompt, chartType }) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isThinking}
                  onClick={() => {
                    handleStarterPromptChange(prompt)
                    setShowNextQuestion(false)
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-100">{prompt}</span>
                  <span className="text-[11px] font-semibold text-brand-500 dark:text-brand-400">{chartType}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="insights-composer-bar border-t border-white/70 bg-white/80 px-6 py-5 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/85 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <form
            onSubmit={handleSubmit}
            className="insights-input-shell rounded-[30px] bg-white p-3 shadow-[0_18px_35px_rgba(15,23,42,0.07)] ring-1 ring-gray-200 dark:bg-gray-900 dark:shadow-none dark:ring-gray-800"
          >
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                placeholder="Ask for a chart..."
                className="max-h-40 min-h-[52px] flex-1 resize-none border-0 bg-transparent px-3 py-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
              />

              {messages.length > 0 && (
                <button
                  type="button"
                  disabled={isThinking}
                  onClick={() => setShowNextQuestion(true)}
                  className="flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-xs font-semibold text-brand-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-brand-400 dark:hover:bg-gray-700"
                >
                  Next question
                </button>
              )}

              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-brand-600 dark:hover:bg-brand-500 dark:disabled:bg-gray-700"
                aria-label="Send query"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
