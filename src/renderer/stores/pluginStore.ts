"use client"

import { create } from 'zustand'
import type { PluginManifest, PluginUpdateInfo } from '../../shared/types'

interface PluginState {
  plugins: PluginManifest[]
  loading: boolean
  error: string | null
  loadPlugins: () => Promise<void>
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<void>
  /** 安装插件 — 自动识别文件（ZIP）或目录 */
  installPlugin: () => Promise<{ success: boolean; error?: string }>
  uninstallPlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  clearAllPlugins: () => Promise<{ success: boolean; error?: string }>
  /** 检查插件更新（通过选择更新包文件） */
  checkPluginUpdate: () => Promise<{ success: boolean; error?: string; updateInfo?: PluginUpdateInfo; packagePath?: string }>
  /** 执行插件更新 */
  updatePlugin: (pluginId: string, packagePath: string) => Promise<{ success: boolean; error?: string }>
  /** 重载所有插件（无需重启） */
  reloadAllPlugins: () => Promise<{ success: boolean; error?: string }>
}

function loadRendererScript(jsPath: string, _cssPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 从路径中提取插件 ID 作为稳定的元素标识
    const pluginId = jsPath.match(/plugin:\/\/([^/]+)/)?.[1] || jsPath
    const scriptId = `plugin-js-${pluginId}`

    // 移除旧 JS 脚本标签
    const oldScript = document.getElementById(scriptId)
    if (oldScript) oldScript.remove()

    // 添加时间戳参数绕过浏览器/协议缓存（覆盖安装后才能看到新内容）
    const url = new URL(jsPath)
    url.searchParams.set('v', Date.now().toString())

    // Load JS (IIFE)
    const script = document.createElement('script')
    script.id = scriptId
    script.src = url.toString()
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load plugin script: ${jsPath}`))
    document.body.appendChild(script)

    // 注意：插件 CSS 不在此处全局注入，而是由 PluginShell 通过 Shadow DOM 加载，
    // 避免插件样式泄漏到平台。如需全局 CSS（如插件后台脚本），请通过权限系统申请。
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

      // Dynamically load renderer scripts（独立加载，每个脚本的错误不影响其他）
      try {
        const scripts = await window.electronAPI.plugin.getRendererScripts()
        for (const s of scripts) {
          try {
            await loadRendererScript(s.jsPath, s.cssPath)
          } catch (scriptErr) {
            console.warn(`[PluginStore] Failed to load renderer script for plugin ${s.id}:`, scriptErr)
          }
        }
      } catch (scriptErr) {
        console.warn('[PluginStore] Failed to get renderer scripts:', scriptErr)
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

  installPlugin: async () => {
    try {
      const result = await window.electronAPI.plugin.invoke('plugin:install-unified')
      if (result.success) {
        // 重新加载插件列表
        const plugins = await window.electronAPI.plugin.getLoaded()
        set({ plugins })
        // 独立加载 renderer scripts，每个脚本的错误不影响其他
        try {
          const scripts = await window.electronAPI.plugin.getRendererScripts()
          for (const s of scripts) {
            try {
              await loadRendererScript(s.jsPath, s.cssPath)
            } catch (scriptErr) {
              console.warn(`[PluginStore] Failed to load renderer script for plugin ${s.id} after install:`, scriptErr)
            }
          }
        } catch (scriptErr) {
          console.warn('[PluginStore] Failed to get renderer scripts after install:', scriptErr)
        }
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
        // 清理 DOM 中该插件的 JS 标签（使用与 loadRendererScript 一致的 ID 格式）
        const scriptId = `plugin-js-${pluginId}`
        document.getElementById(scriptId)?.remove()

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

  checkPluginUpdate: async () => {
    try {
      const result = await window.electronAPI.plugin.update.checkUpdate()
      return result
    } catch (err) {
      return { success: false, error: (err as Error).message, updateInfo: undefined }
    }
  },

  updatePlugin: async (pluginId, packagePath) => {
    try {
      const result = await window.electronAPI.plugin.update.applyUpdate(pluginId, packagePath)
      if (result.success) {
        // 重新加载插件列表
        const plugins = await window.electronAPI.plugin.getLoaded()
        set({ plugins })
        // 重新加载所有 renderer scripts，确保覆盖安装后新版本脚本生效
        try {
          const scripts = await window.electronAPI.plugin.getRendererScripts()
          for (const s of scripts) {
            try {
              await loadRendererScript(s.jsPath, s.cssPath)
            } catch (scriptErr) {
              console.warn(`[PluginStore] Failed to load renderer script for plugin ${s.id} after update:`, scriptErr)
            }
          }
        } catch (scriptErr) {
          console.warn('[PluginStore] Failed to get renderer scripts after update:', scriptErr)
        }
      }
      return result
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },

  reloadAllPlugins: async () => {
    try {
      const result = await window.electronAPI.plugin.invoke('plugin:reload-all')
      if (result.success) {
        // 重新加载插件列表
        const plugins = await window.electronAPI.plugin.getLoaded()
        set({ plugins })

        // 清除旧插件脚本并重新加载所有 renderer scripts
        // 先移除所有 plugin-js- 前缀的 script 标签
        document.querySelectorAll('script[id^="plugin-js-"]').forEach((s) => s.remove())

        try {
          const scripts = await window.electronAPI.plugin.getRendererScripts()
          for (const s of scripts) {
            try {
              await loadRendererScript(s.jsPath, s.cssPath)
            } catch (scriptErr) {
              console.warn(`[PluginStore] Failed to load renderer script for plugin ${s.id} after reload:`, scriptErr)
            }
          }
        } catch (scriptErr) {
          console.warn('[PluginStore] Failed to get renderer scripts after reload:', scriptErr)
        }
      }
      return result
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },
}))