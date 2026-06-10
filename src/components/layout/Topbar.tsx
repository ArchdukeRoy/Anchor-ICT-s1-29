import { Sparkles } from 'lucide-react'
import { getLlmModelLabel, getStoredLlmModel } from '@/lib/llmModels'

export default function Topbar() {
  const modelLabel = getLlmModelLabel(getStoredLlmModel())

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 transition-colors dark:border-gray-800 dark:bg-gray-950">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
        Anchor Analyst Workspace
      </p>
      <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800">
        <Sparkles className="h-4 w-4 text-brand-500" />
        {modelLabel}
      </div>
    </header>
  )
}
