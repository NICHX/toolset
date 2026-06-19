import { contextBridge, ipcRenderer } from 'electron'

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
    getLoaded: () =>
      ipcRenderer.invoke('plugin:get-loaded') as Promise<any[]>,
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
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api