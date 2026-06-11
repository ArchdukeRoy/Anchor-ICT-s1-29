import { useEffect, useState } from 'react'
import { Check, Cpu, Moon, Sun } from 'lucide-react'
import {
  LLM_MODEL_STORAGE_KEY,
  LLM_MODELS,
  LlmModel,
  getStoredLlmModel,
} from '@/lib/llmModels'

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'anchor-theme'

function applyTheme(mode: ThemeMode) {
  // Tailwind dark mode is controlled by the root class, while colorScheme updates native controls.
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.style.colorScheme = mode
}

function getStoredTheme(): ThemeMode {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return storedTheme === 'dark' ? 'dark' : 'light'
}

export default function SettingsPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme)
  const [llmModel, setLlmModel] = useState<LlmModel>(getStoredLlmModel)

  useEffect(() => {
    // Theme is applied globally because layout components live outside the settings page.
    applyTheme(themeMode)
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    window.localStorage.setItem(LLM_MODEL_STORAGE_KEY, llmModel)
    window.dispatchEvent(new CustomEvent('llm-model-changed', { detail: llmModel }))
  }, [llmModel])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Adjust the dashboard appearance.
        </p>
      </div>

      <section className="card space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose a background mode for the dashboard.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setThemeMode('light')}
            className={`flex items-center justify-between rounded-lg border px-4 py-4 text-left transition ${
              themeMode === 'light'
                ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-100 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-100 dark:ring-brand-900'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            <span>
              <span className="block text-sm font-semibold">Light</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Bright dashboard background
              </span>
            </span>
            <Sun className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setThemeMode('dark')}
            className={`flex items-center justify-between rounded-lg border px-4 py-4 text-left transition ${
              themeMode === 'dark'
                ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-100 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-100 dark:ring-brand-900'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            <span>
              <span className="block text-sm font-semibold">Dark</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Low-light dashboard background
              </span>
            </span>
            <Moon className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section className="card space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Local AI Model</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {LLM_MODELS.map((model) => {
            const isSelected = llmModel === model.value

            return (
              <button
                key={model.value}
                type="button"
                onClick={() => setLlmModel(model.value)}
                className={`flex min-h-[116px] items-start justify-between rounded-lg border px-4 py-4 text-left transition ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-100 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-100 dark:ring-brand-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                <span className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    <Cpu className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{model.label}</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {model.value}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                      {model.description}
                    </span>
                  </span>
                </span>

                {isSelected && <Check className="h-5 w-5 flex-shrink-0 text-brand-600 dark:text-brand-300" />}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
