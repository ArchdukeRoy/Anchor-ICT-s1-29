import { FormEvent, useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, Sparkles, User2 } from 'lucide-react'
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
}

const EVENT_NAME = 'sudan_2023'

const starterPrompts = [
  'Show weekly conflict event volume.',
  'Which actors were most active?',
  'Which locations saw the most conflict events?',
  'What event types are most common?',
  'Show media attention over time.',
  'Show average conflict tone over time.',
]

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

function MessageBubble({ message }: { message: ChatMessage }) {
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
          <QueryResultChart
            intent={message.result.intent}
            data={message.result.data}
            eventName={message.result.event_name}
            queryText={message.result.query}
          />
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
  const [llmModel] = useState<LlmModel>(getStoredLlmModel)
  const nextIdRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isThinking])

  const submitPrompt = async (promptText: string) => {
    const trimmed = promptText.trim()
    if (!trimmed || isThinking) return

    const userMessage: ChatMessage = {
      id: nextIdRef.current++,
      role: 'user',
      content: trimmed,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setIsThinking(true)

    try {
      const result = await submitQuery(trimmed, llmModel)
      const assistantMessage: ChatMessage = {
        id: nextIdRef.current++,
        role: 'assistant',
        content: '',
        result,
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
    setSelectedStarterPrompt(promptText)
    setInput(promptText)
    inputRef.current?.focus()
  }

  return (
    <div className="insights-workspace flex h-[calc(100vh-7.5rem)] min-h-[680px] flex-col overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f8fafc_42%,#eef2f7_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:bg-gray-950 dark:bg-none dark:shadow-none dark:ring-gray-800">
      <div className="insights-workspace-header border-b border-white/70 bg-white/65 px-8 py-5 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
              Anchor Analyst Workspace
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800">
            <Sparkles className="h-4 w-4 text-brand-500" />
            {getLlmModelLabel(llmModel)}
          </div>
        </div>
      </div>

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
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitPrompt(prompt)}
                  className="insights-prompt rounded-[24px] bg-white/90 px-5 py-4 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-800 dark:hover:bg-gray-800"
                >
                  {prompt}
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

      <div className="insights-composer-bar border-t border-white/70 bg-white/80 px-6 py-5 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/85 sm:px-8">
        <div className="mx-auto max-w-4xl">
          {messages.length > 0 && (
            <div className="mb-4 rounded-[24px] bg-white/90 px-4 py-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">
                    Next question
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Pick one of the frequentlty asked question.
                  </p>
                </div>

                <select
                  value={selectedStarterPrompt}
                  onChange={(event) => handleStarterPromptChange(event.target.value)}
                  disabled={isThinking}
                  className="min-w-[260px] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-brand-900 dark:disabled:bg-gray-800"
                >
                  <option value="">Choose a question</option>
                  {starterPrompts.map((prompt) => (
                    <option key={prompt} value={prompt}>
                      {prompt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

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