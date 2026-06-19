// IPC 通道名称
export const IPC_CHANNELS = {
  // 应用
  APP_GET_VERSION: 'app:get-version',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_IS_MAXIMIZED: 'app:is-maximized',
  APP_CLOSE: 'app:close',

  // Plugin Manager
  PLUGIN_GET_LOADED: 'plugin:get-loaded',
} as const

// 插件 manifest（内置通用字段）
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  icon: string
  color: string
  bg: string
  enabled: boolean
  builtIn: boolean
  pages: PluginPage[]
  useHostStyles?: boolean
}

export interface PluginPage {
  id: string
  name: string
  icon: string
}

// 插件 API 类型
export interface PluginMainContext {
  app: Electron.App
  getMainWindow: () => Electron.BrowserWindow | null
  getToolsetPreloadPath: () => string
  registerIpcHandler: (channel: string, handler: (...args: any[]) => any) => void
  registerProtocol: (scheme: string, handler: (request: Request) => Response | Promise<Response>) => void
  onAppReady: (callback: () => void) => void
  onBeforeQuit: (callback: () => void) => void
  onWindowAllClosed: (callback: () => void) => void
  logger: {
    info: (tag: string, message: string) => void
    warn: (tag: string, message: string) => void
    error: (tag: string, message: string) => void
  }
  updateTrayMenu: (menuTemplate: Electron.MenuItemConstructorOptions[]) => void
  addTrayClickHandler: (handler: () => void) => void
}

export interface PluginMainEntry {
  name: string
  version: string
  register: (context: PluginMainContext) => void
}

declare global {
  interface Window {
    __PLUGIN_REGISTRY__: Record<string, Record<string, React.ComponentType<any>>>
  }
}