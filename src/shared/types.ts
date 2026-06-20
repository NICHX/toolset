// 平台公共类型（从共享包导入）
export type {
  PluginConfigAPI,
  PluginEventsAPI,
  PluginMetaAPI,
  PluginManifest,
  PluginPage,
  PluginMainContext,
  PluginMainEntry,
  PluginDependency,
  PluginUpdateInfo,
} from '@toolsets/shared'

export { SYSTEM_EVENTS } from '@toolsets/shared'

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

declare global {
  interface Window {
    __PLUGIN_REGISTRY__: Record<string, Record<string, React.ComponentType<any>>>
  }
}