export const PLUGIN_IPC_CHANNELS = {
  GET_MAIN_API: 'plugin:get-main-api',
  RENDERER_READY: 'plugin:renderer-ready',

  // 插件配置 API
  CONFIG_GET: 'plugin:config-get',
  CONFIG_SET: 'plugin:config-set',
  CONFIG_GET_ALL: 'plugin:config-get-all',
  CONFIG_UPDATE: 'plugin:config-update',
  CONFIG_RESET: 'plugin:config-reset',

  // 插件事件总线
  EVENTS_EMIT: 'plugin:events-emit',

  // 插件元信息
  META_GET_PLUGIN: 'plugin:meta-get-plugin',
  META_GET_ALL: 'plugin:meta-get-all',
  META_IS_ENABLED: 'plugin:meta-is-enabled',
} as const
