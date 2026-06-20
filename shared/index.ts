// ==================== 插件配置 API ====================

export interface PluginConfigAPI {
  get: <T>(key: string, defaultValue?: T) => T
  set: <T>(key: string, value: T) => void
  getAll: () => Record<string, any>
  update: (partial: Record<string, any>) => void
  reset: (key?: string) => void
  onChanged: (callback: (changes: Record<string, any>) => void) => () => void
}

// ==================== 插件事件总线 ====================

export interface PluginEventsAPI {
  emit: (eventName: string, data?: any) => void
  on: (eventName: string, handler: (data: any) => void) => () => void
  once: (eventName: string, handler: (data: any) => void) => void
  off: (eventName: string, handler: (data: any) => void) => void
}

// ==================== 插件元信息 API ====================

export interface PluginMetaAPI {
  self: () => PluginManifest
  getPlugin: (pluginId: string) => PluginManifest | undefined
  getAllPlugins: () => PluginManifest[]
  isPluginEnabled: (pluginId: string) => boolean
}

// ==================== 插件 Manifest ====================

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
  permissions?: string[]
  /** 最低平台版本要求 */
  minimumToolsetVersion?: string
  /** 插件依赖声明 */
  dependencies?: PluginDependency[]
}

export interface PluginPage {
  id: string
  name: string
  icon: string
}

// ==================== 插件更新（本地文件包方式） ====================

/** 更新检查结果 */
export interface PluginUpdateInfo {
  pluginId: string
  pluginName: string
  currentVersion: string
  newVersion: string
  newDescription?: string
  changelog?: string
}

// ==================== 插件依赖 ====================

export interface PluginDependency {
  id: string
  version: string
  optional?: boolean
}

// ==================== 插件主进程上下文 ====================

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
  /** 插件配置管理（平台提供，持久化到 config.json） */
  config: PluginConfigAPI
  /** 全局事件总线 */
  events: PluginEventsAPI
  /** 插件元信息查询 */
  meta: PluginMetaAPI
  /** 插件从禁用→启用时回调 */
  onEnable: (callback: () => void) => void
  /** 插件从启用→禁用时回调 */
  onDisable: (callback: () => void) => void
  /** 插件首次安装时回调 */
  onInstall: (callback: () => void) => void
  /** 插件卸载前回调 */
  onUninstall: (callback: () => void) => void
  /** 注册全局快捷键 */
  registerShortcut: (id: string, label: string, accelerator: string, action: () => void) => { conflict: boolean; existing?: { pluginId: string; label: string } }
}

export interface PluginMainEntry {
  name: string
  version: string
  register: (context: PluginMainContext) => void
}

// ==================== 预定义系统事件 ====================

export const SYSTEM_EVENTS = {
  THEME_CHANGED: 'system:theme-changed',
  WINDOW_STATE_CHANGED: 'system:window-state-changed',
  APP_FOCUS: 'system:app-focus',
  APP_BLUR: 'system:app-blur',
  PLUGIN_ENABLED: 'plugin:enabled',
  PLUGIN_DISABLED: 'plugin:disabled',
  PLUGIN_INSTALLED: 'plugin:installed',
  PLUGIN_UNINSTALLED: 'plugin:uninstalled',
} as const