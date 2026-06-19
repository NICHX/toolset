"use client"

import { create } from 'zustand'
import type { PluginManifest } from '../../shared/types'

interface PluginState {
  plugins: PluginManifest[]
  loading: boolean
  error: string | null
  loadPlugins: () => Promise<void>
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<void>
  installPlugin: (sourceDir?: string) => Promise<{ success: boolean; error?: string }>
  uninstallPlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  clearAllPlugins: () => Promise<{ success: boolean; error?: string }>
}

function loadRendererScript(jsPath: string, cssPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Load CSS
    const linkId = `plugin-css-${jsPath}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = cssPath
      document.head.appendChild(link)
    }

    // Load JS (IIFE)
    const scriptId = `plugin-js-${jsPath}`
    if (document.getElementById(scriptId)) {
      resolve() // Already loaded
      return
    }
    const script = document.createElement('script')
    script.id = scriptId
    script.src = jsPath
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load plugin script: ${jsPath}`))
    document.body.appendChild(script)
  })
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  loading: false,
  error: null,

  loadPlugins: async () => {
    set({ loading: true, error: null })
    try {
      const plugins = await window.electronAPI.plugin.getLoaded()
      set({ plugins, loading: false })

      // 应用已保存的启用状态
      try {
        const savedStates = await window.electronAPI.plugin.invoke('plugin:load-states') as Record<string, boolean>
        if (Object.keys(savedStates).length > 0) {
          set((state) => ({
            plugins: state.plugins.map((p) => {
              if (p.id in savedStates) {
                return { ...p, enabled: savedStates[p.id] }
              }
              return p
            }),
          }))
        }
      } catch (e) {
        console.warn('[PluginStore] Failed to load saved states:', e)
      }

      // Dynamically load renderer scripts
      try {
        const scripts = await window.electronAPI.plugin.getRendererScripts()
        await Promise.all(scripts.map((s) => loadRendererScript(s.jsPath, s.cssPath)))
      } catch (scriptErr) {
        console.warn('[PluginStore] Failed to load some renderer scripts:', scriptErr)
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  togglePlugin: async (pluginId, enabled) => {
    try {
      set((state) => {
        const newPlugins = state.plugins.map((p) =>
          p.id === pluginId ? { ...p, enabled } : p
        )
        // 持久化到磁盘
        const states: Record<string, boolean> = {}
        for (const p of newPlugins) {
          states[p.id] = p.enabled
        }
        window.electronAPI.plugin.invoke('plugin:save-states', states).catch((e) =>
          console.warn('[PluginStore] Failed to save states:', e)
        )
        return { plugins: newPlugins }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  installPlugin: async (_sourceDir?) => {
    try {
      const result = await window.electronAPI.plugin.invoke('plugin:install')
      if (result.success) {
        // 重新加载插件列表
        const plugins = await window.electronAPI.plugin.getLoaded()
        set({ plugins })
      }
      return result
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },

  uninstallPlugin: async (pluginId) => {
    try {
      const result = await window.electronAPI.plugin.invoke('plugin:uninstall', pluginId)
      if (result.success) {
        // 重新加载插件列表
        const plugins = await window.electronAPI.plugin.getLoaded()
        set({ plugins })
      }
      return result
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },

  clearAllPlugins: async () => {
    try {
      const result = await window.electronAPI.plugin.invoke('plugin:clear-all')
      if (result.success) {
        set({ plugins: [] })
      }
      return result
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },
}))