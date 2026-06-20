import { contextBridge, ipcRenderer } from 'electron'
import { PLUGIN_IPC_CHANNELS } from '../main/plugin-api'

interface ThemeConfig {
  mode: 'light' | 'dark' | 'system'
}

/**
 * 重试 IPC invoke，用于处理 dev 模式下主进程 handler 尚未就绪的情况
 */
async function retryInvoke(channel: string, maxRetries: number, delayMs: number): Promise<unknown> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ipcRenderer.invoke(channel)
    } catch (err) {
      if (i === maxRetries - 1) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

const api = {
  app: {
    getVersion: () =>
      ipcRenderer.invoke('app:get-version') as Promise<string>,
    minimize: () =>
      ipcRenderer.invoke('app:minimize'),
    maximize: () =>
      ipcRenderer.invoke('app:maximize'),
    isMaximized: () =>
      ipcRenderer.invoke('app:is-maximized') as Promise<boolean>,
    close: () =>
      ipcRenderer.invoke('app:close'),
    onMaximizedChanged: (callback: (maximized: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximized-changed', handler)
      return () => { ipcRenderer.removeListener('window:maximized-changed', handler) }
    },
    platform: process.platform,
    isMainWindow: window.location.search === '',
  },
  plugin: {
    getLoaded: () => {
      // 重试机制：dev 模式下主进程 handler 可能尚未就绪
      return retryInvoke('plugin:get-loaded', 5, 200) as Promise<any[]>
    },
    onPluginsLoaded: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('plugins:loaded', handler)
      return () => { ipcRenderer.removeListener('plugins:loaded', handler) }
    },
    // Generic IPC invoke for plugins
    invoke: (channel: string, ...args: any[]) =>
      ipcRenderer.invoke(channel, ...args) as Promise<any>,
    // Listen for IPC events
    on: (channel: string, callback: (...args: any[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => { ipcRenderer.removeListener(channel, handler) }
    },
    // Get renderer script paths for dynamic loading
    getRendererScripts: () =>
      ipcRenderer.invoke('plugin:get-renderer-scripts') as Promise<{ id: string; jsPath: string; cssPath: string }[]>,

    // ========== 插件配置 API ==========
    config: {
      get: (pluginId: string, key: string, defaultValue?: any) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.CONFIG_GET, pluginId, key, defaultValue) as Promise<any>,
      set: (pluginId: string, key: string, value: any) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.CONFIG_SET, pluginId, key, value) as Promise<void>,
      getAll: (pluginId: string) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.CONFIG_GET_ALL, pluginId) as Promise<Record<string, any>>,
      update: (pluginId: string, partial: Record<string, any>) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.CONFIG_UPDATE, pluginId, partial) as Promise<void>,
      reset: (pluginId: string, key?: string) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.CONFIG_RESET, pluginId, key) as Promise<void>,
    },

    // ========== 插件事件总线 API ==========
    events: {
      emit: (eventName: string, data?: any) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.EVENTS_EMIT, eventName, data) as Promise<void>,
      on: (eventName: string, callback: (data: any) => void) => {
        // 通过通用 plugin:event 通道转发事件到渲染进程
        const handler = (_event: Electron.IpcRendererEvent, name: string, data: any) => {
          if (name === eventName) callback(data)
        }
        ipcRenderer.on('plugin:event', handler)
        return () => { ipcRenderer.removeListener('plugin:event', handler) }
      },
      once: (eventName: string, callback: (data: any) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, name: string, data: any) => {
          if (name === eventName) {
            callback(data)
            ipcRenderer.removeListener('plugin:event', handler)
          }
        }
        ipcRenderer.on('plugin:event', handler)
      },
    },

    // ========== 插件元信息 API ==========
    meta: {
      getPlugin: (pluginId: string) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.META_GET_PLUGIN, pluginId) as Promise<any>,
      getAllPlugins: () =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.META_GET_ALL) as Promise<any[]>,
      isEnabled: (pluginId: string) =>
        ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.META_IS_ENABLED, pluginId) as Promise<boolean>,
    },

    // ========== 插件更新 API ==========
    update: {
      checkUpdate: () =>
        ipcRenderer.invoke('plugin:check-update') as Promise<{ success: boolean; error?: string; updateInfo?: any; packagePath?: string }>,
      applyUpdate: (pluginId: string, packagePath: string) =>
        ipcRenderer.invoke('plugin:apply-update', pluginId, packagePath) as Promise<{ success: boolean; error?: string }>,
    },
  },

  // ========== 全局快捷键 API ==========
  shortcut: {
    getAll: () =>
      ipcRenderer.invoke('shortcut:get-all') as Promise<Array<{ id: string; pluginId: string; label: string; accelerator: string }>>,
    update: (id: string, newAccelerator: string) =>
      ipcRenderer.invoke('shortcut:update', id, newAccelerator) as Promise<{ conflict: boolean; existing?: { pluginId: string; label: string } }>,
    reset: (id: string) =>
      ipcRenderer.invoke('shortcut:reset', id) as Promise<void>,
  },

  // ========== 日志查看器 API ==========
  log: {
    get: (filter?: any) => ipcRenderer.invoke('log:get', filter) as Promise<any[]>,
    clear: () => ipcRenderer.invoke('log:clear') as Promise<void>,
  },

  // ========== 插件依赖管理 API ==========
  dependency: {
    checkAll: () =>
      ipcRenderer.invoke('dep:check-all') as Promise<{ valid: boolean; errors: { pluginId: string; errors: string[] }[] }>,
    resolve: (pluginId: string) =>
      ipcRenderer.invoke('dep:resolve', pluginId) as Promise<{ resolved: any; errors: string[] }>,
  },

  // ========== 性能监控 API ==========
  perf: {
    getStats: () => ipcRenderer.invoke('perf:get-stats') as Promise<{ pluginStats: Array<{ pluginId: string; cpuPercent: number; memoryMB: number; lastUpdated: string }>; overallStats: { cpuPercent: number; memoryMB: number; heapUsedMB: number; heapTotalMB: number } }>,
    getOverall: () => ipcRenderer.invoke('perf:get-overall') as Promise<{ cpuPercent: number; memoryMB: number; heapUsedMB: number; heapTotalMB: number }>,
  },

  // ========== 主题配置 API ==========
  theme: {
    loadConfig: () =>
      ipcRenderer.invoke('theme:load-config') as Promise<ThemeConfig>,
    saveConfig: (config: ThemeConfig) =>
      ipcRenderer.invoke('theme:save-config', config) as Promise<void>,
  },

  // ========== 配置备份/恢复 API ==========
  configBackup: {
    exportBackup: () =>
      ipcRenderer.invoke('config-backup:export') as Promise<{ success: boolean; filePath?: string; error?: string }>,
    importBackup: () =>
      ipcRenderer.invoke('config-backup:import') as Promise<{ success: boolean; restored: number; errors: string[] }>,
    collect: () =>
      ipcRenderer.invoke('config-backup:collect') as Promise<Array<{ id: string; name: string; version: string }>>,
  },

  // ========== 插件目录配置 API ==========
  pluginDir: {
    get: () =>
      ipcRenderer.invoke('plugin-dir:get') as Promise<{ customDir: string; effectiveDir: string; defaultDir: string }>,
    select: () =>
      ipcRenderer.invoke('plugin-dir:select') as Promise<{ success: boolean; error?: string; path: string }>,
    set: (dir: string) =>
      ipcRenderer.invoke('plugin-dir:set', dir) as Promise<{ success: boolean; error?: string }>,
    onReloaded: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('plugins:reloaded', handler)
      return () => { ipcRenderer.removeListener('plugins:reloaded', handler) }
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api