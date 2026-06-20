import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import type { PluginMainContext, PluginMainEntry, PluginManifest, PluginEventsAPI, PluginMetaAPI } from '../shared/types'
import { logger } from './logger'
import { PluginConfig } from './plugin-config'
import { PluginRegistry } from './plugin-registry'
import { eventBus } from './event-bus'

// ========== Schema 校验 ==========

interface ValidationResult {
  valid: boolean
  errors: string[]
}

/** 校验 plugin.json 的必要字段 */
function validateManifest(raw: unknown): ValidationResult {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'] }
  }

  const obj = raw as Record<string, unknown>

  const requiredStrings = ['id', 'name', 'version', 'description', 'icon', 'color', 'bg'] as const
  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string' || !obj[key]) {
      errors.push(`"${key}" is required and must be a non-empty string`)
    }
  }

  if (obj.pages !== undefined) {
    if (!Array.isArray(obj.pages)) {
      errors.push('"pages" must be an array')
    } else {
      for (let i = 0; i < obj.pages.length; i++) {
        const page = obj.pages[i]
        if (!page || typeof page !== 'object') {
          errors.push(`pages[${i}] must be an object`)
        } else {
          const p = page as Record<string, unknown>
          if (typeof p.id !== 'string' || !p.id) errors.push(`pages[${i}].id is required and must be a non-empty string`)
          if (typeof p.name !== 'string' || !p.name) errors.push(`pages[${i}].name is required and must be a non-empty string`)
          if (typeof p.icon !== 'string' || !p.icon) errors.push(`pages[${i}].icon is required and must be a non-empty string`)
        }
      }
    }
  } else {
    errors.push('"pages" is required and must be an array')
  }

  if (obj.permissions !== undefined && !Array.isArray(obj.permissions)) {
    errors.push('"permissions" must be an array')
  }

  return { valid: errors.length === 0, errors }
}

interface PluginLifecycle {
  onEnable: Set<() => void>
  onDisable: Set<() => void>
  onInstall: Set<() => void>
  onUninstall: Set<() => void>
}

interface LoadedPlugin {
  manifest: PluginManifest
  entry: PluginMainEntry
  baseDir: string
  config: PluginConfig
  lifecycle: PluginLifecycle
  /** 插件注册的 IPC channel 列表，卸载时逐一清理 */
  registeredIpcChannels: Set<string>
  /** 插件注册的清理函数列表，卸载时逐一执行 */
  cleanupFns: (() => void)[]
}

export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private customTrayHandlers: (() => void)[] = []
  private _registry: PluginRegistry | null = null

  /** 设置注册表实例（在 loadAll 前调用） */
  setRegistry(registry: PluginRegistry): void {
    this._registry = registry
  }

  private get registry(): PluginRegistry {
    if (!this._registry) {
      throw new Error('PluginRegistry not initialized. Call setRegistry() before loadAll().')
    }
    return this._registry
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private makeLifecycle(): PluginLifecycle {
    return {
      onEnable: new Set(),
      onDisable: new Set(),
      onInstall: new Set(),
      onUninstall: new Set(),
    }
  }

  async loadAll(pluginsDir: string) {
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
      return
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
    const loadPromises: Promise<void>[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      loadPromises.push(
        this.loadSinglePlugin(path.join(pluginsDir, entry.name)).then(() => {}),
      )
    }
    await Promise.all(loadPromises)

    // 创建系统托盘
    this.createTray()
  }

  /** 只加载指定插件（安装后增量加载用） */
  async loadSingle(pluginsDir: string, pluginId: string): Promise<boolean> {
    const pluginPath = path.join(pluginsDir, pluginId)
    if (!fs.existsSync(pluginPath)) return false
    return this.loadSinglePlugin(pluginPath)
  }

  /** 加载单个插件目录，返回是否成功加载到 map */
  private async loadSinglePlugin(pluginDir: string): Promise<boolean> {
    const pluginId = path.basename(pluginDir)

    // 跳过已经加载的插件，避免重复注册 IPC handler
    if (this.plugins.has(pluginId)) {
      logger.info('PluginLoader', `Plugin "${pluginId}" already loaded, skipping`)
      return false
    }

    // 读取 manifest
    const manifestPath = path.join(pluginDir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return false

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const validation = validateManifest(parsed)
      if (!validation.valid) {
        logger.error('PluginLoader', `Invalid plugin.json for "${pluginId}": ${validation.errors.join('; ')}`)
        return false
      }
      const manifest = parsed as PluginManifest
      manifest.enabled = manifest.enabled ?? true

      // 用注册表中的状态覆盖 manifest 中的 enabled（注册表是运行时源）
      this.registry.applyToManifest(manifest)

      const baseDir = pluginDir
      const config = new PluginConfig(baseDir)

      const addDummy = (errMsg?: string) => {
        this.plugins.set(manifest.id, { manifest, entry: { name: manifest.name, version: manifest.version, register: () => {} }, baseDir, config, lifecycle: this.makeLifecycle(), registeredIpcChannels: new Set(), cleanupFns: [] })
        if (errMsg) logger.warn('PluginLoader', `Plugin "${manifest.id}" added with dummy entry: ${errMsg}`)
      }

      // 加载主进程入口（使用动态 import() 异步加载，避免阻塞主进程）
      const mainEntryPath = path.join(pluginDir, 'main', 'index.js')
      if (fs.existsSync(mainEntryPath)) {
        try {
          // 使用 file:// URL + 时间戳参数绕过模块缓存
          const moduleUrl = pathToFileURL(mainEntryPath)
          moduleUrl.searchParams.set('v', Date.now().toString())
          const mod = await import(/* @vite-ignore */ moduleUrl.href)
          const pluginMain = (mod.default || mod) as PluginMainEntry
          const lifecycle = this.makeLifecycle()
          this.plugins.set(manifest.id, { manifest, entry: pluginMain, baseDir, config, lifecycle, registeredIpcChannels: new Set(), cleanupFns: [] })

          // 创建插件上下文
          const ctx = this.createPluginContext(manifest, config, lifecycle)
          pluginMain.register(ctx)
          logger.info('PluginLoader', `Loaded plugin: ${manifest.id} (${manifest.name})`)
        } catch (loadErr) {
          console.error('[PluginLoader] Failed to load main entry for plugin:', manifest.id, loadErr)
          addDummy(`main entry load failed: ${(loadErr as Error).message || loadErr}`)
        }
      } else {
        logger.info('PluginLoader', `No main entry for plugin: ${manifest.id}, skipping main process`)
        addDummy()
      }

      return true
    } catch (err) {
      logger.error('PluginLoader', `Failed to load plugin from ${manifestPath}:`, err)
      return false
    }
  }

  /** 检查插件是否拥有指定权限 */
  private hasPermission(manifest: PluginManifest, permission: string): boolean {
    return (manifest.permissions || []).includes(permission)
  }

  /** 检查并返回受权限控制的 API，无权则返回 undefined */
  private permittedOrUndefined<T>(manifest: PluginManifest, permission: string, api: T): T | undefined {
    return this.hasPermission(manifest, permission) ? api : undefined
  }

  private createPluginContext(manifest: PluginManifest, config: PluginConfig, lifecycle: PluginLifecycle): PluginMainContext {
    // 获取该插件在 map 中的记录，用于追踪资源
    const plugin = this.plugins.get(manifest.id)

    const getPlugin = () => {
      // createPluginContext 调用时插件可能尚未写入 map（首次加载时已写入，此处复用）
      return plugin ?? this.plugins.get(manifest.id)
    }

    // 构建 events API（始终可用），追踪订阅以便卸载时清理
    const events: PluginEventsAPI = {
      emit: (eventName, data) => eventBus.emit(eventName, data),
      on: (eventName, handler) => {
        const unsubscribe = eventBus.on(eventName, handler)
        const p = getPlugin()
        if (p) p.cleanupFns.push(unsubscribe)
        return unsubscribe
      },
      once: (eventName, handler) => {
        eventBus.once(eventName, handler)
      },
      off: (eventName, handler) => eventBus.off(eventName, handler),
    }

    // 构建 meta API（始终可用）
    const meta: PluginMetaAPI = {
      self: () => ({ ...manifest }),
      getPlugin: (pluginId) => this.plugins.get(pluginId)?.manifest ? { ...this.plugins.get(pluginId)!.manifest } : undefined,
      getAllPlugins: () => Array.from(this.plugins.values()).map((p) => ({ ...p.manifest })),
      isPluginEnabled: (pluginId) => this.plugins.get(pluginId)?.manifest.enabled ?? false,
    }

    const perms = manifest.permissions || []

    return {
      // 始终可用的核心 API
      // app 始终对所有插件可用，无需权限检查
      app,

      getMainWindow: () => this.mainWindow,
      getToolsetPreloadPath: () => path.join(__dirname, '../preload/index.js'),

      // IPC handler 注册（追踪 channel 以便卸载时清理）
      registerIpcHandler: (channel, handler) => {
        if (!this.hasPermission(manifest, 'register-ipc') && !manifest.builtIn) {
          logger.warn('PluginLoader', `Plugin "${manifest.id}" attempted to register IPC handler without 'register-ipc' permission`)
          return
        }
        try { ipcMain.removeHandler(channel) } catch { /* ignore */ }
        ipcMain.handle(channel, handler)
        const p = getPlugin()
        if (p) p.registeredIpcChannels.add(channel)
      },

      // 自定义协议
      registerProtocol: (scheme, handler) => {
        if (!this.hasPermission(manifest, 'register-protocol') && !manifest.builtIn) {
          logger.warn('PluginLoader', `Plugin "${manifest.id}" attempted to register protocol without 'register-protocol' permission`)
          return
        }
        try {
          protocol.handle(scheme, handler)
        } catch (e) {
          logger.warn('PluginLoader', `Protocol ${scheme} already registered`)
        }
      },

      onAppReady: (callback) => {
        if (app.isReady()) {
          callback()
        } else {
          app.on('ready', callback)
        }
      },
      onBeforeQuit: (callback) => {
        app.on('before-quit', callback)
      },
      onWindowAllClosed: (callback) => {
        app.on('window-all-closed', callback)
      },

      logger: {
        info: (tag, message) => logger.info(`${manifest.name}:${tag}`, message),
        warn: (tag, message) => logger.warn(`${manifest.name}:${tag}`, message),
        error: (tag, message) => logger.error(`${manifest.name}:${tag}`, message),
      },

      // 系统托盘（要求 tray 权限）
      updateTrayMenu: (menuTemplate) => {
        if (!this.hasPermission(manifest, 'tray') && !manifest.builtIn) {
          logger.warn('PluginLoader', `Plugin "${manifest.id}" attempted to update tray menu without 'tray' permission`)
          return
        }
        if (this.tray) {
          const contextMenu = Menu.buildFromTemplate(menuTemplate)
          this.tray.setContextMenu(contextMenu)
        }
      },
      addTrayClickHandler: (handler) => {
        if (!this.hasPermission(manifest, 'tray') && !manifest.builtIn) {
          logger.warn('PluginLoader', `Plugin "${manifest.id}" attempted to add tray handler without 'tray' permission`)
          return
        }
        this.customTrayHandlers.push(handler)
      },

      // 配置管理
      config,

      // 事件总线
      events,

      // 元信息查询
      meta,

      // ========== 生命周期钩子 ==========
      onEnable: (callback) => { lifecycle.onEnable.add(callback) },
      onDisable: (callback) => { lifecycle.onDisable.add(callback) },
      onInstall: (callback) => { lifecycle.onInstall.add(callback) },
      onUninstall: (callback) => { lifecycle.onUninstall.add(callback) },
    }
  }

  // ========== 生命周期触发器 ==========

  /** 触发插件启用回调 */
  triggerEnable(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return
    for (const cb of plugin.lifecycle.onEnable) {
      try { cb() } catch (e) { logger.error('Lifecycle', `onEnable error for "${pluginId}": ${e}`) }
    }
  }

  /** 触发插件禁用回调 */
  triggerDisable(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return
    for (const cb of plugin.lifecycle.onDisable) {
      try { cb() } catch (e) { logger.error('Lifecycle', `onDisable error for "${pluginId}": ${e}`) }
    }
  }

  /** 触发插件安装回调 */
  triggerInstall(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return
    for (const cb of plugin.lifecycle.onInstall) {
      try { cb() } catch (e) { logger.error('Lifecycle', `onInstall error for "${pluginId}": ${e}`) }
    }
  }

  /** 触发插件卸载回调 */
  triggerUninstall(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return
    for (const cb of plugin.lifecycle.onUninstall) {
      try { cb() } catch (e) { logger.error('Lifecycle', `onUninstall error for "${pluginId}": ${e}`) }
    }
  }

  /** 获取指定插件的配置管理器 */
  getPluginConfig(pluginId: string): PluginConfig | undefined {
    return this.plugins.get(pluginId)?.config
  }

  private createTray() {
    let iconPath: string | undefined
    const paths = [
      path.join(__dirname, '../../assets/tray-icon.png'),
      path.join(__dirname, '../assets/tray-icon.png'),
      path.join(process.resourcesPath || '', 'assets/tray-icon.png'),
    ]

    for (const p of paths) {
      if (fs.existsSync(p)) {
        iconPath = p
        break
      }
    }

    const icon = iconPath
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16, quality: 'best' })
      : nativeImage.createEmpty()

    this.tray = new Tray(icon)
    this.tray.setToolTip('工具集')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show()
            this.mainWindow.focus()
          }
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.tray?.destroy()
          this.tray = null
          app.quit()
        },
      },
    ])

    // 左键点击：切换窗口显示/隐藏，不弹出菜单
    if (process.platform === 'darwin') {
      this.tray.on('mouse-down', () => this.onTrayClick())
    } else {
      this.tray.on('click', () => this.onTrayClick())
    }

    // 右键点击：弹出菜单（不在 setContextMenu 设置，避免左键也弹出）
    this.tray.on('right-click', () => {
      this.tray?.popUpContextMenu(contextMenu)
    })
  }

  private onTrayClick() {
    for (const handler of this.customTrayHandlers) {
      handler()
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide()
    } else {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  getManifests(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest)
  }

  getPluginIds(): string[] {
    return Array.from(this.plugins.keys())
  }

  getRendererScripts(): { id: string; jsPath: string; cssPath: string }[] {
    return Array.from(this.plugins.entries()).map(([id, plugin]) => ({
      id,
      jsPath: `plugin://${id}/renderer/index.js`,
      cssPath: `plugin://${id}/renderer/index.css`,
    }))
  }

  removePlugin(id: string) {
    const plugin = this.plugins.get(id)
    if (!plugin) return

    // 清理 IPC handlers
    for (const channel of plugin.registeredIpcChannels) {
      try { ipcMain.removeHandler(channel) } catch { /* ignore */ }
    }

    // 清理配置管理器（清除定时器并写盘）
    plugin.config.destroy()

    // 执行所有清理函数（事件监听器取消订阅等）
    for (const fn of plugin.cleanupFns) {
      try { fn() } catch (e) { logger.error('PluginLoader', `Cleanup error for "${id}": ${e}`) }
    }

    this.plugins.delete(id)
  }

  /**
   * 从注册表和内存中移除插件（卸载时用）
   * IPC handler 清理 + 清理函数 + 注册表移除
   */
  unregisterPlugin(id: string): void {
    this.removePlugin(id)
    this.registry.unregisterPlugin(id)
  }

  getPlugin(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id)
  }

  applyStates(states: Record<string, boolean>) {
    // 更新内存中的 manifest
    for (const [id, plugin] of this.plugins) {
      if (id in states) {
        plugin.manifest.enabled = states[id]
      }
    }
    // 持久化到注册表
    this.registry.setAllEnabled(states)
  }

  beforeQuit() {
    // Cleanup handled by individual plugin before-quit hooks
  }

  clearAll() {
    this.plugins.clear()
    this.customTrayHandlers = []
    eventBus.clearAll()
    this.registry.clear()
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}