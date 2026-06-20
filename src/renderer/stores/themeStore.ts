"use client"

import { create } from 'zustand'
import { DEFAULT_THEME } from '../../shared/theme-types'
import type { ThemeConfig } from '../../shared/theme-types'

function getSystemDarkMode(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveMode(mode: ThemeConfig['mode']): 'light' | 'dark' {
  if (mode === 'system') return getSystemDarkMode() ? 'dark' : 'light'
  return mode
}

function applyTheme(mode: ThemeConfig['mode']) {
  const root = document.documentElement
  const effective = resolveMode(mode)
  root.classList.toggle('dark', effective === 'dark')
  localStorage.setItem('toolset-theme-mode', mode)
}

let systemListener: (() => void) | null = null

function setupSystemListener(onChange: () => void) {
  teardownSystemListener()
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange()
  mq.addEventListener('change', handler)
  systemListener = () => mq.removeEventListener('change', handler)
}

function teardownSystemListener() {
  systemListener?.()
  systemListener = null
}

interface ThemeState {
  config: ThemeConfig
  loaded: boolean
  effectiveMode: 'light' | 'dark'
  loadConfig: () => Promise<void>
  saveConfig: (config: ThemeConfig) => Promise<void>
  setMode: (mode: 'light' | 'dark' | 'system') => void
  resetDefaults: () => Promise<void>
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  config: { ...DEFAULT_THEME },
  loaded: false,
  effectiveMode: resolveMode(DEFAULT_THEME.mode),

  loadConfig: async () => {
    try {
      const config = await window.electronAPI.theme.loadConfig()
      const effectiveMode = resolveMode(config.mode)
      set({ config, loaded: true, effectiveMode })
      applyTheme(config.mode)
      if (config.mode === 'system') {
        setupSystemListener(() => get().saveConfig(get().config))
      }
    } catch {
      const saved = localStorage.getItem('toolset-theme-mode') as ThemeConfig['mode'] | null
      const mode: ThemeConfig['mode'] = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark'
      const config: ThemeConfig = { ...DEFAULT_THEME, mode }
      const effectiveMode = resolveMode(mode)
      set({ config, loaded: true, effectiveMode })
      applyTheme(mode)
      if (mode === 'system') {
        setupSystemListener(() => get().saveConfig(get().config))
      }
    }
  },

  saveConfig: async (config: ThemeConfig) => {
    const effectiveMode = resolveMode(config.mode)
    set({ config, effectiveMode })
    applyTheme(config.mode)

    // Manage system listener
    if (config.mode === 'system') {
      setupSystemListener(() => get().saveConfig(get().config))
    } else {
      teardownSystemListener()
    }

    try {
      await window.electronAPI.theme.saveConfig(config)
    } catch {
      // persist already done by applyTheme -> localStorage
    }
  },

  setMode: (mode) => {
    const { config, saveConfig } = get()
    saveConfig({ ...config, mode })
  },

  resetDefaults: async () => {
    const { saveConfig } = get()
    await saveConfig({ ...DEFAULT_THEME })
  },
}))

export { DEFAULT_THEME }

// 监听系统主题变化 — 当组件卸载时清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', teardownSystemListener)
}